BEGIN;

DROP INDEX IF EXISTS idx_memory_push_audit_agent_created;
DROP INDEX IF EXISTS idx_memory_push_audit_ticket_created;
DROP INDEX IF EXISTS idx_memory_push_audit_project_created;

DROP TABLE IF EXISTS memory_push_audit;

DELETE FROM schema_migrations WHERE version = '0002_workflow_memory_audit';

COMMIT;
