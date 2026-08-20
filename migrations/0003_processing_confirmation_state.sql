CREATE TABLE IF NOT EXISTS speccheck_processing_states (
  visit_id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  interpretation_json TEXT NOT NULL,
  checklists_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_speccheck_processing_states_user
  ON speccheck_processing_states(user_id, updated_at DESC);
