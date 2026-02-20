function toLower(value) {
  return typeof value === "string" ? value.toLowerCase() : "";
}

function parseCreatedAt(value) {
  const timestamp = Date.parse(value || "");
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function normalizeContent(value) {
  return toLower(value)
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function makeGroupSeed(entry) {
  return {
    summary: entry.content || "",
    category: entry.lessonCategory || "",
    count: 0,
    latestAt: entry.createdAt || "",
    sourceEntryIds: new Set(),
    sourceRefs: new Set(),
  };
}

function materializeGroup(group) {
  return {
    summary: group.summary,
    category: group.category,
    count: group.count,
    latestAt: group.latestAt,
    sourceEntryIds: Array.from(group.sourceEntryIds),
    sourceRefs: Array.from(group.sourceRefs),
  };
}

function compareGroups(a, b) {
  if (b.count !== a.count) {
    return b.count - a.count;
  }
  const dateDiff = parseCreatedAt(b.latestAt) - parseCreatedAt(a.latestAt);
  if (dateDiff !== 0) {
    return dateDiff;
  }
  return a.summary.localeCompare(b.summary);
}

export function aggregateMemoryInsights(entries, filters = {}) {
  const projectId = toLower(filters.projectId || "");
  const isCrossProject = projectId === "all";
  const featureScope = toLower(filters.featureScope || "");
  const taskType = toLower(filters.taskType || "");

  const filteredEntries = entries.filter((entry) => {
    if (!isCrossProject && projectId && toLower(entry.projectId) !== projectId) {
      return false;
    }
    if (featureScope && toLower(entry.featureScope) !== featureScope) {
      return false;
    }
    if (taskType && toLower(entry.taskType) !== taskType) {
      return false;
    }
    return true;
  });

  const grouped = new Map();
  for (const entry of filteredEntries) {
    const fingerprint = normalizeContent(entry.content || "");
    if (!fingerprint) {
      continue;
    }
    const key = `${toLower(entry.lessonCategory)}::${fingerprint}`;
    const group = grouped.get(key) || makeGroupSeed(entry);
    group.count += 1;
    group.sourceEntryIds.add(entry.id);
    for (const ref of entry.sourceRefs || []) {
      if (typeof ref === "string" && ref.trim()) {
        group.sourceRefs.add(ref.trim());
      }
    }
    if (parseCreatedAt(entry.createdAt) >= parseCreatedAt(group.latestAt)) {
      group.latestAt = entry.createdAt;
      group.summary = entry.content || group.summary;
    }
    grouped.set(key, group);
  }

  const allGroups = Array.from(grouped.values()).map(materializeGroup).sort(compareGroups);
  const recurringErrors = allGroups
    .filter((group) => toLower(group.category) === "error" && group.count >= 2)
    .sort(compareGroups);
  const frequentDecisions = allGroups
    .filter((group) => toLower(group.category) === "decision")
    .sort(compareGroups);

  return {
    totalSourceEntries: filteredEntries.length,
    topLessons: allGroups.slice(0, 8),
    recurringErrors,
    frequentDecisions,
  };
}

export function deriveMemoryInsightsUiState({ loading, error, insights }) {
  if (loading) {
    return "loading";
  }
  if (error) {
    return "error";
  }
  if (!insights || insights.totalSourceEntries === 0) {
    return "empty";
  }
  return "success";
}

export function buildMemorySourceLink(projectId, entryId) {
  return `/memory-hub?projectId=${encodeURIComponent(projectId)}&entryId=${encodeURIComponent(entryId)}`;
}
