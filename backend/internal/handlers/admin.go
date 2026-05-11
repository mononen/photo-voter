package handlers

import (
	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5/pgxpool"
	"photo-voter/internal/services"
)

type AdminHandler struct {
	db          *pgxpool.Pool
	gp          *services.GooglePhotosService
	frontendURL string
}

func NewAdminHandler(db *pgxpool.Pool, gp *services.GooglePhotosService, frontendURL string) *AdminHandler {
	return &AdminHandler{db: db, gp: gp, frontendURL: frontendURL}
}

func (h *AdminHandler) GetSettings(c fiber.Ctx) error {
	connected := h.gp.IsOAuthConnected(c.Context())
	email := ""
	if connected {
		email, _ = h.gp.GetAuthorizedEmail(c.Context())
	}
	var photoCount int
	_ = h.db.QueryRow(c.Context(), "SELECT COUNT(*) FROM photos").Scan(&photoCount)
	return c.JSON(fiber.Map{
		"oauth_connected":  connected,
		"authorized_email": email,
		"photo_count":      photoCount,
	})
}

func (h *AdminHandler) ClearPhotos(c fiber.Ctx) error {
	// Votes cascade-delete via FK, so deleting photos is enough
	tag, err := h.db.Exec(c.Context(), "DELETE FROM photos")
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"deleted": tag.RowsAffected()})
}

func (h *AdminHandler) GoogleAuthURL(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"url": h.gp.AuthURL()})
}

func (h *AdminHandler) GoogleAuthCallback(c fiber.Ctx) error {
	code := c.Query("code")
	if code == "" {
		return c.Redirect().To(h.frontendURL + "/admin?error=missing_code")
	}
	if err := h.gp.ExchangeCode(c.Context(), code); err != nil {
		return c.Redirect().To(h.frontendURL + "/admin?error=exchange_failed")
	}
	return c.Redirect().To(h.frontendURL + "/admin?connected=true")
}

func (h *AdminHandler) StartPickerSession(c fiber.Ctx) error {
	session, err := h.gp.CreatePickerSession(c.Context())
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{
		"session_id":      session.ID,
		"picker_url":      session.PickerURI,
		"media_items_set": session.MediaItemsSet,
		"expire_time":     session.ExpireTime,
	})
}

func (h *AdminHandler) CheckPickerSession(c fiber.Ctx) error {
	sessionID := c.Params("id")
	session, err := h.gp.GetPickerSession(c.Context(), sessionID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{
		"session_id":      session.ID,
		"media_items_set": session.MediaItemsSet,
		"expire_time":     session.ExpireTime,
	})
}

func (h *AdminHandler) ImportPickerSession(c fiber.Ctx) error {
	sessionID := c.Params("id")
	count, err := h.gp.ImportPickerSession(c.Context(), sessionID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"imported": count})
}
