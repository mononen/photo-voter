CREATE TABLE photo_tags (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID        NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
    photo_id   UUID        NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
    name       TEXT        NOT NULL CHECK (char_length(name) > 0 AND char_length(name) <= 100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, photo_id, name)
);

CREATE INDEX idx_photo_tags_user_photo ON photo_tags (user_id, photo_id);
CREATE INDEX idx_photo_tags_user_name  ON photo_tags (user_id, name);
