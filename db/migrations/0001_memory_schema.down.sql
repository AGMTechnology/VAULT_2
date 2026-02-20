BEGIN;

DROP INDEX IF EXISTS idx_memory_entries_category_created;
DROP INDEX IF EXISTS idx_memory_entries_agent_task;
DROP INDEX IF EXISTS idx_memory_entries_project_feature_task;
DROP INDEX IF EXISTS idx_memory_entries_project_created;

DROP TABLE IF EXISTS memory_entries;

DELETE FROM schema_migrations WHERE version = '0001_memory_schema';

COMMIT;