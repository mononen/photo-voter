package models

import "time"

type Photo struct {
	ID            string    `json:"id"`
	GooglePhotosID string   `json:"google_photos_id"`
	BaseURL       string    `json:"base_url"`
	URLExpiresAt  time.Time `json:"url_expires_at"`
	Filename      string    `json:"filename"`
	CreatedAt     time.Time `json:"created_at"`
}

type PhotoRanking struct {
	ID        string `json:"id"`
	BaseURL   string `json:"base_url"`
	Filename  string `json:"filename"`
	Score     int    `json:"score"`
	VoteCount int    `json:"vote_count"`
}
