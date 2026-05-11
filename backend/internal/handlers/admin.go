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

type userVoteStat struct {
	Name      string `json:"name"`
	Email     string `json:"email"`
	VoteCount int    `json:"vote_count"`
}

func (h *AdminHandler) GetStats(c fiber.Ctx) error {
	var totalUsers, totalVotes, photosVotedOn int
	_ = h.db.QueryRow(c.Context(), "SELECT COUNT(*) FROM users WHERE is_admin = false").Scan(&totalUsers)
	_ = h.db.QueryRow(c.Context(), "SELECT COUNT(*) FROM votes").Scan(&totalVotes)
	_ = h.db.QueryRow(c.Context(), "SELECT COUNT(DISTINCT photo_id) FROM votes").Scan(&photosVotedOn)

	rows, err := h.db.Query(c.Context(), `
		SELECT u.name, u.email, COUNT(v.id) AS vote_count
		FROM users u
		LEFT JOIN votes v ON u.id = v.user_id
		WHERE u.is_admin = false
		GROUP BY u.id, u.name, u.email
		ORDER BY vote_count DESC, u.name ASC
	`)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	perUser := make([]userVoteStat, 0)
	for rows.Next() {
		var s userVoteStat
		if err := rows.Scan(&s.Name, &s.Email, &s.VoteCount); err != nil {
			continue
		}
		perUser = append(perUser, s)
	}

	var upvotes, downvotes, skips, totalPhotos int
	_ = h.db.QueryRow(c.Context(), "SELECT COUNT(*) FROM votes WHERE vote = 1").Scan(&upvotes)
	_ = h.db.QueryRow(c.Context(), "SELECT COUNT(*) FROM votes WHERE vote = -1").Scan(&downvotes)
	_ = h.db.QueryRow(c.Context(), "SELECT COUNT(*) FROM votes WHERE vote = 0").Scan(&skips)
	_ = h.db.QueryRow(c.Context(), "SELECT COUNT(*) FROM photos").Scan(&totalPhotos)

	var completionPct float64
	if totalPhotos > 0 {
		completionPct = float64(photosVotedOn) / float64(totalPhotos) * 100
	}
	var avgVotesPerPhoto float64
	if photosVotedOn > 0 {
		avgVotesPerPhoto = float64(totalVotes) / float64(photosVotedOn)
	}

	return c.JSON(fiber.Map{
		"total_users":        totalUsers,
		"total_votes":        totalVotes,
		"photos_voted_on":    photosVotedOn,
		"upvotes":            upvotes,
		"downvotes":          downvotes,
		"skips":              skips,
		"completion_pct":     completionPct,
		"avg_votes_per_photo": avgVotesPerPhoto,
		"votes_per_user":     perUser,
	})
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

func (h *AdminHandler) RefreshPhotos(c fiber.Ctx) error {
	count, err := h.gp.RefreshAllPhotos(c.Context())
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"refreshed": count})
}

func (h *AdminHandler) ImportPickerSession(c fiber.Ctx) error {
	sessionID := c.Params("id")
	count, err := h.gp.ImportPickerSession(c.Context(), sessionID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"imported": count})
}

type resetRequest struct {
	Scope string `json:"scope"`
}

// POST /admin/reset — scope: "votes" | "votes_and_tags" | "event" | "full"
func (h *AdminHandler) Reset(c fiber.Ctx) error {
	var req resetRequest
	if err := c.Bind().Body(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request"})
	}

	ctx := c.Context()

	switch req.Scope {
	case "votes":
		tag, err := h.db.Exec(ctx, "DELETE FROM votes")
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
		}
		return c.JSON(fiber.Map{"deleted_votes": tag.RowsAffected()})

	case "votes_and_tags":
		tx, err := h.db.Begin(ctx)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
		}
		defer tx.Rollback(ctx)
		vTag, err := tx.Exec(ctx, "DELETE FROM votes")
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
		}
		tTag, err := tx.Exec(ctx, "DELETE FROM photo_tags")
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
		}
		if err := tx.Commit(ctx); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
		}
		return c.JSON(fiber.Map{"deleted_votes": vTag.RowsAffected(), "deleted_tags": tTag.RowsAffected()})

	case "event":
		// Deleting photos cascades votes and photo_tags
		tag, err := h.db.Exec(ctx, "DELETE FROM photos")
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
		}
		return c.JSON(fiber.Map{"deleted_photos": tag.RowsAffected()})

	case "full":
		tx, err := h.db.Begin(ctx)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
		}
		defer tx.Rollback(ctx)
		pTag, err := tx.Exec(ctx, "DELETE FROM photos")
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
		}
		uTag, err := tx.Exec(ctx, "DELETE FROM users WHERE is_admin = false")
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
		}
		if err := tx.Commit(ctx); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
		}
		return c.JSON(fiber.Map{"deleted_photos": pTag.RowsAffected(), "deleted_users": uTag.RowsAffected()})

	default:
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "unknown scope"})
	}
}
