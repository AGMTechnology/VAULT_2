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
const ALLOWED_PRIORITIES = new Set(["P0", "P1", "P2", "P3"]);
const CROSS_PROJECT_ID = "all";

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

function isCrossProjectId(projectId) {
  return toTrimmedString(projectId).toLowerCase() === CROSS_PROJECT_ID;
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

function parseIsoTime(value) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
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

function validateRetrievePayload(payload) {
  const projectId = toTrimmedString(payload?.projectId);
  const featureScope = toTrimmedString(payload?.featureScope);
  const taskType = toTrimmedString(payload?.taskType).toLowerCase();
  const priority = toTrimmedString(payload?.priority).toUpperCase();
  const labels = toStringArray(payload?.labels).map((label) => label.toLowerCase());
  const searchQuery = toTrimmedString(payload?.searchQuery);
  const limitRaw = Number.parseInt(toTrimmedString(payload?.limit), 10);
  const limit = Number.isInteger(limitRaw) ? limitRaw : 10;

  const errors = [];
  if (!projectId) {
    errors.push("projectId is required");
  }
  if (taskType && !ALLOWED_TASK_TYPES.has(taskType)) {
    errors.push("taskType must be one of dev|design|qa|pm|other");
  }
  if (priority && !ALLOWED_PRIORITIES.has(priority)) {
    errors.push("priority must be one of P0|P1|P2|P3");
  }
  if (!Number.isInteger(limit) || limit <= 0 || limit > 50) {
    errors.push("limit must be an integer between 1 and 50");
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      projectId,
      featureScope,
      taskType,
      priority,
      labels,
      searchQuery,
      limit,
    },
  };
}

function computePriorityBoost(priority, lessonCategory) {
  if (!priority) {
    return 0;
  }

  const map = {
    P0: { error: 22, constraint: 18, decision: 12, success: 9 },
    P1: { error: 18, constraint: 15, decision: 11, success: 9 },
    P2: { error: 10, constraint: 10, decision: 12, success: 12 },
    P3: { error: 8, constraint: 8, decision: 10, success: 13 },
  };

  return map[priority]?.[lessonCategory] ?? 0;
}

function scoreEntry(entry, context) {
  let score = 0;
  const reasons = [];
  const featureScope = context.featureScope.toLowerCase();
  const taskType = context.taskType.toLowerCase();
  const labels = context.labels;
  const searchQuery = context.searchQuery.toLowerCase();
  const entryFeature = entry.featureScope.toLowerCase();
  const entryTask = entry.taskType.toLowerCase();
  const entryContent = entry.content.toLowerCase();
  const entryLabels = parseLabelRefs(entry.sourceRefs);

  score += 5;

  if (featureScope) {
    if (entryFeature === featureScope) {
      score += 44;
      reasons.push("feature-scope:exact");
    } else if (entryFeature.includes(featureScope) || featureScope.includes(entryFeature)) {
      score += 15;
      reasons.push("feature-scope:partial");
    }
  }

  if (taskType && entryTask === taskType) {
    score += 26;
    reasons.push("task-type:exact");
  }

  if (labels.length > 0) {
    const matched = labels.filter((label) => entryLabels.includes(label));
    if (matched.length > 0) {
      score += matched.length * 18;
      reasons.push(`labels:matched(${matched.join(",")})`);
    }
  }

  if (searchQuery) {
    const terms = unique(
      searchQuery
        .split(/\s+/)
        .map((term) => term.trim())
        .filter((term) => term.length >= 3),
    );
    const hits = terms.filter((term) => entryContent.includes(term));
    if (hits.length > 0) {
      score += Math.min(18, hits.length * 6);
      reasons.push(`search:matched(${hits.join(",")})`);
    }
  }

  const priorityBoost = computePriorityBoost(context.priority, entry.lessonCategory);
  if (priorityBoost > 0) {
    score += priorityBoost;
    reasons.push(`priority:${context.priority}->${entry.lessonCategory}`);
  }

  const ageMs = Math.max(0, Date.now() - parseIsoTime(entry.createdAt));
  const ageDays = ageMs / 86_400_000;
  const recencyBoost = Math.max(1, Math.round(10 - Math.min(9, ageDays)));
  score += recencyBoost;
  if (ageDays <= 3) {
    reasons.push("recency:recent");
  }

  return {
    score,
    reasons,
    labels: entryLabels,
  };
}

function sortByCreatedDesc(a, b) {
  return parseIsoTime(b.createdAt) - parseIsoTime(a.createdAt);
}

export function createMemoryApi({ db, projectRegistry = new Set(["vault-2"]) }) {
  const normalizedRegistry = normalizeProjectRegistry(projectRegistry);

  function runRetrieval(payload) {
    const validated = validateRetrievePayload(payload);
    if (!validated.ok) {
      return {
        status: 400,
        body: {
          error: "Invalid retrieval payload",
          details: validated.errors,
        },
      };
    }

    const context = validated.value;

    if (!isCrossProjectId(context.projectId) && !hasProject(normalizedRegistry, context.projectId)) {
      return {
        status: 404,
        body: { error: "Project not found" },
      };
    }

    const candidates = queryMemoryEntries(db, {
      projectId: isCrossProjectId(context.projectId) ? "" : context.projectId,
      searchQuery: "",
      limit: 1000,
    });

    if (candidates.length === 0) {
      return {
        status: 200,
        body: {
          entries: [],
          meta: {
            fallbackUsed: true,
            totalCandidates: 0,
            contextSignals: 0,
          },
        },
      };
    }

    const contextSignals = [
      context.featureScope,
      context.taskType,
      context.priority,
      context.searchQuery,
      context.labels.length > 0 ? "labels" : "",
    ].filter(Boolean).length;

    const scored = candidates.map((entry) => {
      const result = scoreEntry(entry, context);
      return {
        ...entry,
        labels: result.labels,
        score: result.score,
        reasons: result.reasons,
      };
    });

    let fallbackUsed = false;
    let ranked = scored.sort((a, b) => b.score - a.score || sortByCreatedDesc(a, b));

    if (contextSignals === 0) {
      fallbackUsed = true;
      ranked = scored
        .sort(sortByCreatedDesc)
        .map((entry) => ({
          ...entry,
          reasons: unique([...entry.reasons, "fallback:latest-project-memory"]),
        }));
    } else if ((ranked[0]?.score ?? 0) < 20) {
      fallbackUsed = true;
      ranked = scored
        .sort(sortByCreatedDesc)
        .map((entry) => ({
          ...entry,
          reasons: unique([...entry.reasons, "fallback:low-context-match"]),
        }));
    }

    return {
      status: 200,
      body: {
        entries: ranked.slice(0, context.limit),
        meta: {
          fallbackUsed,
          totalCandidates: candidates.length,
          contextSignals,
        },
      },
    };
  }

  function buildLessonsSection(entries) {
    const sectionTitle = "## Lessons to avoid repeating mistakes";
    if (entries.length === 0) {
      return [
        sectionTitle,
        "- No contextual memory matched. Apply defensive defaults and push a new lesson when task is done.",
      ].join("\n");
    }

    const lines = entries.map((entry) => {
      const sourceRefs = entry.sourceRefs.filter((source) => !source.startsWith("label:"));
      const sourcesText = sourceRefs.length > 0 ? sourceRefs.join(", ") : "none";
      return `- [${entry.id}] ${entry.content} (score: ${entry.score}; sources: ${sourcesText})`;
    });

    return [sectionTitle, ...lines].join("\n");
  }

  function buildSourceMemoryIds(entries) {
    return entries.map((entry) => entry.id);
  }

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

      if (!isCrossProjectId(filters.projectId) && !hasProject(normalizedRegistry, filters.projectId)) {
        return {
          status: 404,
          body: { error: "Project not found" },
        };
      }

      let rows = queryMemoryEntries(db, {
        projectId: isCrossProjectId(filters.projectId) ? "" : filters.projectId,
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

    retrieveMemory(payload) {
      return runRetrieval(payload);
    },

    composeTicket(payload) {
      const projectId = toTrimmedString(payload?.projectId);
      const title = toTrimmedString(payload?.title);
      const specMarkdown = toTrimmedString(payload?.specMarkdown);
      const acceptanceCriteria = toTrimmedString(payload?.acceptanceCriteria);
      const testPlan = toTrimmedString(payload?.testPlan);

      if (!projectId) {
        return {
          status: 400,
          body: { error: "projectId is required" },
        };
      }
      if (!title) {
        return {
          status: 400,
          body: { error: "title is required" },
        };
      }

      const retrieval = runRetrieval({
        projectId,
        featureScope: payload?.featureScope,
        taskType: payload?.taskType,
        priority: payload?.priority,
        labels: payload?.labels,
        searchQuery: payload?.searchQuery,
        limit: payload?.limit ?? 5,
      });
      if (retrieval.status !== 200) {
        return retrieval;
      }

      const entries = retrieval.body.entries;
      const lessonsSection = buildLessonsSection(entries);
      const sourceMemoryIds = buildSourceMemoryIds(entries);
      const memoryIdsLine = `Memory source IDs: ${sourceMemoryIds.join(", ") || "none"}`;
      const baseSpec = specMarkdown || "No initial specification provided.";

      const enrichedSpecMarkdown = [baseSpec, "", lessonsSection, "", memoryIdsLine].join("\n");
      const referencePrompt = [
        `You are assigned to ticket "${title}".`,
        "",
        lessonsSection,
        "",
        memoryIdsLine,
      ].join("\n");

      return {
        status: 200,
        body: {
          ticket: {
            title,
            specMarkdown: enrichedSpecMarkdown,
            acceptanceCriteria,
            testPlan,
            referencePrompt,
          },
          memoryTrace: {
            sourceMemoryIds,
            fallbackUsed: retrieval.body.meta.fallbackUsed,
            contextSignals: retrieval.body.meta.contextSignals,
          },
        },
      };
    },

    composeHandoff(payload) {
      const projectId = toTrimmedString(payload?.projectId);
      const ticketId = toTrimmedString(payload?.ticketId);
      const summary = toTrimmedString(payload?.summary);

      if (!projectId) {
        return {
          status: 400,
          body: { error: "projectId is required" },
        };
      }
      if (!ticketId) {
        return {
          status: 400,
          body: { error: "ticketId is required" },
        };
      }
      if (!summary) {
        return {
          status: 400,
          body: { error: "summary is required" },
        };
      }

      const retrieval = runRetrieval({
        projectId,
        featureScope: payload?.featureScope,
        taskType: payload?.taskType,
        priority: payload?.priority,
        labels: payload?.labels,
        searchQuery: payload?.searchQuery,
        limit: payload?.limit ?? 5,
      });
      if (retrieval.status !== 200) {
        return retrieval;
      }

      const entries = retrieval.body.entries;
      const lessonsSection = buildLessonsSection(entries);
      const sourceMemoryIds = buildSourceMemoryIds(entries);
      const memoryIdsLine = `Memory source IDs: ${sourceMemoryIds.join(", ") || "none"}`;

      const handoffMarkdown = [
        `# Handoff - ${ticketId}`,
        "",
        `Summary: ${summary}`,
        "",
        lessonsSection,
        "",
        memoryIdsLine,
      ].join("\n");

      return {
        status: 200,
        body: {
          handoffMarkdown,
          memoryTrace: {
            sourceMemoryIds,
            fallbackUsed: retrieval.body.meta.fallbackUsed,
            contextSignals: retrieval.body.meta.contextSignals,
          },
        },
      };
    },

    composeReferencePrompt(payload) {
      const projectId = toTrimmedString(payload?.projectId);
      const ticketId = toTrimmedString(payload?.ticketId);
      const title = toTrimmedString(payload?.title);
      const basePrompt = toTrimmedString(payload?.basePrompt);

      if (!projectId) {
        return {
          status: 400,
          body: { error: "projectId is required" },
        };
      }
      if (!ticketId) {
        return {
          status: 400,
          body: { error: "ticketId is required" },
        };
      }
      if (!title) {
        return {
          status: 400,
          body: { error: "title is required" },
        };
      }

      const retrieval = runRetrieval({
        projectId,
        featureScope: payload?.featureScope,
        taskType: payload?.taskType,
        priority: payload?.priority,
        labels: payload?.labels,
        searchQuery: payload?.searchQuery,
        limit: payload?.limit ?? 5,
      });
      if (retrieval.status !== 200) {
        return retrieval;
      }

      const entries = retrieval.body.entries;
      const lessonsSection = buildLessonsSection(entries);
      const sourceMemoryIds = buildSourceMemoryIds(entries);
      const memoryIdsLine = `Memory source IDs: ${sourceMemoryIds.join(", ") || "none"}`;

      const referencePrompt = [
        basePrompt || `You are assigned to ${ticketId}: ${title}.`,
        "",
        lessonsSection,
        "",
        memoryIdsLine,
      ].join("\n");

      return {
        status: 200,
        body: {
          referencePrompt,
          memoryTrace: {
            sourceMemoryIds,
            fallbackUsed: retrieval.body.meta.fallbackUsed,
            contextSignals: retrieval.body.meta.contextSignals,
          },
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
      if (!isCrossProjectId(filters.projectId) && !hasProject(normalizedRegistry, filters.projectId)) {
        return {
          status: 404,
          body: { error: "Project not found" },
        };
      }

      const rows = queryMemoryPushAudits(db, {
        projectId: isCrossProjectId(filters.projectId) ? "" : filters.projectId,
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
