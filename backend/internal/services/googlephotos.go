package services

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
)

const (
	photosAPIBase = "https://photoslibrary.googleapis.com/v1"
	urlTTL        = 55 * time.Minute
)

type GooglePhotosService struct {
	config  *oauth2.Config
	albumID string
	db      *pgxpool.Pool
}

func NewGooglePhotosService(clientID, clientSecret, redirectURL, albumID string, db *pgxpool.Pool) *GooglePhotosService {
	cfg := &oauth2.Config{
		ClientID:     clientID,
		ClientSecret: clientSecret,
		RedirectURL:  redirectURL,
		Scopes:       []string{"https://www.googleapis.com/auth/photoslibrary.readonly"},
		Endpoint:     google.Endpoint,
	}
	return &GooglePhotosService{config: cfg, albumID: albumID, db: db}
}

func (s *GooglePhotosService) AuthURL() string {
	return s.config.AuthCodeURL("state-token", oauth2.AccessTypeOffline, oauth2.ApprovalForce)
}

func (s *GooglePhotosService) ExchangeCode(ctx context.Context, code string) error {
	token, err := s.config.Exchange(ctx, code)
	if err != nil {
		return fmt.Errorf("exchange code: %w", err)
	}
	_, err = s.db.Exec(ctx, `
		INSERT INTO google_tokens (id, access_token, refresh_token, token_expiry, updated_at)
		VALUES (1, $1, $2, $3, NOW())
		ON CONFLICT (id) DO UPDATE
		SET access_token = $1, refresh_token = $2, token_expiry = $3, updated_at = NOW()
	`, token.AccessToken, token.RefreshToken, token.Expiry)
	return err
}

func (s *GooglePhotosService) getClient(ctx context.Context) (*http.Client, error) {
	var accessToken, refreshToken string
	var expiry time.Time
	err := s.db.QueryRow(ctx,
		"SELECT access_token, refresh_token, token_expiry FROM google_tokens WHERE id = 1",
	).Scan(&accessToken, &refreshToken, &expiry)
	if err != nil {
		return nil, fmt.Errorf("no google token stored — run the OAuth flow first: %w", err)
	}

	stored := &oauth2.Token{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		Expiry:       expiry,
	}
	tokenSource := s.config.TokenSource(ctx, stored)
	fresh, err := tokenSource.Token()
	if err != nil {
		return nil, fmt.Errorf("refresh token: %w", err)
	}
	if fresh.AccessToken != accessToken {
		_, _ = s.db.Exec(ctx,
			"UPDATE google_tokens SET access_token = $1, token_expiry = $2, updated_at = NOW() WHERE id = 1",
			fresh.AccessToken, fresh.Expiry,
		)
	}
	return oauth2.NewClient(ctx, oauth2.StaticTokenSource(fresh)), nil
}

type mediaItem struct {
	ID       string `json:"id"`
	BaseURL  string `json:"baseUrl"`
	Filename string `json:"filename"`
	MimeType string `json:"mimeType"`
}

type searchResponse struct {
	MediaItems    []mediaItem `json:"mediaItems"`
	NextPageToken string      `json:"nextPageToken"`
}

func (s *GooglePhotosService) SyncAlbum(ctx context.Context) (int, error) {
	client, err := s.getClient(ctx)
	if err != nil {
		return 0, err
	}

	total := 0
	pageToken := ""
	expiresAt := time.Now().Add(urlTTL)

	for {
		body := map[string]any{"albumId": s.albumID, "pageSize": 100}
		if pageToken != "" {
			body["pageToken"] = pageToken
		}
		jsonBody, _ := json.Marshal(body)

		resp, err := client.Post(photosAPIBase+"/mediaItems:search", "application/json", bytes.NewReader(jsonBody))
		if err != nil {
			return total, fmt.Errorf("search media items: %w", err)
		}
		data, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			return total, err
		}
		if resp.StatusCode != http.StatusOK {
			return total, fmt.Errorf("google photos API %d: %s", resp.StatusCode, string(data))
		}

		var result searchResponse
		if err := json.Unmarshal(data, &result); err != nil {
			return total, fmt.Errorf("decode response: %w", err)
		}

		for _, item := range result.MediaItems {
			switch item.MimeType {
			case "image/jpeg", "image/png", "image/heic", "image/heif", "image/webp":
			default:
				continue
			}
			if _, err := s.db.Exec(ctx, `
				INSERT INTO photos (google_photos_id, base_url, url_expires_at, filename)
				VALUES ($1, $2, $3, $4)
				ON CONFLICT (google_photos_id) DO UPDATE
				SET base_url = $2, url_expires_at = $3, filename = $4
			`, item.ID, item.BaseURL, expiresAt, item.Filename); err != nil {
				return total, fmt.Errorf("upsert photo %s: %w", item.ID, err)
			}
			total++
		}

		if result.NextPageToken == "" {
			break
		}
		pageToken = result.NextPageToken
	}
	return total, nil
}

func (s *GooglePhotosService) RefreshPhotoURL(ctx context.Context, photoID string) (string, time.Time, error) {
	client, err := s.getClient(ctx)
	if err != nil {
		return "", time.Time{}, err
	}

	var googlePhotosID string
	if err := s.db.QueryRow(ctx,
		"SELECT google_photos_id FROM photos WHERE id = $1", photoID,
	).Scan(&googlePhotosID); err != nil {
		return "", time.Time{}, err
	}

	resp, err := client.Get(fmt.Sprintf("%s/mediaItems/%s", photosAPIBase, googlePhotosID))
	if err != nil {
		return "", time.Time{}, err
	}
	defer resp.Body.Close()

	var item mediaItem
	if err := json.NewDecoder(resp.Body).Decode(&item); err != nil {
		return "", time.Time{}, err
	}

	return item.BaseURL, time.Now().Add(urlTTL), nil
}
