BEGIN;

DROP INDEX IF EXISTS idx_memory_process_lessons_created;
DROP TABLE IF EXISTS memory_process_lessons;

DELETE FROM schema_migrations WHERE version = '0003_memory_process_lessons';

COMMIT;
