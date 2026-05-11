package config

import (
	"os"
	"strings"
)

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
		DatabaseURL:        buildDatabaseURL(),
		JWTSecret:          getEnv("JWT_SECRET", "dev-secret-change-in-production"),
		GoogleClientID:     os.Getenv("GOOGLE_CLIENT_ID"),
		GoogleClientSecret: os.Getenv("GOOGLE_CLIENT_SECRET"),
		GoogleRedirectURL:  getEnv("GOOGLE_REDIRECT_URL", "http://localhost:3000/api/admin/auth/google/callback"),
		FrontendURL:        getEnv("FRONTEND_URL", "http://localhost:5173"),
		Port:               getEnv("PORT", "3000"),
	}
}

func buildDatabaseURL() string {
	if raw := os.Getenv("DATABASE_URL"); raw != "" {
		return raw
	}
	user := getEnv("POSTGRES_USER", "photovoter")
	password := os.Getenv("POSTGRES_PASSWORD")
	host := getEnv("POSTGRES_HOST", "postgres")
	db := getEnv("POSTGRES_DB", user)
	// DSN format passes credentials as raw strings — no URL encoding, no special-char issues.
	return "host=" + dsnQuote(host) +
		" port=5432" +
		" user=" + dsnQuote(user) +
		" password=" + dsnQuote(password) +
		" dbname=" + dsnQuote(db)
}

// dsnQuote wraps a value in single quotes and escapes backslashes and single
// quotes per libpq DSN rules, so any password character is safe.
func dsnQuote(v string) string {
	v = strings.ReplaceAll(v, `\`, `\\`)
	v = strings.ReplaceAll(v, `'`, `\'`)
	return "'" + v + "'"
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
