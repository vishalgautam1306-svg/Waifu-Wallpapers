-- V5 catalog: private R2 originals; only approved records are public.
CREATE TABLE IF NOT EXISTS wallpapers (
 id TEXT PRIMARY KEY,
 title TEXT NOT NULL,
 description TEXT NOT NULL DEFAULT '',
 series TEXT NOT NULL DEFAULT '',
 category TEXT NOT NULL DEFAULT 'anime',
 tags_json TEXT NOT NULL DEFAULT '[]',
 width INTEGER NOT NULL,
 height INTEGER NOT NULL,
 mime TEXT NOT NULL,
 size INTEGER NOT NULL,
 original_key TEXT NOT NULL,
 thumb_key TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','removed')),
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL,
 ip_hash TEXT NOT NULL DEFAULT 'admin'
);
CREATE INDEX IF NOT EXISTS idx_wallpapers_public ON wallpapers(status,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_wallpapers_search ON wallpapers(series,category,status);
CREATE INDEX IF NOT EXISTS idx_wallpapers_review ON wallpapers(status,created_at ASC);
