-- Waifu Wallpapers V8: controlled community chat and character polls.
-- Chat defaults OFF. Only an authenticated owner can enable it after testing.
CREATE TABLE IF NOT EXISTS community_settings (
 setting TEXT PRIMARY KEY,
 value TEXT NOT NULL
);
INSERT OR IGNORE INTO community_settings(setting,value) VALUES ('chat_enabled','0');
INSERT OR IGNORE INTO community_settings(setting,value) VALUES ('polls_enabled','1');

CREATE TABLE IF NOT EXISTS community_messages (
 id TEXT PRIMARY KEY,
 nickname TEXT NOT NULL,
 body TEXT NOT NULL,
 ip_hash TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'visible' CHECK(status IN ('visible','hidden'))
);
CREATE INDEX IF NOT EXISTS idx_community_messages_status_time ON community_messages(status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_messages_ip_time ON community_messages(ip_hash,created_at DESC);

CREATE TABLE IF NOT EXISTS community_reports (
 message_id TEXT NOT NULL,
 reporter_hash TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 PRIMARY KEY (message_id, reporter_hash)
);
CREATE INDEX IF NOT EXISTS idx_community_reports_message ON community_reports(message_id);

CREATE TABLE IF NOT EXISTS community_polls (
 id TEXT PRIMARY KEY,
 question TEXT NOT NULL,
 options_json TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','closed')),
 created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_community_polls_time ON community_polls(created_at DESC);

CREATE TABLE IF NOT EXISTS community_votes (
 poll_id TEXT NOT NULL,
 voter_hash TEXT NOT NULL,
 option_index INTEGER NOT NULL,
 created_at INTEGER NOT NULL,
 PRIMARY KEY (poll_id,voter_hash)
);
CREATE INDEX IF NOT EXISTS idx_community_votes_poll ON community_votes(poll_id,option_index);
