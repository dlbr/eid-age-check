CREATE TABLE IF NOT EXISTS age_check_sessions (
  session_id TEXT PRIMARY KEY NOT NULL,
  browser_token_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
