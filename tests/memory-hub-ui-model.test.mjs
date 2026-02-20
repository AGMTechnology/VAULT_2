import assert from "node:assert/strict";
import test from "node:test";

import {
  applyMemoryFilters,
  buildMemoryEntriesApiUrl,
  buildMemoryDetailContext,
  buildMemoryFilterOptions,
  deriveMemoryUiState,
  pickSelectedMemoryEntry,
} from "../src/ui/memory-hub-model.mjs";

const FIXTURES = [
  {
    id: "mem-1",
    projectId: "vault-2",
    featureScope: "workflow",
    taskType: "dev",
    agentId: "codex-dev",
    lessonCategory: "error",
    content: "Transition requires explicit memory source ids.",
    sourceRefs: [
      "VAULT-2-004",
      "source-session:SES-001",
      "source-project-id:vault-2",
      "source-project-name:VAULT_2",
      "label:workflow",
    ],
    createdAt: "2026-02-20T09:00:00.000Z",
  },
  {
    id: "mem-2",
    projectId: "vault-2",
    featureScope: "memory-ui",
    taskType: "design",
    agentId: "codex-design",
    lessonCategory: "success",
    content: "List and detail panel should preserve spacing proportions.",
    sourceRefs: [
      "VAULT-2-007",
      "source-session:SES-001",
      "source-project-id:vault-2",
      "source-project-name:VAULT_2",
      "label:ui",
    ],
    createdAt: "2026-02-20T10:00:00.000Z",
  },
  {
    id: "mem-3",
    projectId: "fairly",
    featureScope: "retrieval",
    taskType: "qa",
    agentId: "codex-qa",
    lessonCategory: "constraint",
    content: "Ranking fallback should avoid noisy matches.",
    sourceRefs: [
      "FAIRLY-001",
      "source-session:SES-002",
      "source-project-id:fairly",
      "source-project-name:Fairly",
      "label:tnr",
    ],
    createdAt: "2026-02-20T11:00:00.000Z",
    processLesson: {
      decisionMoment: "Added fallback ranking",
      assumptionMade: "Query always had context",
      humanReason: "Rushed for deadline",
      missedControl: "Missing low-context tests",
      nextRule: "Always add fallback tests",
    },
  },
];

test("applyMemoryFilters supports feature/task/category/agent/search filters", () => {
  const filtered = applyMemoryFilters(FIXTURES, {
    featureScope: "workflow",
    taskType: "dev",
    lessonCategory: "error",
    agentId: "codex-dev",
    query: "source ids",
  });

  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, "mem-1");
});

test("applyMemoryFilters supports project and date range filters", () => {
  const filtered = applyMemoryFilters(FIXTURES, {
    projectId: "vault-2",
    dateFrom: "2026-02-20",
    dateTo: "2026-02-20",
  });

  assert.equal(filtered.length, 2);
  assert.deepEqual(
    filtered.map((entry) => entry.id),
    ["mem-2", "mem-1"],
  );
});

test("deriveMemoryUiState returns loading/error/empty/success states", () => {
  assert.equal(deriveMemoryUiState({ loading: true, error: "", entries: [] }), "loading");
  assert.equal(deriveMemoryUiState({ loading: false, error: "boom", entries: [] }), "error");
  assert.equal(deriveMemoryUiState({ loading: false, error: "", entries: [] }), "empty");
  assert.equal(
    deriveMemoryUiState({ loading: false, error: "", entries: FIXTURES }),
    "success",
  );
});

test("pickSelectedMemoryEntry returns selected entry or fallback to first", () => {
  const explicit = pickSelectedMemoryEntry(FIXTURES, "mem-2");
  assert.equal(explicit?.id, "mem-2");

  const fallback = pickSelectedMemoryEntry(FIXTURES, "unknown");
  assert.equal(fallback?.id, "mem-1");

  const none = pickSelectedMemoryEntry([], "mem-1");
  assert.equal(none, null);
});

test("buildMemoryFilterOptions includes project options with readable labels", () => {
  const options = buildMemoryFilterOptions(FIXTURES);
  assert.equal(options.projectOptions.length, 2);
  assert.deepEqual(
    options.projectOptions.map((option) => option.id).sort((a, b) => a.localeCompare(b)),
    ["fairly", "vault-2"],
  );
});

test("buildMemoryDetailContext groups related session insights and process lesson", () => {
  const detail = buildMemoryDetailContext(FIXTURES[0], FIXTURES);
  assert.equal(detail.meta.sourceSessionId, "SES-001");
  assert.equal(detail.meta.sourceProjectName, "VAULT_2");
  assert.equal(detail.meta.ticketRefs.includes("VAULT-2-004"), true);
  assert.equal(detail.related.successes.includes("List and detail panel should preserve spacing proportions."), true);

  const detailWithProcessLesson = buildMemoryDetailContext(FIXTURES[2], FIXTURES);
  assert.equal(detailWithProcessLesson.processLesson.nextRule, "Always add fallback tests");
});

test("buildMemoryEntriesApiUrl clamps limit to API contract bounds", () => {
  assert.equal(
    buildMemoryEntriesApiUrl("all", { limit: 600 }),
    "/api/memory?projectId=all&limit=200",
  );
  assert.equal(
    buildMemoryEntriesApiUrl("all", { limit: -300 }),
    "/api/memory?projectId=all&limit=1",
  );
  assert.equal(
    buildMemoryEntriesApiUrl("", { limit: "invalid" }),
    "/api/memory?projectId=all&limit=200",
  );
  assert.equal(
    buildMemoryEntriesApiUrl("vault-2", { limit: 50, dateFrom: "2026-02-01", dateTo: "2026-02-20" }),
    "/api/memory?projectId=vault-2&limit=50&dateFrom=2026-02-01&dateTo=2026-02-20",
  );
});
