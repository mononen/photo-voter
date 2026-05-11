package handlers

import (
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"photo-voter/internal/services"
)

type PhotosHandler struct {
	db           *pgxpool.Pool
	googlePhotos *services.GooglePhotosService
}

func NewPhotosHandler(db *pgxpool.Pool, gp *services.GooglePhotosService) *PhotosHandler {
	return &PhotosHandler{db: db, googlePhotos: gp}
}

func (h *PhotosHandler) Next(c fiber.Ctx) error {
	userID := c.Locals("userID").(string)

	var id, baseURL string
	var urlExpiresAt time.Time
	err := h.db.QueryRow(c.Context(), `
		SELECT p.id, p.base_url, p.url_expires_at
		FROM photos p
		WHERE p.id NOT IN (SELECT photo_id FROM votes WHERE user_id = $1)
		ORDER BY RANDOM()
		LIMIT 1
	`, userID).Scan(&id, &baseURL, &urlExpiresAt)

	if err == pgx.ErrNoRows {
		return c.SendStatus(fiber.StatusNoContent)
	}
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal error"})
	}

	if time.Until(urlExpiresAt) < 30*time.Minute {
		if newURL, newExpiry, err := h.googlePhotos.RefreshPhotoURL(c.Context(), id); err == nil {
			baseURL = newURL
			_, _ = h.db.Exec(c.Context(),
				"UPDATE photos SET base_url = $1, url_expires_at = $2 WHERE id = $3",
				newURL, newExpiry, id,
			)
		}
	}

	return c.JSON(fiber.Map{
		"id":    id,
		"url":   baseURL + "=w1920-h1080",
		"thumb": baseURL + "=w400-h400-c",
	})
}

func (h *PhotosHandler) Rankings(c fiber.Ctx) error {
	rows, err := h.db.Query(c.Context(), `
		SELECT p.id, p.base_url, COALESCE(p.filename, '') AS filename,
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
		URL       string `json:"url"`
		Filename  string `json:"filename"`
		Score     int    `json:"score"`
		VoteCount int    `json:"vote_count"`
	}

	results := make([]rankingEntry, 0)
	for rows.Next() {
		var r rankingEntry
		var baseURL string
		if err := rows.Scan(&r.ID, &baseURL, &r.Filename, &r.Score, &r.VoteCount); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal error"})
		}
		r.URL = baseURL + "=w400-h400-c"
		results = append(results, r)
	}
	return c.JSON(results)
}
