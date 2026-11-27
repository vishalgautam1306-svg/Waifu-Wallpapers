-- V11: monotonic public gallery version for safe cache revalidation.
CREATE TABLE IF NOT EXISTS catalog_state (
 key TEXT PRIMARY KEY,
 revision INTEGER NOT NULL DEFAULT 1
);
INSERT OR IGNORE INTO catalog_state(key,revision) VALUES ('public',1);
