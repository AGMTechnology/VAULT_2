import { buildMemoryFilterOptions } from "./memory-hub-model.mjs";
import {
  aggregateMemoryInsights,
  buildMemorySourceLink,
  deriveMemoryInsightsUiState,
} from "./memory-insights-model.mjs";

const params = new URLSearchParams(window.location.search);
const projectId = params.get("projectId") || "vault-2";

const state = {
  loading: true,
  error: "",
  entries: [],
  filters: {
    featureScope: "",
    taskType: "",
  },
};

const elements = {
  refreshButton: document.querySelector("#refresh-button"),
  filterFeature: document.querySelector("#filter-feature"),
  filterTask: document.querySelector("#filter-task"),
  stateMessage: document.querySelector("#insights-state-message"),
  topLessonsCount: document.querySelector("#top-lessons-count"),
  topLessonsList: document.querySelector("#top-lessons-list"),
  recurringErrorsCount: document.querySelector("#recurring-errors-count"),
  recurringErrorsList: document.querySelector("#recurring-errors-list"),
  frequentDecisionsCount: document.querySelector("#frequent-decisions-count"),
  frequentDecisionsList: document.querySelector("#frequent-decisions-list"),
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toOptionHtml(value) {
  const escaped = escapeHtml(value);
  return `<option value="${escaped}">${escaped}</option>`;
}

function setSelectOptions(select, values) {
  select.innerHTML = ['<option value="">All</option>', ...values.map(toOptionHtml)].join("");
}

function categoryClassName(category) {
  const normalized = (category || "").toLowerCase();
  if (normalized === "error") return "insight-pill-error";
  if (normalized === "decision") return "insight-pill-decision";
  if (normalized === "success") return "insight-pill-success";
  return "insight-pill-constraint";
}

function renderInsightCards(listElement, groups) {
  if (!groups || groups.length === 0) {
    listElement.innerHTML = '<p class="state-message">No insight available for current filters.</p>';
    return;
  }

  listElement.innerHTML = groups
    .map((group) => {
      const sourceLinks = group.sourceEntryIds
        .slice(0, 8)
        .map(
          (id) =>
            `<a class="insight-source-link" href="${escapeHtml(
              buildMemorySourceLink(projectId, id),
            )}">${escapeHtml(id)}</a>`,
        )
        .join("");

      return `
        <article class="insight-card">
          <h3>${escapeHtml(group.summary)}</h3>
          <div class="insight-meta">
            <span class="insight-pill ${categoryClassName(group.category)}">${escapeHtml(group.category)}</span>
            <span>count:${group.count}</span>
            <span>latest:${escapeHtml((group.latestAt || "").slice(0, 10) || "n/a")}</span>
          </div>
          <div class="insight-source-links">${sourceLinks}</div>
        </article>
      `;
    })
    .join("");
}

export function renderMemoryInsights() {
  const insights = aggregateMemoryInsights(state.entries, {
    projectId,
    featureScope: state.filters.featureScope,
    taskType: state.filters.taskType,
  });
  const uiState = deriveMemoryInsightsUiState({
    loading: state.loading,
    error: state.error,
    insights,
  });

  if (uiState === "loading") {
    elements.stateMessage.textContent = "Loading insights...";
    elements.topLessonsList.innerHTML = "";
    elements.recurringErrorsList.innerHTML = "";
    elements.frequentDecisionsList.innerHTML = "";
    return;
  }

  if (uiState === "error") {
    elements.stateMessage.textContent = `Unable to load insights: ${state.error}`;
    elements.topLessonsList.innerHTML = "";
    elements.recurringErrorsList.innerHTML = "";
    elements.frequentDecisionsList.innerHTML = "";
    return;
  }

  if (uiState === "empty") {
    elements.stateMessage.textContent = "No memory data available for this project/filter.";
    elements.topLessonsCount.textContent = "0";
    elements.recurringErrorsCount.textContent = "0";
    elements.frequentDecisionsCount.textContent = "0";
    elements.topLessonsList.innerHTML = "";
    elements.recurringErrorsList.innerHTML = "";
    elements.frequentDecisionsList.innerHTML = "";
    return;
  }

  elements.stateMessage.textContent = `Insights ready from ${insights.totalSourceEntries} entries.`;
  elements.topLessonsCount.textContent = String(insights.topLessons.length);
  elements.recurringErrorsCount.textContent = String(insights.recurringErrors.length);
  elements.frequentDecisionsCount.textContent = String(insights.frequentDecisions.length);

  renderInsightCards(elements.topLessonsList, insights.topLessons);
  renderInsightCards(elements.recurringErrorsList, insights.recurringErrors);
  renderInsightCards(elements.frequentDecisionsList, insights.frequentDecisions);
}

function syncFilters() {
  state.filters.featureScope = elements.filterFeature.value;
  state.filters.taskType = elements.filterTask.value;
}

function hydrateFilters() {
  const options = buildMemoryFilterOptions(state.entries);
  setSelectOptions(elements.filterFeature, options.featureScopes);
  setSelectOptions(elements.filterTask, options.taskTypes);
}

async function loadEntries() {
  state.loading = true;
  state.error = "";
  renderMemoryInsights();

  try {
    const response = await fetch(`/api/memory?projectId=${encodeURIComponent(projectId)}&limit=600`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const payload = await response.json();
    state.entries = Array.isArray(payload.entries) ? payload.entries : [];
    hydrateFilters();
  } catch (error) {
    state.error = error instanceof Error ? error.message : "unknown error";
  } finally {
    state.loading = false;
    renderMemoryInsights();
  }
}

for (const element of [elements.filterFeature, elements.filterTask]) {
  element.addEventListener("change", () => {
    syncFilters();
    renderMemoryInsights();
  });
}

elements.refreshButton.addEventListener("click", () => {
  void loadEntries();
});

void loadEntries();
