BEGIN;

CREATE TABLE IF NOT EXISTS memory_push_audit (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  ticket_id TEXT NOT NULL,
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL CHECK (to_status IN ('in-review', 'done')),
  agent_id TEXT NOT NULL,
  memory_entry_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_memory_push_audit_project_created
  ON memory_push_audit(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_memory_push_audit_ticket_created
  ON memory_push_audit(ticket_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_memory_push_audit_agent_created
  ON memory_push_audit(agent_id, created_at DESC);

INSERT OR IGNORE INTO schema_migrations(version, applied_at)
VALUES ('0002_workflow_memory_audit', CURRENT_TIMESTAMP);

COMMIT;
