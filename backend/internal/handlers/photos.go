package handlers

import (
	"fmt"
	"io"
	"strconv"

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
	if err := h.db.QueryRow(c.Context(),
		"SELECT base_url FROM photos WHERE id = $1", photoID,
	).Scan(&baseURL); err != nil {
		return c.SendStatus(fiber.StatusNotFound)
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
	defer resp.Body.Close()

	c.Set("Content-Type", resp.Header.Get("Content-Type"))
	c.Set("Cache-Control", "private, max-age=3600")
	c.Status(resp.StatusCode)
	_, err = io.Copy(c.Response().BodyWriter(), resp.Body)
	return err
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
