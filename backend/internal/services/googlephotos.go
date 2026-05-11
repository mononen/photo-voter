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
	pickerAPIBase = "https://photospicker.googleapis.com/v1"
	// Picker base URLs expire after ~1 h; store 23 h as a generous upper bound.
	// Re-run the picker if voting sessions outlast this.
	pickerURLTTL = 23 * time.Hour
)

type GooglePhotosService struct {
	config *oauth2.Config
	db     *pgxpool.Pool
}

func NewGooglePhotosService(clientID, clientSecret, redirectURL string, db *pgxpool.Pool) *GooglePhotosService {
	cfg := &oauth2.Config{
		ClientID:     clientID,
		ClientSecret: clientSecret,
		RedirectURL:  redirectURL,
		Scopes: []string{
			"openid",
			"https://www.googleapis.com/auth/userinfo.email",
			"https://www.googleapis.com/auth/photospicker.mediaitems.readonly",
		},
		Endpoint: google.Endpoint,
	}
	return &GooglePhotosService{config: cfg, db: db}
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

func (s *GooglePhotosService) IsOAuthConnected(ctx context.Context) bool {
	var connected bool
	_ = s.db.QueryRow(ctx,
		"SELECT EXISTS(SELECT 1 FROM google_tokens WHERE id = 1 AND refresh_token IS NOT NULL)",
	).Scan(&connected)
	return connected
}

func (s *GooglePhotosService) GetAuthorizedEmail(ctx context.Context) (string, error) {
	client, err := s.getClient(ctx)
	if err != nil {
		return "", err
	}
	resp, err := client.Get("https://www.googleapis.com/oauth2/v2/userinfo")
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	var info struct {
		Email string `json:"email"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil {
		return "", err
	}
	return info.Email, nil
}

func (s *GooglePhotosService) GetHTTPClient(ctx context.Context) (*http.Client, error) {
	return s.getClient(ctx)
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

// --- Picker API ---

type PickerSession struct {
	ID            string `json:"id"`
	PickerURI     string `json:"pickerUri"`
	MediaItemsSet bool   `json:"mediaItemsSet"`
	ExpireTime    string `json:"expireTime"`
}

type pickerMediaItem struct {
	ID        string `json:"id"`
	Type      string `json:"type"`
	MediaFile struct {
		BaseURL  string `json:"baseUrl"`
		MimeType string `json:"mimeType"`
		Filename string `json:"filename"`
	} `json:"mediaFile"`
}

type pickerMediaItemsResponse struct {
	MediaItems    []pickerMediaItem `json:"mediaItems"`
	NextPageToken string            `json:"nextPageToken"`
}

func (s *GooglePhotosService) CreatePickerSession(ctx context.Context) (*PickerSession, error) {
	client, err := s.getClient(ctx)
	if err != nil {
		return nil, err
	}
	resp, err := client.Post(pickerAPIBase+"/sessions", "application/json", bytes.NewReader([]byte("{}")))
	if err != nil {
		return nil, fmt.Errorf("create picker session: %w", err)
	}
	data, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("picker API %d: %s", resp.StatusCode, string(data))
	}
	var session PickerSession
	if err := json.Unmarshal(data, &session); err != nil {
		return nil, err
	}
	return &session, nil
}

func (s *GooglePhotosService) GetPickerSession(ctx context.Context, sessionID string) (*PickerSession, error) {
	client, err := s.getClient(ctx)
	if err != nil {
		return nil, err
	}
	resp, err := client.Get(pickerAPIBase + "/sessions/" + sessionID)
	if err != nil {
		return nil, err
	}
	data, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("picker API %d: %s", resp.StatusCode, string(data))
	}
	var session PickerSession
	if err := json.Unmarshal(data, &session); err != nil {
		return nil, err
	}
	return &session, nil
}

func (s *GooglePhotosService) ImportPickerSession(ctx context.Context, sessionID string) (int, error) {
	client, err := s.getClient(ctx)
	if err != nil {
		return 0, err
	}

	total := 0
	pageToken := ""
	expiresAt := time.Now().Add(pickerURLTTL)

	for {
		u := fmt.Sprintf("%s/mediaItems?sessionId=%s&pageSize=100", pickerAPIBase, sessionID)
		if pageToken != "" {
			u += "&pageToken=" + pageToken
		}
		resp, err := client.Get(u)
		if err != nil {
			return total, err
		}
		data, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			return total, fmt.Errorf("picker API %d: %s", resp.StatusCode, string(data))
		}
		var result pickerMediaItemsResponse
		if err := json.Unmarshal(data, &result); err != nil {
			return total, err
		}

		for _, item := range result.MediaItems {
			if item.Type != "PHOTO" {
				continue
			}
			switch item.MediaFile.MimeType {
			case "image/jpeg", "image/png", "image/heic", "image/heif", "image/webp":
			default:
				continue
			}
			if _, err := s.db.Exec(ctx, `
				INSERT INTO photos (google_photos_id, base_url, url_expires_at, filename)
				VALUES ($1, $2, $3, $4)
				ON CONFLICT (google_photos_id) DO UPDATE
				SET base_url = $2, url_expires_at = $3, filename = $4
			`, item.ID, item.MediaFile.BaseURL, expiresAt, item.MediaFile.Filename); err != nil {
				return total, fmt.Errorf("upsert photo %s: %w", item.ID, err)
			}
			total++
		}

		if result.NextPageToken == "" {
			break
		}
		pageToken = result.NextPageToken
	}

	// Clean up session after import (best-effort)
	req, _ := http.NewRequestWithContext(ctx, http.MethodDelete, pickerAPIBase+"/sessions/"+sessionID, nil)
	client.Do(req)

	return total, nil
}
