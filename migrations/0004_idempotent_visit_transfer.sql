ALTER TABLE speccheck_visits ADD COLUMN source_visit_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_speccheck_visits_source
  ON speccheck_visits(user_id, device_id, source_visit_id)
  WHERE source_visit_id IS NOT NULL;
