package models

import "time"

type Vote struct {
	ID      string    `json:"id"`
	UserID  string    `json:"user_id"`
	PhotoID string    `json:"photo_id"`
	Vote    int       `json:"vote"`
	VotedAt time.Time `json:"voted_at"`
}
