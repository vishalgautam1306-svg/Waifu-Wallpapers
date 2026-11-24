-- Public originals are stored in private R2; only approved records are served.
-- Do not put original or thumb data in the SQL database.
CREATE TABLE IF NOT EXISTS wallpapers (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('anime','oled','fantasy','scifi','other')),
  width INTEGER NOT NULL CHECK(width > 0),
  height INTEGER NOT NULL CHECK(height > 0),
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  original_key TEXT NOT NULL,
  thumb_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','removed')),
  created_at INTEGER NOT NULL,
  ip_hash TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_wallpapers_public ON wallpapers(status,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_wallpapers_review ON wallpapers(status,created_at ASC);
CREATE INDEX IF NOT EXISTS idx_wallpapers_rate ON wallpapers(ip_hash,created_at);
