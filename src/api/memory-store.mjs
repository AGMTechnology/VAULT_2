import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, "../../db/migrations");

function readMigration(name) {
  const sqlPath = path.join(migrationsDir, name);
  return fs.readFileSync(sqlPath, "utf8");
}

function normalizeFilters(filters = {}) {
  return {
    projectId: filters.projectId ?? "",
    featureScope: filters.featureScope ?? "",
    taskType: filters.taskType ?? "",
    agentId: filters.agentId ?? "",
    lessonCategory: filters.lessonCategory ?? "",
    searchQuery: filters.searchQuery ?? "",
    limit: Number.isInteger(filters.limit) ? filters.limit : 100,
  };
}

export function applyMemorySchemaMigration(db) {
  db.exec(readMigration("0001_memory_schema.up.sql"));
}

export function rollbackMemorySchemaMigration(db) {
  db.exec(readMigration("0001_memory_schema.down.sql"));
}

export function insertMemoryEntry(db, entry) {
  const createdAt = entry.createdAt ?? new Date().toISOString();
  const sourceRefs = Array.isArray(entry.sourceRefs) ? entry.sourceRefs : [];

  const stmt = db.prepare(`
    INSERT INTO memory_entries (
      id,
      project_id,
      feature_scope,
      task_type,
      agent_id,
      lesson_category,
      content,
      source_refs,
      created_at
    ) VALUES (
      @id,
      @projectId,
      @featureScope,
      @taskType,
      @agentId,
      @lessonCategory,
      @content,
      @sourceRefs,
      @createdAt
    )
  `);

  stmt.run({
    id: entry.id,
    projectId: entry.projectId,
    featureScope: entry.featureScope,
    taskType: entry.taskType,
    agentId: entry.agentId,
    lessonCategory: entry.lessonCategory,
    content: entry.content,
    sourceRefs: JSON.stringify(sourceRefs),
    createdAt,
  });
}

export function queryMemoryEntries(db, rawFilters = {}) {
  const filters = normalizeFilters(rawFilters);
  const where = [];
  const params = {};

  if (filters.projectId) {
    where.push("project_id = @projectId");
    params.projectId = filters.projectId;
  }
  if (filters.featureScope) {
    where.push("feature_scope = @featureScope");
    params.featureScope = filters.featureScope;
  }
  if (filters.taskType) {
    where.push("task_type = @taskType");
    params.taskType = filters.taskType;
  }
  if (filters.agentId) {
    where.push("agent_id = @agentId");
    params.agentId = filters.agentId;
  }
  if (filters.lessonCategory) {
    where.push("lesson_category = @lessonCategory");
    params.lessonCategory = filters.lessonCategory;
  }
  if (filters.searchQuery) {
    where.push("content LIKE @searchQuery");
    params.searchQuery = `%${filters.searchQuery}%`;
  }

  const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  const stmt = db.prepare(`
    SELECT
      id,
      project_id,
      feature_scope,
      task_type,
      agent_id,
      lesson_category,
      content,
      source_refs,
      created_at
    FROM memory_entries
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT @limit
  `);

  const rows = stmt.all({ ...params, limit: Math.max(1, filters.limit) });

  return rows.map((row) => ({
    id: row.id,
    projectId: row.project_id,
    featureScope: row.feature_scope,
    taskType: row.task_type,
    agentId: row.agent_id,
    lessonCategory: row.lesson_category,
    content: row.content,
    sourceRefs: JSON.parse(row.source_refs),
    createdAt: row.created_at,
  }));
}