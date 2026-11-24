-- Cloudflare D1 hardening: admin sessions expire, password guesses get throttled,
-- AI scans are explicitly capped per day. No admin key is stored in D1.
CREATE TABLE IF NOT EXISTS admin_sessions (
 token_hash TEXT PRIMARY KEY,
 ip_hash TEXT NOT NULL,
 ua_hash TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expiry ON admin_sessions(expires_at);
CREATE TABLE IF NOT EXISTS admin_login_attempts (
 ip_hash TEXT PRIMARY KEY,
 window_start INTEGER NOT NULL,
 failures INTEGER NOT NULL DEFAULT 0,
 locked_until INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS admin_security_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 event TEXT NOT NULL,
 ip_hash TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 record_id TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_admin_security_time ON admin_security_events(created_at DESC);
CREATE TABLE IF NOT EXISTS admin_ai_usage (
 day TEXT PRIMARY KEY,
 calls INTEGER NOT NULL DEFAULT 0
);
