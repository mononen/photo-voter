package handlers

import (
	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5/pgxpool"
)

type VotesHandler struct {
	db *pgxpool.Pool
}

func NewVotesHandler(db *pgxpool.Pool) *VotesHandler {
	return &VotesHandler{db: db}
}

type voteRequest struct {
	PhotoID string `json:"photo_id"`
	Vote    int    `json:"vote"`
}

func (h *VotesHandler) Submit(c fiber.Ctx) error {
	userID := c.Locals("userID").(string)

	var req voteRequest
	if err := c.Bind().Body(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}
	if req.Vote != -1 && req.Vote != 0 && req.Vote != 1 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "vote must be -1, 0, or 1"})
	}
	if req.PhotoID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "photo_id required"})
	}

	if _, err := h.db.Exec(c.Context(), `
		INSERT INTO votes (user_id, photo_id, vote)
		VALUES ($1, $2, $3)
		ON CONFLICT (user_id, photo_id) DO UPDATE SET vote = $3
	`, userID, req.PhotoID, req.Vote); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal error"})
	}
	return c.SendStatus(fiber.StatusNoContent)
}
