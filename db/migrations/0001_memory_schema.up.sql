BEGIN;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memory_entries (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  feature_scope TEXT NOT NULL,
  task_type TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  lesson_category TEXT NOT NULL CHECK (lesson_category IN ('success', 'error', 'decision', 'constraint')),
  content TEXT NOT NULL,
  source_refs TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_memory_entries_project_created
  ON memory_entries(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_memory_entries_project_feature_task
  ON memory_entries(project_id, feature_scope, task_type);

CREATE INDEX IF NOT EXISTS idx_memory_entries_agent_task
  ON memory_entries(agent_id, task_type);

CREATE INDEX IF NOT EXISTS idx_memory_entries_category_created
  ON memory_entries(lesson_category, created_at DESC);

INSERT OR IGNORE INTO schema_migrations(version, applied_at)
VALUES ('0001_memory_schema', CURRENT_TIMESTAMP);

COMMIT;