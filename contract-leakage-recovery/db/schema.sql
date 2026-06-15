-- Idempotent schema for ClauseGuard. Run on boot; safe to re-run.

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT,
  company       TEXT,
  plan          TEXT NOT NULL DEFAULT 'free',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add profile columns to databases created before they existed.
ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS company TEXT;

CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,        -- sha256 hash of the cookie token
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);

CREATE TABLE IF NOT EXISTS audits (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vendor        TEXT,
  mode          TEXT NOT NULL DEFAULT 'single',  -- single | bulk
  annual_impact NUMERIC NOT NULL DEFAULT 0,
  finding_count INTEGER NOT NULL DEFAULT 0,
  result        JSONB NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audits_user_created_idx ON audits(user_id, created_at DESC);
