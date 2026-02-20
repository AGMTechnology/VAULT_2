function toLower(value) {
  return typeof value === "string" ? value.toLowerCase() : "";
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function toBoundedInteger(value, min, max, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isInteger(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}

function toTrimmedString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseLabels(sourceRefs) {
  return (sourceRefs || [])
    .filter((ref) => typeof ref === "string" && ref.startsWith("label:"))
    .map((ref) => ref.slice("label:".length))
    .filter(Boolean);
}

function parseCreatedAt(value) {
  const timestamp = Date.parse(value || "");
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function normalizeDateBoundary(value, boundary) {
  const raw = toTrimmedString(value);
  if (!raw) {
    return 0;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const suffix = boundary === "start" ? "T00:00:00.000Z" : "T23:59:59.999Z";
    return parseCreatedAt(`${raw}${suffix}`);
  }
  return parseCreatedAt(raw);
}

function sourceRefValue(sourceRefs, prefix) {
  const ref = (sourceRefs || []).find(
    (item) => typeof item === "string" && item.startsWith(prefix),
  );
  if (!ref) {
    return "";
  }
  return ref.slice(prefix.length).trim();
}

function sourceRefValues(sourceRefs, prefixes) {
  return unique(
    (sourceRefs || [])
      .filter((ref) => typeof ref === "string")
      .flatMap((ref) => {
        for (const prefix of prefixes) {
          if (ref.startsWith(prefix)) {
            const value = ref.slice(prefix.length).trim();
            return value ? [value] : [];
          }
        }
        return [];
      }),
  );
}

function extractTicketRefs(sourceRefs) {
  const ticketPattern = /\b[A-Z]+(?:[-_][A-Z0-9]+)*-\d{3,4}\b/;
  return unique(
    (sourceRefs || [])
      .filter((ref) => typeof ref === "string")
      .filter((ref) => ticketPattern.test(ref))
      .filter((ref) => !ref.startsWith("source-"))
      .filter((ref) => !ref.startsWith("label:")),
  );
}

export function applyMemoryFilters(entries, filters = {}) {
  const projectId = toLower(filters.projectId || "");
  const featureScope = toLower(filters.featureScope || "");
  const taskType = toLower(filters.taskType || "");
  const lessonCategory = toLower(filters.lessonCategory || "");
  const agentId = toLower(filters.agentId || "");
  const query = toLower(filters.query || "");
  const dateFrom = normalizeDateBoundary(filters.dateFrom, "start");
  const dateTo = normalizeDateBoundary(filters.dateTo, "end");

  return [...entries]
    .filter((entry) => {
      if (projectId && projectId !== "all" && toLower(entry.projectId) !== projectId) {
        return false;
      }
      if (featureScope && toLower(entry.featureScope) !== featureScope) {
        return false;
      }
      if (taskType && toLower(entry.taskType) !== taskType) {
        return false;
      }
      if (lessonCategory && toLower(entry.lessonCategory) !== lessonCategory) {
        return false;
      }
      if (agentId && toLower(entry.agentId) !== agentId) {
        return false;
      }
      const createdAt = parseCreatedAt(entry.createdAt);
      if (dateFrom && createdAt < dateFrom) {
        return false;
      }
      if (dateTo && createdAt > dateTo) {
        return false;
      }

      if (!query) {
        return true;
      }

      const searchableText = [
        entry.id,
        entry.featureScope,
        entry.taskType,
        entry.agentId,
        entry.lessonCategory,
        entry.content,
        ...(entry.sourceRefs || []),
      ]
        .join(" ")
        .toLowerCase();

      return searchableText.includes(query);
    })
    .sort((a, b) => parseCreatedAt(b.createdAt) - parseCreatedAt(a.createdAt));
}

export function deriveMemoryUiState({ loading, error, entries }) {
  if (loading) {
    return "loading";
  }
  if (error) {
    return "error";
  }
  if (!entries || entries.length === 0) {
    return "empty";
  }
  return "success";
}

export function pickSelectedMemoryEntry(entries, selectedId) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return null;
  }

  const selected = entries.find((entry) => entry.id === selectedId);
  return selected || entries[0];
}

export function buildMemoryFilterOptions(entries) {
  const featureScopes = new Set();
  const taskTypes = new Set();
  const lessonCategories = new Set();
  const agentIds = new Set();
  const labels = new Set();
  const projectMap = new Map();

  for (const entry of entries) {
    if (entry.featureScope) featureScopes.add(entry.featureScope);
    if (entry.taskType) taskTypes.add(entry.taskType);
    if (entry.lessonCategory) lessonCategories.add(entry.lessonCategory);
    if (entry.agentId) agentIds.add(entry.agentId);
    const projectId = toTrimmedString(entry.projectId);
    if (projectId) {
      const sourceProjectName = sourceRefValue(entry.sourceRefs, "source-project-name:");
      projectMap.set(projectId, sourceProjectName || projectMap.get(projectId) || projectId);
    }
    for (const label of parseLabels(entry.sourceRefs || [])) {
      labels.add(label);
    }
  }

  const projectOptions = Array.from(projectMap.entries())
    .map(([id, name]) => ({
      id,
      label: name && name !== id ? `${name} (${id})` : id,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return {
    projectOptions,
    featureScopes: Array.from(featureScopes).sort((a, b) => a.localeCompare(b)),
    taskTypes: Array.from(taskTypes).sort((a, b) => a.localeCompare(b)),
    lessonCategories: Array.from(lessonCategories).sort((a, b) => a.localeCompare(b)),
    agentIds: Array.from(agentIds).sort((a, b) => a.localeCompare(b)),
    labels: Array.from(labels).sort((a, b) => a.localeCompare(b)),
  };
}

export function buildMemoryStatusCounts(entries) {
  return entries.reduce(
    (acc, entry) => {
      const category = toLower(entry.lessonCategory);
      if (category === "error") acc.errors += 1;
      if (category === "success") acc.successes += 1;
      if (category === "decision") acc.decisions += 1;
      if (category === "constraint") acc.constraints += 1;
      return acc;
    },
    { errors: 0, successes: 0, decisions: 0, constraints: 0 },
  );
}

export function buildMemoryEntriesApiUrl(projectId, options = {}) {
  const normalizedProjectId = String(projectId || "all").trim() || "all";
  const normalizedLimit = toBoundedInteger(options.limit, 1, 200, 200);
  const params = new URLSearchParams({
    projectId: normalizedProjectId,
    limit: String(normalizedLimit),
  });
  const dateFrom = toTrimmedString(options.dateFrom);
  const dateTo = toTrimmedString(options.dateTo);
  if (dateFrom) {
    params.set("dateFrom", dateFrom);
  }
  if (dateTo) {
    params.set("dateTo", dateTo);
  }
  return `/api/memory?${params.toString()}`;
}

function hasSourceSession(entry, sessionId) {
  return (entry.sourceRefs || []).some((ref) => ref === `source-session:${sessionId}`);
}

function findProcessLesson(entry, relatedEntries) {
  if (entry.processLesson && typeof entry.processLesson === "object") {
    return entry.processLesson;
  }
  const related = relatedEntries.find(
    (candidate) => candidate.processLesson && typeof candidate.processLesson === "object",
  );
  return related?.processLesson || null;
}

function categoryContents(entries, category) {
  return unique(
    entries
      .filter((entry) => toLower(entry.lessonCategory) === category)
      .map((entry) => toTrimmedString(entry.content)),
  );
}

export function buildMemoryDetailContext(entry, entries = []) {
  if (!entry) {
    return null;
  }

  const sourceRefs = Array.isArray(entry.sourceRefs) ? entry.sourceRefs : [];
  const sourceSessionId = sourceRefValue(sourceRefs, "source-session:");
  const sourceProjectId = sourceRefValue(sourceRefs, "source-project-id:") || toTrimmedString(entry.projectId);
  const sourceProjectName = sourceRefValue(sourceRefs, "source-project-name:") || sourceProjectId || "n/a";
  const relatedEntries = sourceSessionId
    ? entries.filter((candidate) => hasSourceSession(candidate, sourceSessionId))
    : [entry];
  const ticketRefs = extractTicketRefs(sourceRefs);
  const processLesson = findProcessLesson(entry, relatedEntries);

  return {
    meta: {
      sourceSessionId,
      sourceProjectId,
      sourceProjectName,
      ticketRefs,
      sourceRefs: sourceRefs.filter((ref) => typeof ref === "string" && !ref.startsWith("label:")),
      labels: parseLabels(sourceRefs),
    },
    related: {
      successes: categoryContents(relatedEntries, "success"),
      failures: categoryContents(relatedEntries, "error"),
      decisions: categoryContents(relatedEntries, "decision"),
      lessons: categoryContents(relatedEntries, "constraint"),
    },
    artifacts: {
      filesChanged: sourceRefValues(sourceRefs, ["file:", "path:"]),
      commandsRun: sourceRefValues(sourceRefs, ["cmd:", "command:"]),
      commits: sourceRefValues(sourceRefs, ["commit:"]),
    },
    processLesson,
  };
}
