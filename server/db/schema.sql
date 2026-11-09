-- Aura database. One SQLite file (data/aura.db) holds the whole simulated world.
-- Booleans are 0/1 integers. Times are milliseconds since 1970. JSON columns hold small arrays/objects.

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL                  -- JSON
);

-- Everyone: the human ('me'), named AI characters ('cast') and background followers ('crowd').
CREATE TABLE IF NOT EXISTS accounts (
  id             TEXT PRIMARY KEY,     -- 'me' | cast slug ('maya') | crowd id ('u0412')
  kind           TEXT NOT NULL CHECK (kind IN ('me', 'cast', 'crowd')),
  username       TEXT NOT NULL UNIQUE,
  display_name   TEXT NOT NULL,
  avatar         TEXT,
  bio            TEXT NOT NULL DEFAULT '',
  pronouns       TEXT NOT NULL DEFAULT '',
  location       TEXT,
  occupation     TEXT,
  verified       INTEGER NOT NULL DEFAULT 0,
  role           TEXT,                 -- cast: bestie | friend | mutual | fan | creator
  persona        TEXT,                 -- cast: JSON with look, voice, traits, interests, relationship, concept, age
  followers      INTEGER NOT NULL DEFAULT 0,
  following      INTEGER NOT NULL DEFAULT 0,
  follows_me     INTEGER NOT NULL DEFAULT 0,
  i_follow       INTEGER NOT NULL DEFAULT 0,
  closeness      REAL NOT NULL DEFAULT 0, -- 0..1, grows as the user and this character interact
  last_active_at INTEGER,
  created_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS accounts_kind ON accounts(kind);

CREATE TABLE IF NOT EXISTS posts (
  id            TEXT PRIMARY KEY,
  author_id     TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('photo', 'carousel', 'reel')),
  media         TEXT NOT NULL,         -- JSON Media[]
  caption       TEXT NOT NULL DEFAULT '',
  location      TEXT,
  tagged        TEXT NOT NULL DEFAULT '[]', -- JSON account ids
  audio         TEXT,
  like_count    INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0,
  view_count    INTEGER NOT NULL DEFAULT 0,
  share_count   INTEGER NOT NULL DEFAULT 0,
  liked_by_me   INTEGER NOT NULL DEFAULT 0,
  saved_by_me   INTEGER NOT NULL DEFAULT 0,
  ai_note       TEXT,                  -- what the picture shows (vision summary or the image prompt)
  source_id     TEXT,                  -- cast library id, e.g. 'maya-p3'
  released      INTEGER NOT NULL DEFAULT 1, -- 0 = still in a character's library, posted later by the simulation
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS posts_feed ON posts(released, created_at DESC);
CREATE INDEX IF NOT EXISTS posts_author ON posts(author_id, created_at DESC);

-- Named likers only. like_count can be far bigger (the crowd is just a number).
CREATE TABLE IF NOT EXISTS post_likes (
  post_id    TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (post_id, account_id)
);

CREATE TABLE IF NOT EXISTS comments (
  id              TEXT PRIMARY KEY,
  post_id         TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id       TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  parent_id       TEXT REFERENCES comments(id) ON DELETE CASCADE,
  text            TEXT NOT NULL,
  like_count      INTEGER NOT NULL DEFAULT 0,
  liked_by_me     INTEGER NOT NULL DEFAULT 0,
  liked_by_author INTEGER NOT NULL DEFAULT 0,
  pinned          INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS comments_post ON comments(post_id, created_at);

CREATE TABLE IF NOT EXISTS stories (
  id         TEXT PRIMARY KEY,
  author_id  TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  media      TEXT NOT NULL,            -- JSON Media
  overlay    TEXT,                     -- JSON StoryOverlay
  source_id  TEXT,                     -- cast library id, e.g. 'maya-s2'
  released   INTEGER NOT NULL DEFAULT 1,
  seen       INTEGER NOT NULL DEFAULT 0, -- seen by me
  view_count INTEGER NOT NULL DEFAULT 0, -- my stories: total views (named + crowd)
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS stories_active ON stories(released, expires_at);

CREATE TABLE IF NOT EXISTS story_views (
  story_id   TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  reaction   TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (story_id, account_id)
);

CREATE TABLE IF NOT EXISTS highlights (
  id         TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  cover      TEXT NOT NULL,
  story_ids  TEXT NOT NULL DEFAULT '[]', -- JSON
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS conversations (
  id              TEXT PRIMARY KEY,
  kind            TEXT NOT NULL CHECK (kind IN ('dm', 'group')),
  title           TEXT,
  emoji           TEXT,
  members         TEXT NOT NULL,       -- JSON account ids, never including 'me'
  vibe            TEXT,                -- groups: what the chat is about, for the AI
  is_request      INTEGER NOT NULL DEFAULT 0,
  muted           INTEGER NOT NULL DEFAULT 0,
  unread          INTEGER NOT NULL DEFAULT 0,
  seen_at         INTEGER,             -- when the other side last read my messages
  last_message_at INTEGER NOT NULL,
  created_at      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  text            TEXT NOT NULL DEFAULT '',
  media           TEXT,                -- JSON Media
  shared_post_id  TEXT REFERENCES posts(id) ON DELETE SET NULL,
  story_id        TEXT,                -- the story this message replies to (may have expired)
  story_thumb     TEXT,                -- kept so the reply still shows after the story expires
  reply_to_id     TEXT,
  reactions       TEXT NOT NULL DEFAULT '[]', -- JSON Reaction[]
  created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_conv ON messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS notifications (
  id         TEXT PRIMARY KEY,
  kind       TEXT NOT NULL,
  actor_id   TEXT REFERENCES accounts(id) ON DELETE CASCADE,
  others     INTEGER NOT NULL DEFAULT 0,
  post_id    TEXT REFERENCES posts(id) ON DELETE CASCADE,
  comment_id TEXT,
  text       TEXT,
  group_key  TEXT,                     -- e.g. 'like:p_123' - unread likes on one post merge into one row
  read       INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS notifications_time ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_group ON notifications(group_key, read);

-- Things a character remembers about the user ("has a dog named Mochi", "starting a new job").
CREATE TABLE IF NOT EXISTS memories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT NOT NULL,            -- who remembers it ('*' = the whole cast)
  fact       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS memories_account ON memories(account_id);

-- The simulation's to-do list: "at time T, do X". Survives restarts.
CREATE TABLE IF NOT EXISTS jobs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  run_at     INTEGER NOT NULL,
  kind       TEXT NOT NULL,
  payload    TEXT NOT NULL DEFAULT '{}', -- JSON
  state      TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'running', 'done', 'failed')),
  attempts   INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS jobs_due ON jobs(state, run_at);

-- The recommendation algorithm keeps three more tables per world (rec_events, rec_scores, rec_seen).
-- They are created by server/recs/store.ts with defineTable(), which also makes Start over empty them.
