package handlers

import (
	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5/pgxpool"
	"photo-voter/internal/services"
)

type AdminHandler struct {
	db           *pgxpool.Pool
	googlePhotos *services.GooglePhotosService
}

func NewAdminHandler(db *pgxpool.Pool, gp *services.GooglePhotosService) *AdminHandler {
	return &AdminHandler{db: db, googlePhotos: gp}
}

func (h *AdminHandler) GoogleAuthStart(c fiber.Ctx) error {
	return c.Redirect().To(h.googlePhotos.AuthURL())
}

func (h *AdminHandler) GoogleAuthCallback(c fiber.Ctx) error {
	code := c.Query("code")
	if code == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "missing code"})
	}
	if err := h.googlePhotos.ExchangeCode(c.Context(), code); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to exchange code: " + err.Error()})
	}
	return c.SendString("Google Photos authorized. You can close this tab and sync via POST /api/admin/sync.")
}

func (h *AdminHandler) Sync(c fiber.Ctx) error {
	count, err := h.googlePhotos.SyncAlbum(c.Context())
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "sync failed: " + err.Error()})
	}
	return c.JSON(fiber.Map{"synced": count})
}
