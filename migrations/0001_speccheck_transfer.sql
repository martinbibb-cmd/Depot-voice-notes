CREATE TABLE IF NOT EXISTS speccheck_pairing_codes (
  id TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS speccheck_devices (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_used_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS speccheck_visits (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  device_id TEXT NOT NULL,
  nickname TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  photo_count INTEGER NOT NULL DEFAULT 0,
  created_on_device_at TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS speccheck_photos (
  id TEXT PRIMARY KEY,
  visit_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  r2_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL,
  caption TEXT,
  subject TEXT,
  byte_count INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_speccheck_visits_user_status
  ON speccheck_visits(user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_speccheck_photos_visit
  ON speccheck_photos(visit_id);

