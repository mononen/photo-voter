package main

import (
	"context"
	"log"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/cors"
	"github.com/gofiber/fiber/v3/middleware/logger"
	"github.com/joho/godotenv"
	"photo-voter/internal/config"
	"photo-voter/internal/database"
	"photo-voter/internal/handlers"
	"photo-voter/internal/middleware"
	"photo-voter/internal/services"
)

func main() {
	_ = godotenv.Load()
	cfg := config.Load()

	ctx := context.Background()
	db, err := database.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("connect to database: %v", err)
	}
	defer db.Close()

	if err := database.RunMigrations(ctx, db); err != nil {
		log.Fatalf("run migrations: %v", err)
	}

	gp := services.NewGooglePhotosService(
		cfg.GoogleClientID,
		cfg.GoogleClientSecret,
		cfg.GoogleRedirectURL,
		db,
	)

	authHandler := handlers.NewAuthHandler(db, cfg.JWTSecret)
	photosHandler := handlers.NewPhotosHandler(db, gp)
	votesHandler := handlers.NewVotesHandler(db)
	tagsHandler := handlers.NewTagsHandler(db)
	adminHandler := handlers.NewAdminHandler(db, gp, cfg.FrontendURL)

	app := fiber.New(fiber.Config{
		ErrorHandler: func(c fiber.Ctx, err error) error {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
		},
	})

	app.Use(logger.New())
	app.Use(cors.New(cors.Config{
		AllowOrigins: []string{"http://localhost:5173"},
		AllowHeaders: []string{"Origin", "Content-Type", "Authorization"},
		AllowMethods: []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
	}))

	api := app.Group("/api")

	auth := api.Group("/auth")
	auth.Post("/register", authHandler.Register)
	auth.Post("/login", authHandler.Login)

	photos := api.Group("/photos")
	photos.Get("/next", middleware.JWT(cfg.JWTSecret), photosHandler.Next)
	photos.Get("/batch", middleware.JWT(cfg.JWTSecret), photosHandler.Batch)
	photos.Get("/rankings", middleware.JWT(cfg.JWTSecret), middleware.AdminOnly(), photosHandler.Rankings)
	photos.Get("/:id/image", photosHandler.ProxyImage) // public — UUID is unguessable
	photos.Post("/:id/tags", middleware.JWT(cfg.JWTSecret), tagsHandler.Add)
	photos.Get("/:id/tags", middleware.JWT(cfg.JWTSecret), tagsHandler.ListForPhoto)

	api.Post("/votes", middleware.JWT(cfg.JWTSecret), votesHandler.Submit)
	api.Get("/leaderboard", middleware.JWT(cfg.JWTSecret), votesHandler.Leaderboard)

	tags := api.Group("/tags", middleware.JWT(cfg.JWTSecret))
	tags.Get("/autocomplete", tagsHandler.Autocomplete)
	tags.Delete("/:tagId", tagsHandler.Delete)

	// Google OAuth callback — unprotected, redirect from Google
	api.Get("/admin/auth/google/callback", adminHandler.GoogleAuthCallback)

	admin := api.Group("/admin", middleware.JWT(cfg.JWTSecret), middleware.AdminOnly())
	admin.Get("/settings", adminHandler.GetSettings)
	admin.Get("/stats", adminHandler.GetStats)
	admin.Delete("/photos", adminHandler.ClearPhotos)
	admin.Get("/auth/google/url", adminHandler.GoogleAuthURL)
	admin.Post("/photos/refresh", adminHandler.RefreshPhotos)
	admin.Post("/picker/session", adminHandler.StartPickerSession)
	admin.Get("/picker/session/:id", adminHandler.CheckPickerSession)
	admin.Post("/picker/session/:id/import", adminHandler.ImportPickerSession)
	admin.Get("/photos/:id/tags", tagsHandler.AdminListForPhoto)

	log.Printf("Server listening on :%s", cfg.Port)
	log.Fatal(app.Listen(":" + cfg.Port))
}
