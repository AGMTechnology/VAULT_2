import assert from "node:assert/strict";
import test from "node:test";

import {
  applyMemoryFilters,
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
    sourceRefs: ["VAULT-2-004", "label:workflow"],
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
    sourceRefs: ["VAULT-2-007", "label:ui"],
    createdAt: "2026-02-20T10:00:00.000Z",
  },
  {
    id: "mem-3",
    projectId: "vault-2",
    featureScope: "retrieval",
    taskType: "qa",
    agentId: "codex-qa",
    lessonCategory: "constraint",
    content: "Ranking fallback should avoid noisy matches.",
    sourceRefs: ["VAULT-2-005", "label:tnr"],
    createdAt: "2026-02-20T11:00:00.000Z",
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
