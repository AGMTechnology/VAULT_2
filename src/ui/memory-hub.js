import {
  applyMemoryFilters,
  buildMemoryFilterOptions,
  buildMemoryStatusCounts,
  deriveMemoryUiState,
  pickSelectedMemoryEntry,
} from "./memory-hub-model.mjs";

const params = new URLSearchParams(window.location.search);
const projectId = params.get("projectId") || "all";
const initialEntryId = params.get("entryId") || "";

const state = {
  loading: true,
  error: "",
  entries: [],
  selectedId: initialEntryId,
  filters: {
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
  refreshButton: document.querySelector("#refresh-button"),
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

function toOptionHtml(value) {
  const escaped = escapeHtml(value);
  return `<option value="${escaped}">${escaped}</option>`;
}

function categoryClassName(category) {
  const normalized = (category || "").toLowerCase();
  if (normalized === "error") return "memory-pill-error";
  if (normalized === "success") return "memory-pill-success";
  if (normalized === "decision") return "memory-pill-decision";
  return "memory-pill-constraint";
}

function setSelectOptions(select, values) {
  const options = ['<option value="">All</option>', ...values.map(toOptionHtml)];
  select.innerHTML = options.join("");
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

function renderDetail(entry) {
  if (!entry) {
    elements.detail.innerHTML = "<p>Select a memory entry to view details.</p>";
    return;
  }

  const sourceRefs = (entry.sourceRefs || [])
    .map((ref) => `<span class="source-pill">${escapeHtml(ref)}</span>`)
    .join("");

  elements.detail.innerHTML = `
    <p class="detail-title">${escapeHtml(entry.id)}</p>
    <p class="detail-content">${escapeHtml(entry.content || "")}</p>
    <div class="detail-grid">
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
      <div>
        <span class="detail-label">Created</span>
        <span class="detail-value">${escapeHtml(formatDate(entry.createdAt))}</span>
      </div>
      <div>
        <span class="detail-label">Project</span>
        <span class="detail-value">${escapeHtml(entry.projectId || "n/a")}</span>
      </div>
    </div>
    <span class="detail-label">Source Refs</span>
    <div class="source-list">${sourceRefs || "<span class=\"source-pill\">none</span>"}</div>
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
            <span>${escapeHtml(entry.featureScope || "n/a")}</span>
            <span>${escapeHtml(entry.taskType || "n/a")}</span>
            <span>${escapeHtml(entry.agentId || "n/a")}</span>
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
  state.filters.query = elements.filterQuery.value.trim();
  state.filters.featureScope = elements.filterFeature.value;
  state.filters.taskType = elements.filterTask.value;
  state.filters.lessonCategory = elements.filterCategory.value;
  state.filters.agentId = elements.filterAgent.value;
}

function hydrateFilterSelects(entries) {
  const options = buildMemoryFilterOptions(entries);
  setSelectOptions(elements.filterFeature, options.featureScopes);
  setSelectOptions(elements.filterTask, options.taskTypes);
  setSelectOptions(elements.filterCategory, options.lessonCategories);
  setSelectOptions(elements.filterAgent, options.agentIds);
}

async function loadMemoryEntries() {
  state.loading = true;
  state.error = "";
  renderMemoryHub();

  try {
    const response = await fetch(`/api/memory?projectId=${encodeURIComponent(projectId)}&limit=300`);
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

void loadMemoryEntries();
