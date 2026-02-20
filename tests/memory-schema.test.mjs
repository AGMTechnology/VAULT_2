import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import Database from "better-sqlite3";

import {
  applyMemorySchemaMigration,
  rollbackMemorySchemaMigration,
  insertMemoryEntry,
  queryMemoryEntries,
} from "../src/api/memory-store.mjs";

function createTempDbPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vault2-memory-schema-"));
  return path.join(dir, "vault2.db");
}

test("migration up creates memory_entries table and contextual indexes", () => {
  const dbPath = createTempDbPath();
  const db = new Database(dbPath);

  applyMemorySchemaMigration(db);

  const table = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='memory_entries'")
    .get();
  assert.equal(table?.name, "memory_entries");

  const indexRows = db
    .prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='memory_entries'")
    .all();
  const indexNames = indexRows.map((row) => row.name);

  assert(indexNames.includes("idx_memory_entries_project_created"));
  assert(indexNames.includes("idx_memory_entries_project_feature_task"));
  assert(indexNames.includes("idx_memory_entries_agent_task"));
  assert(indexNames.includes("idx_memory_entries_category_created"));

  db.close();
});

test("insert and query memory entries by contextual filters", () => {
  const dbPath = createTempDbPath();
  const db = new Database(dbPath);

  applyMemorySchemaMigration(db);

  insertMemoryEntry(db, {
    id: "mem-1",
    projectId: "vault-2",
    featureScope: "memory-retrieval",
    taskType: "dev",
    agentId: "codex-dev",
    lessonCategory: "error",
    content: "Avoid missing project filter in retrieval query",
    sourceRefs: ["VAULT-2-003", "commit:abc123"],
    createdAt: "2026-02-20T09:00:00.000Z",
  });

  insertMemoryEntry(db, {
    id: "mem-2",
    projectId: "vault-2",
    featureScope: "memory-ui",
    taskType: "design",
    agentId: "codex-design",
    lessonCategory: "success",
    content: "Use design tokens for spacing consistency",
    sourceRefs: ["VAULT-2-007"],
    createdAt: "2026-02-20T09:01:00.000Z",
  });

  const rows = queryMemoryEntries(db, {
    projectId: "vault-2",
    featureScope: "memory-retrieval",
    taskType: "dev",
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, "mem-1");
  assert.equal(rows[0].lessonCategory, "error");
  assert.deepEqual(rows[0].sourceRefs, ["VAULT-2-003", "commit:abc123"]);

  db.close();
});

test("migration down drops memory schema", () => {
  const dbPath = createTempDbPath();
  const db = new Database(dbPath);

  applyMemorySchemaMigration(db);
  rollbackMemorySchemaMigration(db);

  const table = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='memory_entries'")
    .get();

  assert.equal(table, undefined);

  db.close();
});