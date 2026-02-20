BEGIN;

CREATE TABLE IF NOT EXISTS memory_process_lessons (
  memory_entry_id TEXT PRIMARY KEY,
  decision_moment TEXT NOT NULL,
  assumption_made TEXT NOT NULL,
  human_reason TEXT NOT NULL,
  missed_control TEXT NOT NULL,
  next_rule TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (memory_entry_id) REFERENCES memory_entries(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_memory_process_lessons_created
  ON memory_process_lessons(created_at DESC);

INSERT OR IGNORE INTO schema_migrations(version, applied_at)
VALUES ('0003_memory_process_lessons', CURRENT_TIMESTAMP);

COMMIT;
