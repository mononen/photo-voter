package handlers

import (
	"fmt"
	"io"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"photo-voter/internal/services"
)

type PhotosHandler struct {
	db *pgxpool.Pool
	gp *services.GooglePhotosService
}

func NewPhotosHandler(db *pgxpool.Pool, gp *services.GooglePhotosService) *PhotosHandler {
	return &PhotosHandler{db: db, gp: gp}
}

func (h *PhotosHandler) Next(c fiber.Ctx) error {
	userID := c.Locals("userID").(string)

	var id string
	err := h.db.QueryRow(c.Context(), `
		SELECT p.id
		FROM photos p
		LEFT JOIN (
			SELECT photo_id, COUNT(*) AS total_votes
			FROM votes
			GROUP BY photo_id
		) vc ON vc.photo_id = p.id
		WHERE p.id NOT IN (SELECT photo_id FROM votes WHERE user_id = $1)
		ORDER BY COALESCE(vc.total_votes, 0) ASC, RANDOM()
		LIMIT 1
	`, userID).Scan(&id)

	if err == pgx.ErrNoRows {
		return c.SendStatus(fiber.StatusNoContent)
	}
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal error"})
	}

	return c.JSON(fiber.Map{"id": id})
}

// ProxyImage fetches the photo from Google using the stored OAuth token and
// streams it to the client. This is necessary because Picker API base URLs
// require an Authorization header and cannot be loaded directly in <img> tags.
func (h *PhotosHandler) ProxyImage(c fiber.Ctx) error {
	photoID := c.Params("id")
	size := c.Query("size", "full")

	var baseURL string
	var urlExpiresAt time.Time
	var googlePhotosID string
	var pickerSessionID *string
	if err := h.db.QueryRow(c.Context(),
		"SELECT base_url, url_expires_at, google_photos_id, picker_session_id FROM photos WHERE id = $1", photoID,
	).Scan(&baseURL, &urlExpiresAt, &googlePhotosID, &pickerSessionID); err != nil {
		return c.SendStatus(fiber.StatusNotFound)
	}

	sessionID := ""
	if pickerSessionID != nil {
		sessionID = *pickerSessionID
	}

	if time.Now().After(urlExpiresAt) {
		fresh, err := h.gp.RefreshSessionURLs(c.Context(), sessionID, googlePhotosID)
		if err != nil {
			return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": "photo URL expired and could not be refreshed: " + err.Error()})
		}
		baseURL = fresh
	}

	var sizeParam string
	switch {
	case size == "thumb":
		sizeParam = "=w400-h400-c"
	case c.Query("w") != "":
		w := clampDim(c.Query("w"), 4096)
		h := clampDim(c.Query("h"), 4096)
		sizeParam = fmt.Sprintf("=w%d-h%d", w, h)
	default:
		sizeParam = "=w1920-h1080"
	}

	client, err := h.gp.GetHTTPClient(c.Context())
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	resp, err := client.Get(baseURL + sizeParam)
	if err != nil {
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": err.Error()})
	}

	// If Google rejects the URL (expired base URL), refresh and retry once.
	if resp.StatusCode == 401 || resp.StatusCode == 403 || resp.StatusCode == 410 {
		resp.Body.Close()
		fresh, refreshErr := h.gp.RefreshSessionURLs(c.Context(), sessionID, googlePhotosID)
		if refreshErr != nil {
			return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": "photo URL expired and could not be refreshed: " + refreshErr.Error()})
		}
		baseURL = fresh
		resp, err = client.Get(baseURL + sizeParam)
		if err != nil {
			return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": err.Error()})
		}
	}
	defer resp.Body.Close()

	c.Set("Content-Type", resp.Header.Get("Content-Type"))
	c.Set("Cache-Control", "private, max-age=3600")
	c.Status(resp.StatusCode)
	_, err = io.Copy(c.Response().BodyWriter(), resp.Body)
	return err
}

func (h *PhotosHandler) Batch(c fiber.Ctx) error {
	userID := c.Locals("userID").(string)

	// Check if any photos have capture_time populated. If none do (cold start
	// before a re-import), fall back to returning a small filename-ordered slice.
	var captureCount int
	_ = h.db.QueryRow(c.Context(), "SELECT COUNT(*) FROM photos WHERE capture_time IS NOT NULL").Scan(&captureCount)

	type batchPhoto struct {
		ID       string `json:"id"`
		Filename string `json:"filename"`
	}

	if captureCount == 0 {
		// Fallback: least-voted photo that the user hasn't voted on, just like /next.
		var id, filename string
		err := h.db.QueryRow(c.Context(), `
			SELECT p.id, COALESCE(p.filename, '')
			FROM photos p
			LEFT JOIN (
				SELECT photo_id, COUNT(*) AS total_votes
				FROM votes
				GROUP BY photo_id
			) vc ON vc.photo_id = p.id
			WHERE p.id NOT IN (SELECT photo_id FROM votes WHERE user_id = $1)
			ORDER BY COALESCE(vc.total_votes, 0) ASC, RANDOM()
			LIMIT 1
		`, userID).Scan(&id, &filename)
		if err == pgx.ErrNoRows {
			return c.SendStatus(fiber.StatusNoContent)
		}
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal error"})
		}
		return c.JSON(fiber.Map{"photos": []batchPhoto{{ID: id, Filename: filename}}})
	}

	rows, err := h.db.Query(c.Context(), `
		WITH ordered AS (
			SELECT id, filename, capture_time,
			       LAG(capture_time) OVER (ORDER BY capture_time, filename) AS prev_time
			FROM photos
		),
		bursts AS (
			SELECT id, filename, capture_time,
			       SUM(CASE
			           WHEN prev_time IS NULL THEN 1
			           WHEN capture_time - prev_time > INTERVAL '5 seconds' THEN 1
			           ELSE 0
			       END) OVER (ORDER BY capture_time, filename) AS burst_id
			FROM ordered
		),
		burst_stats AS (
			SELECT b.burst_id,
			       COUNT(DISTINCT b.id)            AS total_in_burst,
			       COUNT(DISTINCT v_user.photo_id) AS user_voted,
			       COUNT(DISTINCT v_all.photo_id)  AS all_votes_in_burst
			FROM bursts b
			LEFT JOIN votes v_user ON v_user.photo_id = b.id AND v_user.user_id = $1
			LEFT JOIN votes v_all  ON v_all.photo_id  = b.id
			GROUP BY b.burst_id
		),
		target_burst AS (
			SELECT burst_id
			FROM burst_stats
			WHERE user_voted < total_in_burst
			ORDER BY all_votes_in_burst ASC, burst_id ASC
			LIMIT 1
		)
		SELECT b.id, COALESCE(b.filename, '')
		FROM bursts b
		WHERE b.burst_id = (SELECT burst_id FROM target_burst)
		ORDER BY b.capture_time, b.filename
	`, userID)

	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal error"})
	}
	defer rows.Close()

	photos := make([]batchPhoto, 0)
	for rows.Next() {
		var p batchPhoto
		if err := rows.Scan(&p.ID, &p.Filename); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal error"})
		}
		photos = append(photos, p)
	}

	if len(photos) == 0 {
		return c.SendStatus(fiber.StatusNoContent)
	}

	return c.JSON(fiber.Map{"photos": photos})
}

func (h *PhotosHandler) Rankings(c fiber.Ctx) error {
	rows, err := h.db.Query(c.Context(), `
		SELECT p.id, COALESCE(p.filename, '') AS filename,
		       COALESCE(SUM(v.vote), 0)::int AS score,
		       COUNT(v.id)::int AS vote_count
		FROM photos p
		LEFT JOIN votes v ON v.photo_id = p.id
		GROUP BY p.id
		ORDER BY score DESC, vote_count DESC
	`)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal error"})
	}
	defer rows.Close()

	type rankingEntry struct {
		ID        string `json:"id"`
		Filename  string `json:"filename"`
		Score     int    `json:"score"`
		VoteCount int    `json:"vote_count"`
	}

	results := make([]rankingEntry, 0)
	for rows.Next() {
		var r rankingEntry
		if err := rows.Scan(&r.ID, &r.Filename, &r.Score, &r.VoteCount); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal error"})
		}
		results = append(results, r)
	}
	return c.JSON(results)
}

func clampDim(s string, max int) int {
	v, err := strconv.Atoi(s)
	if err != nil || v <= 0 {
		return 1080
	}
	if v > max {
		return max
	}
	return v
}
