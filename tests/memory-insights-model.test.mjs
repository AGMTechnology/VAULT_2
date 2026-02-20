import assert from "node:assert/strict";
import test from "node:test";

import {
  aggregateMemoryInsights,
  buildMemorySourceLink,
  deriveMemoryInsightsUiState,
} from "../src/ui/memory-insights-model.mjs";

const ENTRIES = [
  {
    id: "mem-001",
    projectId: "vault-2",
    featureScope: "retrieval",
    taskType: "dev",
    lessonCategory: "error",
    content: "Memory retrieval timeout on API call.",
    sourceRefs: ["VAULT-2-005"],
    createdAt: "2026-02-20T09:00:00.000Z",
  },
  {
    id: "mem-002",
    projectId: "vault-2",
    featureScope: "retrieval",
    taskType: "dev",
    lessonCategory: "error",
    content: "Memory retrieval timeout on API call",
    sourceRefs: ["VAULT-2-005", "commit:abc"],
    createdAt: "2026-02-20T09:05:00.000Z",
  },
  {
    id: "mem-003",
    projectId: "vault-2",
    featureScope: "compose",
    taskType: "dev",
    lessonCategory: "decision",
    content: "Use shared retrieval engine for compose endpoints.",
    sourceRefs: ["VAULT-2-006"],
    createdAt: "2026-02-20T10:00:00.000Z",
  },
  {
    id: "mem-004",
    projectId: "vault-2",
    featureScope: "compose",
    taskType: "dev",
    lessonCategory: "decision",
    content: "Use shared retrieval engine for compose endpoints",
    sourceRefs: ["VAULT-2-006", "commit:def"],
    createdAt: "2026-02-20T10:30:00.000Z",
  },
  {
    id: "mem-005",
    projectId: "vault-2",
    featureScope: "memory-ui",
    taskType: "design",
    lessonCategory: "success",
    content: "Keep card spacing consistent with design tokens.",
    sourceRefs: ["VAULT-2-007"],
    createdAt: "2026-02-20T11:00:00.000Z",
  },
  {
    id: "mem-006",
    projectId: "fairly",
    featureScope: "workflow",
    taskType: "pm",
    lessonCategory: "decision",
    content: "Fairly cross-project memory for triage.",
    sourceRefs: ["FAIRLY-0007"],
    createdAt: "2026-02-20T11:30:00.000Z",
  },
];

test("aggregateMemoryInsights returns top lessons + recurring errors + frequent decisions", () => {
  const insights = aggregateMemoryInsights(ENTRIES, {
    projectId: "vault-2",
    featureScope: "",
    taskType: "",
  });

  assert.equal(insights.topLessons.length >= 2, true);
  assert.equal(insights.recurringErrors.length >= 1, true);
  assert.equal(insights.frequentDecisions.length >= 1, true);
  assert.equal(insights.topLessons[0].count >= 2, true);
  assert.equal(insights.recurringErrors[0].count, 2);
  assert.equal(insights.frequentDecisions[0].count, 2);
  assert.equal(insights.totalSourceEntries, 5);
});

test("aggregateMemoryInsights treats projectId=all as cross-project mode", () => {
  const insights = aggregateMemoryInsights(ENTRIES, {
    projectId: "all",
    featureScope: "",
    taskType: "",
  });

  assert.equal(insights.totalSourceEntries, ENTRIES.length);
});

test("aggregateMemoryInsights applies feature/task filters", () => {
  const insights = aggregateMemoryInsights(ENTRIES, {
    projectId: "vault-2",
    featureScope: "retrieval",
    taskType: "dev",
  });

  assert.equal(insights.totalSourceEntries, 2);
  assert.equal(insights.recurringErrors.length, 1);
  assert.equal(insights.frequentDecisions.length, 0);
});

test("deriveMemoryInsightsUiState returns loading/error/empty/success", () => {
  assert.equal(
    deriveMemoryInsightsUiState({ loading: true, error: "", insights: null }),
    "loading",
  );
  assert.equal(
    deriveMemoryInsightsUiState({ loading: false, error: "boom", insights: null }),
    "error",
  );
  assert.equal(
    deriveMemoryInsightsUiState({
      loading: false,
      error: "",
      insights: { totalSourceEntries: 0, topLessons: [], recurringErrors: [], frequentDecisions: [] },
    }),
    "empty",
  );
  assert.equal(
    deriveMemoryInsightsUiState({
      loading: false,
      error: "",
      insights: { totalSourceEntries: 2, topLessons: [{}], recurringErrors: [], frequentDecisions: [] },
    }),
    "success",
  );
});

test("buildMemorySourceLink builds navigation URL to Memory Hub detail", () => {
  const url = buildMemorySourceLink("vault-2", "mem-001");
  assert.equal(url, "/memory-hub?projectId=vault-2&entryId=mem-001");
});
