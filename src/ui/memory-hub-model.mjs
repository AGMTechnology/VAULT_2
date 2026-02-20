function toLower(value) {
  return typeof value === "string" ? value.toLowerCase() : "";
}

function toBoundedInteger(value, min, max, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isInteger(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
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

export function applyMemoryFilters(entries, filters = {}) {
  const featureScope = toLower(filters.featureScope || "");
  const taskType = toLower(filters.taskType || "");
  const lessonCategory = toLower(filters.lessonCategory || "");
  const agentId = toLower(filters.agentId || "");
  const query = toLower(filters.query || "");

  return [...entries]
    .filter((entry) => {
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

  for (const entry of entries) {
    if (entry.featureScope) featureScopes.add(entry.featureScope);
    if (entry.taskType) taskTypes.add(entry.taskType);
    if (entry.lessonCategory) lessonCategories.add(entry.lessonCategory);
    if (entry.agentId) agentIds.add(entry.agentId);
    for (const label of parseLabels(entry.sourceRefs || [])) {
      labels.add(label);
    }
  }

  return {
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
  return `/api/memory?${params.toString()}`;
}
