import {
  applyMemoryFilters,
  buildMemoryDetailContext,
  buildMemoryEntriesApiUrl,
  buildMemoryFilterOptions,
  buildMemoryStatusCounts,
  deriveMemoryUiState,
  pickSelectedMemoryEntry,
} from "./memory-hub-model.mjs";

const params = new URLSearchParams(window.location.search);
const initialProjectId = params.get("projectId") || "all";
const initialEntryId = params.get("entryId") || "";

const state = {
  loading: true,
  error: "",
  entries: [],
  selectedId: initialEntryId,
  filters: {
    projectId: initialProjectId,
    dateFrom: "",
    dateTo: "",
    query: "",
    featureScope: "",
    taskType: "",
    lessonCategory: "",
    agentId: "",
  },
};

const elements = {
  list: document.querySelector("#memory-list"),
  detail: document.querySelector("#memory-detail"),
  stateMessage: document.querySelector("#ui-state-message"),
  listCount: document.querySelector("#list-count"),
  statusStrip: document.querySelector("#status-strip"),
  activeFilters: document.querySelector("#active-filters"),
  refreshButton: document.querySelector("#refresh-button"),
  resetFilters: document.querySelector("#reset-filters"),
  filterProject: document.querySelector("#filter-project"),
  filterDateFrom: document.querySelector("#filter-date-from"),
  filterDateTo: document.querySelector("#filter-date-to"),
  filterQuery: document.querySelector("#filter-query"),
  filterFeature: document.querySelector("#filter-feature"),
  filterTask: document.querySelector("#filter-task"),
  filterCategory: document.querySelector("#filter-category"),
  filterAgent: document.querySelector("#filter-agent"),
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function truncate(value, max = 110) {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max - 3)}...`;
}

function formatDate(value) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return "n/a";
  }
  const date = new Date(parsed);
  return date.toISOString().slice(0, 10);
}

function formatDateTime(value) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return "n/a";
  }
  return new Date(parsed).toLocaleString();
}

function toOptionHtml(value, label) {
  const escapedValue = escapeHtml(value);
  const escapedLabel = escapeHtml(label ?? value);
  return `<option value="${escapedValue}">${escapedLabel}</option>`;
}

function categoryClassName(category) {
  const normalized = (category || "").toLowerCase();
  if (normalized === "error") return "memory-pill-error";
  if (normalized === "success") return "memory-pill-success";
  if (normalized === "decision") return "memory-pill-decision";
  return "memory-pill-constraint";
}

function setSelectOptions(select, values, currentValue = "") {
  const options = ['<option value="">All</option>', ...values.map((value) => toOptionHtml(value, value))];
  select.innerHTML = options.join("");
  select.value = values.includes(currentValue) ? currentValue : "";
}

function setProjectOptions(select, projectOptions, currentValue = "all") {
  const options = [
    toOptionHtml("all", "All projects"),
    ...projectOptions.map((option) => toOptionHtml(option.id, option.label)),
  ];
  select.innerHTML = options.join("");
  const allowedValues = new Set(["all", ...projectOptions.map((option) => option.id)]);
  select.value = allowedValues.has(currentValue) ? currentValue : "all";
}

function renderStatusStrip(entries) {
  const counts = buildMemoryStatusCounts(entries);
  elements.statusStrip.innerHTML = `
    <span class="status-pill status-pill-errors">Errors ${counts.errors}</span>
    <span class="status-pill status-pill-success">Successes ${counts.successes}</span>
    <span class="status-pill status-pill-decisions">Decisions ${counts.decisions}</span>
    <span class="status-pill status-pill-constraints">Constraints ${counts.constraints}</span>
  `;
}

function activeFilterChips() {
  const chips = [];
  if (state.filters.projectId && state.filters.projectId !== "all") {
    chips.push(`Project: ${state.filters.projectId}`);
  }
  if (state.filters.dateFrom) {
    chips.push(`From: ${state.filters.dateFrom}`);
  }
  if (state.filters.dateTo) {
    chips.push(`To: ${state.filters.dateTo}`);
  }
  if (state.filters.query) {
    chips.push(`Search: ${state.filters.query}`);
  }
  if (state.filters.featureScope) {
    chips.push(`Feature: ${state.filters.featureScope}`);
  }
  if (state.filters.taskType) {
    chips.push(`Task: ${state.filters.taskType}`);
  }
  if (state.filters.lessonCategory) {
    chips.push(`Category: ${state.filters.lessonCategory}`);
  }
  if (state.filters.agentId) {
    chips.push(`Agent: ${state.filters.agentId}`);
  }
  return chips;
}

function renderActiveFilters() {
  const chips = activeFilterChips();
  if (chips.length === 0) {
    elements.activeFilters.innerHTML = '<span class="active-filters-empty">No active filters.</span>';
    return;
  }
  elements.activeFilters.innerHTML = chips
    .map((chip) => `<span class="active-filter-chip">${escapeHtml(chip)}</span>`)
    .join("");
}

function renderListBlock(title, items) {
  if (!items || items.length === 0) {
    return `
      <section class="detail-section">
        <h3>${escapeHtml(title)}</h3>
        <p class="detail-list-empty">none</p>
      </section>
    `;
  }
  return `
    <section class="detail-section">
      <h3>${escapeHtml(title)}</h3>
      <ul class="detail-list">
        ${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>
    </section>
  `;
}

function renderDetail(entry) {
  if (!entry) {
    elements.detail.innerHTML = "<p>Select a memory entry to view details.</p>";
    return;
  }

  const detailContext = buildMemoryDetailContext(entry, state.entries);
  const meta = detailContext.meta;
  const related = detailContext.related;
  const artifacts = detailContext.artifacts;
  const processLesson = detailContext.processLesson;

  const sourceRefs = meta.sourceRefs
    .map((ref) => `<span class="source-pill">${escapeHtml(ref)}</span>`)
    .join("");
  const ticketRefs = meta.ticketRefs
    .map((ref) => `<span class="source-pill">${escapeHtml(ref)}</span>`)
    .join("");

  const processLessonHtml = processLesson
    ? `
      <section class="detail-section">
        <h3>Human/Process Lesson</h3>
        <ul class="detail-list">
          <li><strong>Decision moment:</strong> ${escapeHtml(processLesson.decisionMoment)}</li>
          <li><strong>Assumption made:</strong> ${escapeHtml(processLesson.assumptionMade)}</li>
          <li><strong>Human/process reason:</strong> ${escapeHtml(processLesson.humanReason)}</li>
          <li><strong>Missed control:</strong> ${escapeHtml(processLesson.missedControl)}</li>
          <li><strong>Next rule:</strong> ${escapeHtml(processLesson.nextRule)}</li>
        </ul>
      </section>
    `
    : "";

  elements.detail.innerHTML = `
    <p class="detail-title">${escapeHtml(entry.id)}</p>
    <p class="detail-content">${escapeHtml(entry.content || "")}</p>
    <div class="detail-grid">
      <div>
        <span class="detail-label">Project ID</span>
        <span class="detail-value">${escapeHtml(entry.projectId || "n/a")}</span>
      </div>
      <div>
        <span class="detail-label">Project Name</span>
        <span class="detail-value">${escapeHtml(meta.sourceProjectName || "n/a")}</span>
      </div>
      <div>
        <span class="detail-label">Source Session</span>
        <span class="detail-value">${escapeHtml(meta.sourceSessionId || "n/a")}</span>
      </div>
      <div>
        <span class="detail-label">Created</span>
        <span class="detail-value">${escapeHtml(formatDateTime(entry.createdAt))}</span>
      </div>
      <div>
        <span class="detail-label">Feature</span>
        <span class="detail-value">${escapeHtml(entry.featureScope || "n/a")}</span>
      </div>
      <div>
        <span class="detail-label">Task Type</span>
        <span class="detail-value">${escapeHtml(entry.taskType || "n/a")}</span>
      </div>
      <div>
        <span class="detail-label">Category</span>
        <span class="detail-value">${escapeHtml(entry.lessonCategory || "n/a")}</span>
      </div>
      <div>
        <span class="detail-label">Agent</span>
        <span class="detail-value">${escapeHtml(entry.agentId || "n/a")}</span>
      </div>
    </div>
    <span class="detail-label">Ticket / Source refs</span>
    <div class="source-list">${ticketRefs || "<span class=\"source-pill\">none</span>"}</div>
    <span class="detail-label">Raw source refs</span>
    <div class="source-list">${sourceRefs || "<span class=\"source-pill\">none</span>"}</div>
    ${processLessonHtml}
    ${renderListBlock("Failures", related.failures)}
    ${renderListBlock("Decisions", related.decisions)}
    ${renderListBlock("Lessons", related.lessons)}
    ${renderListBlock("Successes", related.successes)}
    ${renderListBlock("Files changed", artifacts.filesChanged)}
    ${renderListBlock("Commands run", artifacts.commandsRun)}
    ${renderListBlock("Commits", artifacts.commits)}
  `;
}

function renderList(filteredEntries) {
  const selected = pickSelectedMemoryEntry(filteredEntries, state.selectedId);
  state.selectedId = selected?.id || "";
  elements.listCount.textContent = `${filteredEntries.length} entries`;

  elements.list.innerHTML = filteredEntries
    .map((entry) => {
      const activeClass = entry.id === state.selectedId ? "memory-item-active" : "";
      return `
        <button class="memory-item ${activeClass}" data-id="${escapeHtml(entry.id)}" type="button">
          <div class="memory-meta">
            <span>${escapeHtml(entry.id)}</span>
            <span>${escapeHtml(formatDate(entry.createdAt))}</span>
          </div>
          <p class="memory-summary">${escapeHtml(truncate(entry.content || ""))}</p>
          <div class="memory-meta">
            <span class="memory-pill ${categoryClassName(entry.lessonCategory)}">${escapeHtml(entry.lessonCategory)}</span>
            <span>${escapeHtml(entry.projectId || "n/a")}</span>
            <span>${escapeHtml(entry.featureScope || "n/a")}</span>
            <span>${escapeHtml(entry.taskType || "n/a")}</span>
          </div>
        </button>
      `;
    })
    .join("");

  for (const button of elements.list.querySelectorAll(".memory-item")) {
    button.addEventListener("click", () => {
      state.selectedId = button.dataset.id || "";
      renderMemoryHub();
    });
  }

  renderDetail(selected);
}

export function renderMemoryHub() {
  const filteredEntries = applyMemoryFilters(state.entries, state.filters);
  const uiState = deriveMemoryUiState({
    loading: state.loading,
    error: state.error,
    entries: filteredEntries,
  });

  renderActiveFilters();
  renderStatusStrip(filteredEntries);

  if (uiState === "loading") {
    elements.stateMessage.textContent = "Loading memory entries...";
    elements.list.innerHTML = "";
    renderDetail(null);
    return;
  }

  if (uiState === "error") {
    elements.stateMessage.textContent = `Unable to load memory entries: ${state.error}`;
    elements.list.innerHTML = "";
    renderDetail(null);
    return;
  }

  if (uiState === "empty") {
    elements.stateMessage.textContent = "No memory entry matches the active filters.";
    elements.list.innerHTML = "";
    renderDetail(null);
    elements.listCount.textContent = "0 entries";
    return;
  }

  elements.stateMessage.textContent = "Success";
  renderList(filteredEntries);
}

function syncFilters() {
  state.filters.projectId = elements.filterProject.value || "all";
  state.filters.dateFrom = elements.filterDateFrom.value || "";
  state.filters.dateTo = elements.filterDateTo.value || "";
  state.filters.query = elements.filterQuery.value.trim();
  state.filters.featureScope = elements.filterFeature.value;
  state.filters.taskType = elements.filterTask.value;
  state.filters.lessonCategory = elements.filterCategory.value;
  state.filters.agentId = elements.filterAgent.value;
}

function hydrateFilterSelects(entries) {
  const options = buildMemoryFilterOptions(entries);
  const current = { ...state.filters };
  setProjectOptions(elements.filterProject, options.projectOptions, current.projectId || "all");
  setSelectOptions(elements.filterFeature, options.featureScopes, current.featureScope);
  setSelectOptions(elements.filterTask, options.taskTypes, current.taskType);
  setSelectOptions(elements.filterCategory, options.lessonCategories, current.lessonCategory);
  setSelectOptions(elements.filterAgent, options.agentIds, current.agentId);
  elements.filterDateFrom.value = current.dateFrom;
  elements.filterDateTo.value = current.dateTo;
  elements.filterQuery.value = current.query;
}

function resetFilters() {
  state.filters = {
    projectId: "all",
    dateFrom: "",
    dateTo: "",
    query: "",
    featureScope: "",
    taskType: "",
    lessonCategory: "",
    agentId: "",
  };
  hydrateFilterSelects(state.entries);
  renderMemoryHub();
}

async function loadMemoryEntries() {
  state.loading = true;
  state.error = "";
  renderMemoryHub();

  try {
    const response = await fetch(buildMemoryEntriesApiUrl("all", { limit: 200 }));
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const payload = await response.json();
    state.entries = Array.isArray(payload.entries) ? payload.entries : [];
    hydrateFilterSelects(state.entries);
  } catch (error) {
    state.error = error instanceof Error ? error.message : "unknown error";
  } finally {
    state.loading = false;
    renderMemoryHub();
  }
}

for (const element of [
  elements.filterProject,
  elements.filterDateFrom,
  elements.filterDateTo,
  elements.filterQuery,
  elements.filterFeature,
  elements.filterTask,
  elements.filterCategory,
  elements.filterAgent,
]) {
  element.addEventListener("input", () => {
    syncFilters();
    renderMemoryHub();
  });
  element.addEventListener("change", () => {
    syncFilters();
    renderMemoryHub();
  });
}

elements.refreshButton.addEventListener("click", () => {
  void loadMemoryEntries();
});

elements.resetFilters.addEventListener("click", () => {
  resetFilters();
});

void loadMemoryEntries();
