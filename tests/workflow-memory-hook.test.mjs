import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { startMemoryApiServer } from "../src/api/server.mjs";

function createTempDbPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vault2-workflow-hook-"));
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

test("POST /api/workflow/ticket-finish appends memory and stores audit entry", async () => {
  await withServer(async ({ baseUrl }) => {
    const completionPayload = {
      projectId: "vault-2",
      ticketId: "VAULT-2-004",
      fromStatus: "in-progress",
      toStatus: "in-review",
      agentId: "codex-dev",
      memory: {
        featureScope: "workflow",
        taskType: "dev",
        lessonCategory: "decision",
        content: "Push memory before in-review transition to preserve context.",
        sourceRefs: ["commit:123abc"],
        labels: ["workflow"],
      },
    };

    const response = await fetch(`${baseUrl}/api/workflow/ticket-finish`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(completionPayload),
    });

    assert.equal(response.status, 201);
    const payload = await response.json();

    assert.equal(payload.memoryEntry.projectId, "vault-2");
    assert.equal(payload.memoryEntry.agentId, "codex-dev");
    assert.equal(payload.memoryEntry.sourceRefs.includes("VAULT-2-004"), true);
    assert.equal(payload.audit.ticketId, "VAULT-2-004");
    assert.equal(payload.audit.toStatus, "in-review");

    const memoryResponse = await fetch(
      `${baseUrl}/api/memory?projectId=vault-2&searchQuery=in-review&limit=10`,
    );
    assert.equal(memoryResponse.status, 200);
    const memoryPayload = await memoryResponse.json();
    assert.equal(memoryPayload.entries.length, 1);
    assert.equal(memoryPayload.entries[0].id, payload.memoryEntry.id);
  });
});

test("POST /api/workflow/ticket-finish rejects incomplete memory payload with explicit error", async () => {
  await withServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/api/workflow/ticket-finish`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: "vault-2",
        ticketId: "VAULT-2-004",
        fromStatus: "in-progress",
        toStatus: "done",
        agentId: "codex-dev",
        memory: {
          featureScope: "workflow",
          taskType: "dev",
        },
      }),
    });

    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.error, "Invalid workflow completion payload");
    assert.equal(Array.isArray(payload.details), true);
    assert.equal(payload.details.includes("memory.lessonCategory is required"), true);
    assert.equal(payload.details.includes("memory.content is required"), true);
    assert.equal(payload.details.includes("memory.sourceRefs must contain at least one source id"), true);
  });
});

test("GET /api/workflow/audit filters by ticket and agent", async () => {
  await withServer(async ({ baseUrl }) => {
    const postEvent = async ({ ticketId, agentId }) => {
      const response = await fetch(`${baseUrl}/api/workflow/ticket-finish`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId: "vault-2",
          ticketId,
          fromStatus: "in-progress",
          toStatus: "in-review",
          agentId,
          memory: {
            featureScope: "memory-workflow",
            taskType: "dev",
            lessonCategory: "success",
            content: `Completed ${ticketId}`,
            sourceRefs: [`${ticketId}:dev-done`],
          },
        }),
      });
      assert.equal(response.status, 201);
    };

    await postEvent({ ticketId: "VAULT-2-004", agentId: "codex-dev" });
    await postEvent({ ticketId: "VAULT-2-004", agentId: "codex-qa" });
    await postEvent({ ticketId: "VAULT-2-005", agentId: "codex-dev" });

    const response = await fetch(
      `${baseUrl}/api/workflow/audit?projectId=vault-2&ticketId=VAULT-2-004&agentId=codex-dev`,
    );
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.entries.length, 1);
    assert.equal(payload.entries[0].ticketId, "VAULT-2-004");
    assert.equal(payload.entries[0].agentId, "codex-dev");
  });
});
