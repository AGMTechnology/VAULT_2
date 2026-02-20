import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";

import { applyMemorySchemaMigration, insertMemoryEntry } from "../src/api/memory-store.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_SOURCE_PROJECTS_DIR = path.resolve(
  __dirname,
  process.env.VAULT0_PROJECTS_DATA_ROOT || "../../VAULT_0/data/projects",
);
const DEFAULT_TARGET_DB_PATH = path.resolve(
  __dirname,
  process.env.VAULT2_DB_PATH || "../data/vault2.db",
);
const DEFAULT_API_BASE_URL = (process.env.VAULT0_API_BASE_URL || "http://127.0.0.1:3000").replace(
  /\/$/,
  "",
);

function toTrimmedString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function toStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => toTrimmedString(item)).filter(Boolean);
}

function unique(items) {
  return Array.from(new Set(items.filter(Boolean)));
}

function slugify(value) {
  return toTrimmedString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown";
}

function extractTicketRefs(text) {
  if (!text) return [];
  const matches = text.match(/\b[A-Z]+(?:[-_][A-Z0-9]+)*-\d{3,4}\b/g) || [];
  return unique(matches);
}

function inferTaskType(entry) {
  const corpus = [
    entry.task_summary,
    ...toStringArray(entry.files_changed),
    ...toStringArray(entry.commands_run),
    ...toStringArray(entry.decisions_taken),
  ]
    .join(" ")
    .toLowerCase();

  if (/\b(figma|ui|ux|design|visual)\b/.test(corpus)) return "design";
  if (/\b(test|tnr|qa|regression|coverage)\b/.test(corpus)) return "qa";
  if (/\b(ticket|spec|roadmap|planning|triage|priorit|workflow|handoff|doc|documentation)\b/.test(corpus)) {
    return "pm";
  }
  return "dev";
}

function inferFeatureScope(entry) {
  const corpus = [
    entry.task_summary,
    ...toStringArray(entry.files_changed),
    ...toStringArray(entry.commands_run),
    ...toStringArray(entry.lessons_learned),
  ]
    .join(" ")
    .toLowerCase();

  if (/\b(memory|memoire)\b/.test(corpus)) return "memory";
  if (/\b(workflow|status|transition|ticket)\b/.test(corpus)) return "workflow";
  if (/\b(openapi|api|endpoint|route|server)\b/.test(corpus)) return "api";
  if (/\b(test|tnr|qa|coverage|assert)\b/.test(corpus)) return "testing";
  if (/\b(ui|ux|design|figma|css|component)\b/.test(corpus)) return "ui";
  if (/\b(doc|documentation|readme|runbook)\b/.test(corpus)) return "docs";
  if (/\b(agent|prompt|handoff)\b/.test(corpus)) return "agents";
  return "general";
}

function parseJsonlFile(filePath, projectIdFallback) {
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split("\n").filter((line) => line.trim().length > 0);
  const parsed = [];

  for (const line of lines) {
    try {
      const value = JSON.parse(line);
      if (!value || typeof value !== "object") continue;
      parsed.push({
        ...value,
        projectId: toTrimmedString(value.projectId) || projectIdFallback,
      });
    } catch {
      // Ignore malformed line to preserve append-only source behavior.
    }
  }

  return parsed;
}

function makeDeterministicId(parts) {
  const hash = crypto.createHash("sha1").update(parts.join("|"), "utf8").digest("hex");
  return `imp-${hash.slice(0, 24)}`;
}

function buildEntriesFromSession(session, projectMetaById) {
  const projectId = toTrimmedString(session.projectId);
  const projectName = projectMetaById.get(projectId) || projectId;
  const taskType = inferTaskType(session);
  const featureScope = inferFeatureScope(session);
  const agentId = toTrimmedString(session.agentId) || "user";
  const sessionId = toTrimmedString(session.session_id) || "UNKNOWN_SESSION";
  const createdAt = toTrimmedString(session.date) || new Date().toISOString();

  const aggregateText = [
    toTrimmedString(session.task_summary),
    ...toStringArray(session.successes),
    ...toStringArray(session.failures),
    ...toStringArray(session.user_preferences),
    ...toStringArray(session.user_frustrations),
    ...toStringArray(session.decisions_taken),
    ...toStringArray(session.lessons_learned),
    ...toStringArray(session.next_session_focus),
  ].join("\n");

  const sourceProjectSlug = slugify(projectName);
  const refsBase = unique([
    `source-session:${sessionId}`,
    `source-project-id:${projectId}`,
    `source-project-name:${projectName}`,
    ...extractTicketRefs(aggregateText),
  ]);

  const labels = [
    "label:imported",
    "label:imported-vault0",
    `label:src-project-${sourceProjectSlug}`,
    `label:task-${taskType}`,
    `label:feature-${slugify(featureScope)}`,
  ];

  const categorized = [
    { lessonCategory: "decision", prefix: "summary", items: [toTrimmedString(session.task_summary)] },
    { lessonCategory: "success", prefix: "success", items: toStringArray(session.successes) },
    { lessonCategory: "error", prefix: "failure", items: toStringArray(session.failures) },
    { lessonCategory: "error", prefix: "frustration", items: toStringArray(session.user_frustrations) },
    { lessonCategory: "constraint", prefix: "preference", items: toStringArray(session.user_preferences) },
    { lessonCategory: "decision", prefix: "decision", items: toStringArray(session.decisions_taken) },
    { lessonCategory: "constraint", prefix: "lesson", items: toStringArray(session.lessons_learned) },
    { lessonCategory: "decision", prefix: "next-focus", items: toStringArray(session.next_session_focus) },
  ];

  const entries = [];
  for (const categoryBucket of categorized) {
    for (let index = 0; index < categoryBucket.items.length; index += 1) {
      const item = toTrimmedString(categoryBucket.items[index]);
      if (!item) continue;

      const content = item;
      const id = makeDeterministicId([
        projectId,
        sessionId,
        categoryBucket.lessonCategory,
        categoryBucket.prefix,
        String(index),
        content,
      ]);

      entries.push({
        id,
        projectId,
        featureScope,
        taskType,
        agentId,
        lessonCategory: categoryBucket.lessonCategory,
        content,
        sourceRefs: unique([...refsBase, ...labels]),
        createdAt,
      });
    }
  }

  return entries;
}

function listSessionFiles(projectsRoot) {
  const files = [];
  for (const projectDir of fs.readdirSync(projectsRoot, { withFileTypes: true })) {
    if (!projectDir.isDirectory()) continue;
    const projectId = projectDir.name;
    const memoryDir = path.join(projectsRoot, projectId, "memory");
    if (!fs.existsSync(memoryDir)) continue;
    for (const fileName of fs.readdirSync(memoryDir)) {
      if (!fileName.endsWith(".jsonl")) continue;
      files.push({
        projectId,
        filePath: path.join(memoryDir, fileName),
      });
    }
  }
  return files;
}

async function loadProjectMap(apiBaseUrl) {
  const map = new Map();
  try {
    const response = await fetch(`${apiBaseUrl}/api/projects`);
    if (!response.ok) return map;
    const payload = await response.json();
    const projects = Array.isArray(payload.projects) ? payload.projects : [];
    for (const project of projects) {
      const id = toTrimmedString(project.id);
      const name = toTrimmedString(project.name);
      if (id) map.set(id, name || id);
    }
  } catch {
    // Ignore API loading errors; fallback will use project ids.
  }
  return map;
}

function countByProject(db) {
  const rows = db
    .prepare(
      `
      SELECT project_id AS projectId, COUNT(*) AS total
      FROM memory_entries
      GROUP BY project_id
      ORDER BY total DESC, project_id ASC
    `,
    )
    .all();
  return rows;
}

async function runImport() {
  const sourceProjectsDir = DEFAULT_SOURCE_PROJECTS_DIR;
  const targetDbPath = DEFAULT_TARGET_DB_PATH;
  const apiBaseUrl = DEFAULT_API_BASE_URL;

  if (!fs.existsSync(sourceProjectsDir)) {
    throw new Error(`Source projects directory not found: ${sourceProjectsDir}`);
  }

  fs.mkdirSync(path.dirname(targetDbPath), { recursive: true });
  const db = new Database(targetDbPath);

  try {
    applyMemorySchemaMigration(db);
    const projectMetaById = await loadProjectMap(apiBaseUrl);
    const files = listSessionFiles(sourceProjectsDir);
    const beforeCount = db.prepare("SELECT COUNT(*) AS total FROM memory_entries").get().total;

    let totalSessions = 0;
    let totalProducedEntries = 0;
    let inserted = 0;
    let duplicates = 0;
    const insertedByProject = new Map();

    for (const file of files) {
      const sessions = parseJsonlFile(file.filePath, file.projectId);
      totalSessions += sessions.length;

      for (const session of sessions) {
        const entries = buildEntriesFromSession(session, projectMetaById);
        totalProducedEntries += entries.length;

        for (const entry of entries) {
          try {
            insertMemoryEntry(db, entry);
            inserted += 1;
            insertedByProject.set(entry.projectId, (insertedByProject.get(entry.projectId) || 0) + 1);
          } catch (error) {
            if (String(error?.code || "").startsWith("SQLITE_CONSTRAINT")) {
              duplicates += 1;
              continue;
            }
            throw error;
          }
        }
      }
    }

    const afterCount = db.prepare("SELECT COUNT(*) AS total FROM memory_entries").get().total;
    const summary = {
      sourceProjectsDir,
      targetDbPath,
      apiBaseUrl,
      filesScanned: files.length,
      sessionsScanned: totalSessions,
      entriesProduced: totalProducedEntries,
      inserted,
      duplicatesSkipped: duplicates,
      totalBefore: beforeCount,
      totalAfter: afterCount,
      insertedByProject: Array.from(insertedByProject.entries())
        .map(([projectId, total]) => ({
          projectId,
          projectName: projectMetaById.get(projectId) || projectId,
          total,
        }))
        .sort((a, b) => b.total - a.total || a.projectId.localeCompare(b.projectId)),
      totalsByProjectInDb: countByProject(db),
    };

    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } finally {
    db.close();
  }
}

runImport().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});
