import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { startMemoryApiServer } from "../src/api/server.mjs";

function createTempDbPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vault2-memory-retrieve-"));
  return path.join(dir, "vault2.db");
}

async function withServer(run) {
  const dbPath = createTempDbPath();
  const runtime = await startMemoryApiServer({
    dbPath,
    host: "127.0.0.1",
    port: 0,
    projectRegistry: new Set(["vault-2"]),
  });

  try {
    await run(runtime);
  } finally {
    await runtime.close();
  }
}

async function appendEntry(baseUrl, payload) {
  const response = await fetch(`${baseUrl}/api/memory`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  assert.equal(response.status, 201);
}

test("POST /api/memory/retrieve ranks by contextual score and exposes source justification", async () => {
  await withServer(async ({ baseUrl }) => {
    await appendEntry(baseUrl, {
      id: "mem-workflow-dev",
      projectId: "vault-2",
      featureScope: "workflow",
      taskType: "dev",
      agentId: "codex-dev",
      lessonCategory: "error",
      content: "Workflow transition failed without explicit memory source refs",
      sourceRefs: ["VAULT-2-004", "commit:abc001"],
      labels: ["workflow", "api"],
      createdAt: "2026-02-20T09:00:00.000Z",
    });

    await appendEntry(baseUrl, {
      id: "mem-memory-ui",
      projectId: "vault-2",
      featureScope: "memory-ui",
      taskType: "design",
      agentId: "codex-design",
      lessonCategory: "success",
      content: "UI list density improved with larger ticket cards",
      sourceRefs: ["VAULT-2-007"],
      labels: ["ui"],
      createdAt: "2026-02-20T09:01:00.000Z",
    });

    await appendEntry(baseUrl, {
      id: "mem-workflow-qa",
      projectId: "vault-2",
      featureScope: "workflow",
      taskType: "qa",
      agentId: "codex-qa",
      lessonCategory: "constraint",
      content: "Workflow regression requires end-to-end checks before in-review",
      sourceRefs: ["VAULT-2-009"],
      labels: ["workflow", "tnr"],
      createdAt: "2026-02-20T09:02:00.000Z",
    });

    const response = await fetch(`${baseUrl}/api/memory/retrieve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: "vault-2",
        featureScope: "workflow",
        taskType: "dev",
        priority: "P0",
        labels: ["api", "workflow"],
        searchQuery: "source refs transition",
        limit: 3,
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();

    assert.equal(payload.meta.fallbackUsed, false);
    assert.equal(payload.entries.length, 3);
    assert.equal(payload.entries[0].id, "mem-workflow-dev");
    assert.equal(typeof payload.entries[0].score, "number");
    assert.equal(payload.entries[0].score > payload.entries[1].score, true);
    assert.equal(payload.entries[0].sourceRefs.includes("VAULT-2-004"), true);
    assert.equal(payload.entries[0].reasons.length > 0, true);
  });
});

test("POST /api/memory/retrieve adapts ranking for a different context", async () => {
  await withServer(async ({ baseUrl }) => {
    await appendEntry(baseUrl, {
      id: "mem-dev-error",
      projectId: "vault-2",
      featureScope: "workflow",
      taskType: "dev",
      agentId: "codex-dev",
      lessonCategory: "error",
      content: "Critical API failure in workflow",
      sourceRefs: ["VAULT-2-004"],
      labels: ["api"],
      createdAt: "2026-02-20T09:00:00.000Z",
    });
    await appendEntry(baseUrl, {
      id: "mem-design-success",
      projectId: "vault-2",
      featureScope: "memory-ui",
      taskType: "design",
      agentId: "codex-design",
      lessonCategory: "success",
      content: "Design refresh for memory details",
      sourceRefs: ["VAULT-2-008"],
      labels: ["ui", "design-system"],
      createdAt: "2026-02-20T09:01:00.000Z",
    });

    const response = await fetch(`${baseUrl}/api/memory/retrieve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: "vault-2",
        featureScope: "memory-ui",
        taskType: "design",
        priority: "P3",
        labels: ["ui"],
        limit: 2,
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.entries[0].id, "mem-design-success");
  });
});

test("POST /api/memory/retrieve provides robust fallback for low-context input", async () => {
  await withServer(async ({ baseUrl }) => {
    await appendEntry(baseUrl, {
      id: "mem-old",
      projectId: "vault-2",
      featureScope: "workflow",
      taskType: "dev",
      agentId: "codex-dev",
      lessonCategory: "error",
      content: "Older lesson",
      sourceRefs: ["VAULT-2-001"],
      createdAt: "2026-02-20T09:00:00.000Z",
    });
    await appendEntry(baseUrl, {
      id: "mem-new",
      projectId: "vault-2",
      featureScope: "retrieval",
      taskType: "qa",
      agentId: "codex-qa",
      lessonCategory: "decision",
      content: "Newest lesson",
      sourceRefs: ["VAULT-2-003"],
      createdAt: "2026-02-20T10:00:00.000Z",
    });

    const response = await fetch(`${baseUrl}/api/memory/retrieve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: "vault-2",
        limit: 2,
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.meta.fallbackUsed, true);
    assert.equal(payload.entries.length, 2);
    assert.equal(payload.entries[0].id, "mem-new");
    assert.equal(payload.entries[0].reasons.includes("fallback:latest-project-memory"), true);
  });
});
