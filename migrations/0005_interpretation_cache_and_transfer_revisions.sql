DROP INDEX IF EXISTS idx_speccheck_visits_source;
CREATE UNIQUE INDEX IF NOT EXISTS idx_speccheck_visits_source
  ON speccheck_visits(user_id, source_visit_id)
  WHERE source_visit_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS speccheck_interpretation_cache (
  evidence_hash TEXT PRIMARY KEY,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_speccheck_interpretation_cache_expiry
  ON speccheck_interpretation_cache(expires_at);

CREATE TABLE IF NOT EXISTS speccheck_visit_revisions (
  id TEXT PRIMARY KEY,
  visit_id TEXT NOT NULL,
  revision_number INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  photo_count INTEGER NOT NULL,
  received_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  UNIQUE(visit_id, revision_number)
);

CREATE INDEX IF NOT EXISTS idx_speccheck_visit_revisions_visit
  ON speccheck_visit_revisions(visit_id, revision_number);
