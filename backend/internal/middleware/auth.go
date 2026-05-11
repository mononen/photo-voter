package middleware

import (
	"strings"

	"github.com/gofiber/fiber/v3"
	"photo-voter/internal/services"
)

func JWT(secret string) fiber.Handler {
	return func(c fiber.Ctx) error {
		header := c.Get("Authorization")
		if header == "" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "missing authorization header"})
		}
		tokenStr := strings.TrimPrefix(header, "Bearer ")
		claims, err := services.ParseJWT(tokenStr, secret)
		if err != nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid token"})
		}
		c.Locals("userID", claims.UserID)
		c.Locals("isAdmin", claims.IsAdmin)
		return c.Next()
	}
}

func AdminOnly() fiber.Handler {
	return func(c fiber.Ctx) error {
		isAdmin, _ := c.Locals("isAdmin").(bool)
		if !isAdmin {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "admin access required"})
		}
		return c.Next()
	}
}
