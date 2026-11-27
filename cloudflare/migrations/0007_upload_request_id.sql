-- V12: make retrying a failed/timed-out bulk upload safe for the same queue item.
ALTER TABLE wallpapers ADD COLUMN upload_request_id TEXT NOT NULL DEFAULT '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_wallpapers_upload_request_id
  ON wallpapers(upload_request_id) WHERE upload_request_id <> '';
