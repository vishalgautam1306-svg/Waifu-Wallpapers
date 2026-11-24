-- V5 separate catalog: all public modifications are admin-authenticated.
CREATE TABLE IF NOT EXISTS artworks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  series TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'anime',
  tags TEXT NOT NULL DEFAULT '[]',
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  size INTEGER NOT NULL,
  mime TEXT NOT NULL,
  original_key TEXT NOT NULL,
  preview_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'published' CHECK(status IN ('published','hidden','deleted')),
  featured INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS artworks_published ON artworks(status,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS artworks_featured ON artworks(status,featured DESC,created_at DESC);
CREATE INDEX IF NOT EXISTS artworks_category ON artworks(status,category,created_at DESC);
CREATE TABLE IF NOT EXISTS admin_login_attempts (
  id TEXT PRIMARY KEY,
  ip_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS admin_login_rate ON admin_login_attempts(ip_hash,created_at);
