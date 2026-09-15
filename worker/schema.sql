-- Myo Family Health — assessment responses
--
-- Deliberately minimal. This table holds health information people
-- volunteered about themselves or their children, so it stores what
-- Amy needs to follow up and nothing else: no IP address, no user
-- agent, no fingerprint of any kind.

CREATE TABLE IF NOT EXISTS responses (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at  TEXT    NOT NULL,          -- ISO 8601, UTC
  email       TEXT    NOT NULL,
  name        TEXT,                      -- optional, only if the form asks
  subject     TEXT    NOT NULL,          -- 'self' | 'child'
  total       INTEGER NOT NULL,
  max_total   INTEGER NOT NULL,
  pct         INTEGER NOT NULL,
  band        TEXT    NOT NULL,          -- 'low' | 'mod' | 'high'
  band_label  TEXT    NOT NULL,          -- what the visitor actually saw
  flag_count  INTEGER NOT NULL DEFAULT 0,
  flags       TEXT    NOT NULL DEFAULT '[]',   -- JSON array
  cats        TEXT    NOT NULL DEFAULT '[]',   -- JSON array, per-section scores
  answers     TEXT    NOT NULL DEFAULT '[]'    -- JSON array of all 18
);

CREATE INDEX IF NOT EXISTS idx_responses_created ON responses (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_responses_email   ON responses (email);
CREATE INDEX IF NOT EXISTS idx_responses_band    ON responses (band);

-- Failed logins, so the dashboard can lock out a guesser.
CREATE TABLE IF NOT EXISTS login_attempts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  at         TEXT NOT NULL,
  ok         INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_login_at ON login_attempts (at DESC);
