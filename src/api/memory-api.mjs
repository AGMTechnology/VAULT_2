import { randomUUID } from "node:crypto";

import {
  insertMemoryEntry,
  insertMemoryPushAudit,
  queryMemoryEntries,
  queryMemoryPushAudits,
} from "./memory-store.mjs";

const ALLOWED_TASK_TYPES = new Set(["dev", "design", "qa", "pm", "other"]);
const ALLOWED_LESSON_CATEGORIES = new Set(["success", "error", "decision", "constraint"]);
const ALLOWED_WORKFLOW_END_STATUSES = new Set(["in-review", "done"]);

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

function validateWorkflowCompletionPayload(payload) {
  const projectId = toTrimmedString(payload?.projectId);
  const ticketId = toTrimmedString(payload?.ticketId);
  const fromStatus = toTrimmedString(payload?.fromStatus);
  const toStatus = toTrimmedString(payload?.toStatus).toLowerCase();
  const agentId = toTrimmedString(payload?.agentId);
  const memoryPayload = payload?.memory;
  const errors = [];
  let memoryValidation = null;

  if (!projectId) errors.push("projectId is required");
  if (!ticketId) errors.push("ticketId is required");
  if (!fromStatus) errors.push("fromStatus is required");
  if (!toStatus) errors.push("toStatus is required");
  if (!agentId) errors.push("agentId is required");

  if (toStatus && !ALLOWED_WORKFLOW_END_STATUSES.has(toStatus)) {
    errors.push("toStatus must be one of in-review|done");
  }

  if (!memoryPayload || typeof memoryPayload !== "object" || Array.isArray(memoryPayload)) {
    errors.push("memory is required");
  }
  if (memoryPayload && typeof memoryPayload === "object" && !Array.isArray(memoryPayload)) {
    memoryValidation = validatePostPayload({
      ...memoryPayload,
      projectId,
      agentId,
      sourceRefs: toStringArray(memoryPayload.sourceRefs),
    });
    if (!memoryValidation.ok) {
      errors.push(...memoryValidation.errors.map((error) => `memory.${error}`));
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const providedSourceRefs = toStringArray(memoryPayload.sourceRefs);
  const normalizedMemoryPayload = {
    ...memoryValidation.value,
    sourceRefs: unique([ticketId, ...providedSourceRefs]),
  };

  return {
    ok: true,
    value: {
      projectId,
      ticketId,
      fromStatus,
      toStatus,
      agentId,
      memory: normalizedMemoryPayload,
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

function validateWorkflowAuditQuery(query) {
  const projectId = toTrimmedString(query?.projectId);
  const ticketId = toTrimmedString(query?.ticketId);
  const agentId = toTrimmedString(query?.agentId);
  const limitRaw = toTrimmedString(query?.limit);

  if (!projectId) {
    return { ok: false, status: 400, error: "projectId is required" };
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
      ticketId,
      agentId,
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

    postWorkflowTicketFinish(payload) {
      const validated = validateWorkflowCompletionPayload(payload);
      if (!validated.ok) {
        return {
          status: 400,
          body: {
            error: "Invalid workflow completion payload",
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

      const { projectId, ticketId, fromStatus, toStatus, agentId, memory } = validated.value;

      try {
        insertMemoryEntry(db, memory);

        const audit = {
          id: `audit-${randomUUID()}`,
          projectId,
          ticketId,
          fromStatus,
          toStatus,
          agentId,
          memoryEntryId: memory.id,
          payload: {
            ticketId,
            fromStatus,
            toStatus,
            memory: {
              id: memory.id,
              featureScope: memory.featureScope,
              taskType: memory.taskType,
              lessonCategory: memory.lessonCategory,
              labels: memory.labels,
              sourceRefs: memory.sourceRefs,
            },
          },
          createdAt: new Date().toISOString(),
        };
        insertMemoryPushAudit(db, audit);

        return {
          status: 201,
          body: {
            memoryEntry: {
              id: memory.id,
              projectId: memory.projectId,
              featureScope: memory.featureScope,
              taskType: memory.taskType,
              agentId: memory.agentId,
              lessonCategory: memory.lessonCategory,
              content: memory.content,
              sourceRefs: memory.sourceRefs,
              labels: memory.labels,
              createdAt: memory.createdAt,
            },
            audit: {
              id: audit.id,
              projectId: audit.projectId,
              ticketId: audit.ticketId,
              fromStatus: audit.fromStatus,
              toStatus: audit.toStatus,
              agentId: audit.agentId,
              memoryEntryId: audit.memoryEntryId,
              createdAt: audit.createdAt,
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

    getWorkflowAudit(query) {
      const validated = validateWorkflowAuditQuery(query);
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

      const rows = queryMemoryPushAudits(db, {
        projectId: filters.projectId,
        ticketId: filters.ticketId,
        agentId: filters.agentId,
        limit: filters.limit,
      });

      return {
        status: 200,
        body: {
          entries: rows,
        },
      };
    },
  };
}
