ALTER TABLE speccheck_photos ADD COLUMN source_id TEXT;
UPDATE speccheck_photos SET source_id = id WHERE source_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_speccheck_photos_visit_source
  ON speccheck_photos(visit_id, source_id);
