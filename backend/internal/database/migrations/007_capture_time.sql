ALTER TABLE photos ADD COLUMN IF NOT EXISTS capture_time TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_photos_capture_time ON photos (capture_time);
