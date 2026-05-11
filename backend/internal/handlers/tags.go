package handlers

import (
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5/pgxpool"
)

type TagsHandler struct {
	db *pgxpool.Pool
}

func NewTagsHandler(db *pgxpool.Pool) *TagsHandler {
	return &TagsHandler{db: db}
}

type addTagRequest struct {
	Name string `json:"name"`
}

type tagItem struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"created_at"`
}

// POST /api/photos/:id/tags
func (h *TagsHandler) Add(c fiber.Ctx) error {
	userID := c.Locals("userID").(string)
	photoID := c.Params("id")

	var req addTagRequest
	if err := c.Bind().Body(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "name required"})
	}
	if len(req.Name) > 100 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "name too long"})
	}

	var t tagItem
	err := h.db.QueryRow(c.Context(), `
		INSERT INTO photo_tags (user_id, photo_id, name)
		VALUES ($1, $2, $3)
		ON CONFLICT (user_id, photo_id, name) DO UPDATE SET name = EXCLUDED.name
		RETURNING id, name, created_at
	`, userID, photoID, req.Name).Scan(&t.ID, &t.Name, &t.CreatedAt)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal error"})
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"id":         t.ID,
		"photo_id":   photoID,
		"name":       t.Name,
		"created_at": t.CreatedAt,
	})
}

// GET /api/photos/:id/tags
func (h *TagsHandler) ListForPhoto(c fiber.Ctx) error {
	userID := c.Locals("userID").(string)
	photoID := c.Params("id")

	rows, err := h.db.Query(c.Context(), `
		SELECT id, name, created_at
		FROM photo_tags
		WHERE user_id = $1 AND photo_id = $2
		ORDER BY created_at ASC
	`, userID, photoID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal error"})
	}
	defer rows.Close()

	tags := make([]tagItem, 0)
	for rows.Next() {
		var t tagItem
		if err := rows.Scan(&t.ID, &t.Name, &t.CreatedAt); err != nil {
			continue
		}
		tags = append(tags, t)
	}
	return c.JSON(tags)
}

// DELETE /api/tags/:tagId
func (h *TagsHandler) Delete(c fiber.Ctx) error {
	userID := c.Locals("userID").(string)
	tagID := c.Params("tagId")

	result, err := h.db.Exec(c.Context(), `
		DELETE FROM photo_tags WHERE id = $1 AND user_id = $2
	`, tagID, userID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal error"})
	}
	if result.RowsAffected() == 0 {
		return c.SendStatus(fiber.StatusNotFound)
	}
	return c.SendStatus(fiber.StatusNoContent)
}

// GET /api/tags/autocomplete?q=prefix
func (h *TagsHandler) Autocomplete(c fiber.Ctx) error {
	userID := c.Locals("userID").(string)
	prefix := strings.TrimSpace(c.Query("q", ""))

	var query string
	var args []any
	if prefix == "" {
		query = `SELECT DISTINCT name FROM photo_tags WHERE user_id = $1 ORDER BY name ASC`
		args = []any{userID}
	} else {
		query = `SELECT DISTINCT name FROM photo_tags WHERE user_id = $1 AND name ILIKE $2 ORDER BY name ASC`
		args = []any{userID, prefix + "%"}
	}

	rows, err := h.db.Query(c.Context(), query, args...)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal error"})
	}
	defer rows.Close()

	names := make([]string, 0)
	for rows.Next() {
		var n string
		if err := rows.Scan(&n); err != nil {
			continue
		}
		names = append(names, n)
	}
	return c.JSON(names)
}

type adminTagItem struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	SubmittedBy string    `json:"submitted_by"`
	CreatedAt   time.Time `json:"created_at"`
}

// GET /api/admin/photos/:id/tags
func (h *TagsHandler) AdminListForPhoto(c fiber.Ctx) error {
	photoID := c.Params("id")

	rows, err := h.db.Query(c.Context(), `
		SELECT pt.id, pt.name, u.name AS submitted_by, pt.created_at
		FROM photo_tags pt
		JOIN users u ON u.id = pt.user_id
		WHERE pt.photo_id = $1
		ORDER BY pt.name ASC, pt.created_at ASC
	`, photoID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal error"})
	}
	defer rows.Close()

	tags := make([]adminTagItem, 0)
	for rows.Next() {
		var t adminTagItem
		if err := rows.Scan(&t.ID, &t.Name, &t.SubmittedBy, &t.CreatedAt); err != nil {
			continue
		}
		tags = append(tags, t)
	}
	return c.JSON(tags)
}
