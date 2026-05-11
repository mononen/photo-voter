package config

import "os"

type Config struct {
	DatabaseURL        string
	JWTSecret          string
	GoogleClientID     string
	GoogleClientSecret string
	GoogleRedirectURL  string
	FrontendURL        string
	Port               string
}

func Load() Config {
	return Config{
		DatabaseURL:        getEnv("DATABASE_URL", "postgres://photovoter:photovoter@localhost:5432/photovoter"),
		JWTSecret:          getEnv("JWT_SECRET", "dev-secret-change-in-production"),
		GoogleClientID:     os.Getenv("GOOGLE_CLIENT_ID"),
		GoogleClientSecret: os.Getenv("GOOGLE_CLIENT_SECRET"),
		GoogleRedirectURL:  getEnv("GOOGLE_REDIRECT_URL", "http://localhost:3000/api/admin/auth/google/callback"),
		FrontendURL:        getEnv("FRONTEND_URL", "http://localhost:5173"),
		Port:               getEnv("PORT", "3000"),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
