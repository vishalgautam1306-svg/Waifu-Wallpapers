-- V9 owner tools: report metadata issues without enabling public uploads or chat.
CREATE TABLE IF NOT EXISTS wallpaper_reports (
 id TEXT PRIMARY KEY,
 wallpaper_id TEXT NOT NULL,
 reporter_hash TEXT NOT NULL,
 reason TEXT NOT NULL CHECK(reason IN ('wrong_details','wrong_tags','broken_image','copyright','other')),
 note TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved','dismissed')),
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL,
 UNIQUE(wallpaper_id,reporter_hash)
);
CREATE INDEX IF NOT EXISTS idx_wallpaper_reports_status_time ON wallpaper_reports(status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallpaper_reports_wallpaper ON wallpaper_reports(wallpaper_id);
CREATE INDEX IF NOT EXISTS idx_wallpaper_reports_reporter_time ON wallpaper_reports(reporter_hash,created_at DESC);
