import { randomUUID } from "node:crypto";

import { insertMemoryEntry, queryMemoryEntries } from "./memory-store.mjs";

const ALLOWED_TASK_TYPES = new Set(["dev", "design", "qa", "pm", "other"]);
const ALLOWED_LESSON_CATEGORIES = new Set(["success", "error", "decision", "constraint"]);

function toTrimmedString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function toStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function isDuplicateError(error) {
  return String(error?.code || "").startsWith("SQLITE_CONSTRAINT");
}

function normalizeProjectRegistry(projectRegistry) {
  const registry = new Set();
  for (const projectId of projectRegistry || []) {
    const normalized = toTrimmedString(projectId).toLowerCase();
    if (normalized) {
      registry.add(normalized);
    }
  }
  return registry;
}

function hasProject(projectRegistry, projectId) {
  const normalized = toTrimmedString(projectId).toLowerCase();
  return projectRegistry.has(normalized);
}

function toLabelRefs(labels) {
  return labels.map((label) => `label:${label.toLowerCase()}`);
}

function parseLabelRefs(sourceRefs) {
  return sourceRefs
    .filter((ref) => ref.startsWith("label:"))
    .map((ref) => ref.slice("label:".length))
    .filter(Boolean);
}

function unique(items) {
  return Array.from(new Set(items));
}

function validatePostPayload(payload) {
  const projectId = toTrimmedString(payload?.projectId);
  const featureScope = toTrimmedString(payload?.featureScope);
  const taskType = toTrimmedString(payload?.taskType).toLowerCase();
  const agentId = toTrimmedString(payload?.agentId);
  const lessonCategory = toTrimmedString(payload?.lessonCategory).toLowerCase();
  const content = toTrimmedString(payload?.content);
  const sourceRefs = toStringArray(payload?.sourceRefs);
  const labels = toStringArray(payload?.labels);
  const explicitId = toTrimmedString(payload?.id);
  const createdAt = toTrimmedString(payload?.createdAt);

  const errors = [];

  if (!projectId) errors.push("projectId is required");
  if (!featureScope) errors.push("featureScope is required");
  if (!taskType) errors.push("taskType is required");
  if (!agentId) errors.push("agentId is required");
  if (!lessonCategory) errors.push("lessonCategory is required");
  if (!content) errors.push("content is required");
  if (sourceRefs.length === 0) errors.push("sourceRefs must contain at least one source id");

  if (taskType && !ALLOWED_TASK_TYPES.has(taskType)) {
    errors.push("taskType must be one of dev|design|qa|pm|other");
  }

  if (lessonCategory && !ALLOWED_LESSON_CATEGORIES.has(lessonCategory)) {
    errors.push("lessonCategory must be one of success|error|decision|constraint");
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      id: explicitId || `mem-${randomUUID()}`,
      projectId,
      featureScope,
      taskType,
      agentId,
      lessonCategory,
      content,
      sourceRefs: unique([...sourceRefs, ...toLabelRefs(labels)]),
      labels: unique(labels.map((label) => label.toLowerCase())),
      createdAt: createdAt || new Date().toISOString(),
    },
  };
}

function validateGetQuery(query) {
  const projectId = toTrimmedString(query?.projectId);
  const featureScope = toTrimmedString(query?.featureScope);
  const taskType = toTrimmedString(query?.taskType).toLowerCase();
  const agentId = toTrimmedString(query?.agentId);
  const lessonCategory = toTrimmedString(query?.lessonCategory).toLowerCase();
  const label = toTrimmedString(query?.label).toLowerCase();
  const searchQuery = toTrimmedString(query?.searchQuery);
  const limitRaw = toTrimmedString(query?.limit);

  if (!projectId) {
    return { ok: false, status: 400, error: "projectId is required" };
  }

  if (taskType && !ALLOWED_TASK_TYPES.has(taskType)) {
    return { ok: false, status: 400, error: "Invalid taskType" };
  }

  if (lessonCategory && !ALLOWED_LESSON_CATEGORIES.has(lessonCategory)) {
    return { ok: false, status: 400, error: "Invalid lessonCategory" };
  }

  let limit = 100;
  if (limitRaw) {
    const parsed = Number.parseInt(limitRaw, 10);
    if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 200) {
      return { ok: false, status: 400, error: "limit must be an integer between 1 and 200" };
    }
    limit = parsed;
  }

  return {
    ok: true,
    value: {
      projectId,
      featureScope,
      taskType,
      agentId,
      lessonCategory,
      label,
      searchQuery,
      limit,
    },
  };
}

export function createMemoryApi({ db, projectRegistry = new Set(["vault-2"]) }) {
  const normalizedRegistry = normalizeProjectRegistry(projectRegistry);

  return {
    postMemory(payload) {
      const validated = validatePostPayload(payload);
      if (!validated.ok) {
        return {
          status: 400,
          body: {
            error: "Invalid payload",
            details: validated.errors,
          },
        };
      }

      if (!hasProject(normalizedRegistry, validated.value.projectId)) {
        return {
          status: 404,
          body: { error: "Project not found" },
        };
      }

      try {
        insertMemoryEntry(db, validated.value);
        return {
          status: 201,
          body: {
            entry: {
              id: validated.value.id,
              projectId: validated.value.projectId,
              featureScope: validated.value.featureScope,
              taskType: validated.value.taskType,
              agentId: validated.value.agentId,
              lessonCategory: validated.value.lessonCategory,
              content: validated.value.content,
              sourceRefs: validated.value.sourceRefs,
              labels: validated.value.labels,
              createdAt: validated.value.createdAt,
            },
          },
        };
      } catch (error) {
        if (isDuplicateError(error)) {
          return {
            status: 409,
            body: { error: "Memory entry id already exists" },
          };
        }

        throw error;
      }
    },

    getMemory(query) {
      const validated = validateGetQuery(query);
      if (!validated.ok) {
        return {
          status: validated.status,
          body: { error: validated.error },
        };
      }

      const filters = validated.value;

      if (!hasProject(normalizedRegistry, filters.projectId)) {
        return {
          status: 404,
          body: { error: "Project not found" },
        };
      }

      let rows = queryMemoryEntries(db, {
        projectId: filters.projectId,
        featureScope: filters.featureScope,
        taskType: filters.taskType,
        agentId: filters.agentId,
        lessonCategory: filters.lessonCategory,
        searchQuery: filters.searchQuery,
        limit: filters.limit,
      });

      rows = rows.map((row) => ({
        ...row,
        labels: parseLabelRefs(row.sourceRefs),
      }));

      if (filters.label) {
        rows = rows.filter((row) => row.labels.includes(filters.label));
      }

      return {
        status: 200,
        body: {
          entries: rows,
        },
      };
    },
  };
}