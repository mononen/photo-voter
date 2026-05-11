CREATE TABLE google_tokens (
    id INT PRIMARY KEY DEFAULT 1,
    access_token TEXT,
    refresh_token TEXT NOT NULL,
    token_expiry TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    google_photos_id TEXT UNIQUE NOT NULL,
    base_url TEXT NOT NULL,
    url_expires_at TIMESTAMPTZ NOT NULL,
    filename TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
