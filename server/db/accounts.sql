-- Accounts database (data/accounts.db), only used when sign-in is on. Each account's world lives in
-- its own file (data/worlds/<user id>/aura.db); this file only knows who can sign in.
-- Times are milliseconds since 1970.

CREATE TABLE IF NOT EXISTS users (
  id           TEXT PRIMARY KEY,           -- 'u_Xk3v9QaL', also the world's folder name
  google_sub   TEXT NOT NULL UNIQUE,       -- Google's permanent id for the account ('dev:<email>' for test logins)
  email        TEXT NOT NULL,
  name         TEXT NOT NULL,
  picture      TEXT,                       -- Google profile photo URL
  created_at   INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);

-- One row per signed-in device. Only a SHA-256 hash of the token is stored, so a copy of this
-- file can't be used to sign in as anyone.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash   TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform     TEXT NOT NULL CHECK (platform IN ('web', 'ios', 'script')),
  created_at   INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);

-- Counters shared by every world, per day (the global daily AI cap).
CREATE TABLE IF NOT EXISTS daily_counts (
  name  TEXT NOT NULL,                     -- e.g. 'ai_calls'
  day   TEXT NOT NULL,                     -- e.g. 'Sun Nov 08 2026'
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (name, day)
);
