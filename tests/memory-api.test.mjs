import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { startMemoryApiServer } from "../src/api/server.mjs";

function createTempDbPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vault2-memory-api-"));
  return path.join(dir, "vault2.db");
}

async function withServer(run, options = {}) {
  const dbPath = createTempDbPath();
  const runtime = await startMemoryApiServer({
    dbPath,
    host: "127.0.0.1",
    port: 0,
    projectRegistry: options.projectRegistry || new Set(["vault-2"]),
  });

  try {
    await run(runtime);
  } finally {
    await runtime.close();
  }
}

test("GET /api/memory supports cross-project mode with projectId=all", async () => {
  await withServer(
    async ({ baseUrl }) => {
      const entries = [
        {
          projectId: "vault-2",
          featureScope: "retrieval",
          taskType: "dev",
          agentId: "codex-dev",
          lessonCategory: "error",
          content: "vault2 memory",
          sourceRefs: ["VAULT-2-003"],
          labels: ["retrieval"],
        },
        {
          projectId: "fairly",
          featureScope: "workflow",
          taskType: "pm",
          agentId: "codex-pm",
          lessonCategory: "decision",
          content: "fairly memory",
          sourceRefs: ["FAIRLY-0007"],
          labels: ["workflow"],
        },
      ];

      for (const entry of entries) {
        const res = await fetch(`${baseUrl}/api/memory`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(entry),
        });
        assert.equal(res.status, 201);
      }

      const response = await fetch(`${baseUrl}/api/memory?projectId=all&limit=20`);
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.entries.length, 2);
      const projectIds = payload.entries.map((entry) => entry.projectId).sort();
      assert.deepEqual(projectIds, ["fairly", "vault-2"]);
    },
    { projectRegistry: new Set(["vault-2", "fairly"]) },
  );
});

test("POST /api/memory appends an entry and returns source IDs", async () => {
  await withServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/api/memory`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: "vault-2",
        featureScope: "retrieval",
        taskType: "dev",
        agentId: "codex-dev",
        lessonCategory: "error",
        content: "Always scope retrieval by project id",
        sourceRefs: ["VAULT-2-003"],
        labels: ["memory", "api"],
      }),
    });

    assert.equal(response.status, 201);
    const payload = await response.json();

    assert.equal(typeof payload.entry.id, "string");
    assert.equal(payload.entry.projectId, "vault-2");
    assert.equal(payload.entry.lessonCategory, "error");
    assert.equal(payload.entry.sourceRefs.includes("VAULT-2-003"), true);
  });
});

test("POST /api/memory returns 400 on invalid payload", async () => {
  await withServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/api/memory`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: "vault-2",
        taskType: "dev",
      }),
    });

    assert.equal(response.status, 400);
  });
});

test("POST /api/memory returns 404 when project does not exist", async () => {
  await withServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/api/memory`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: "unknown-project",
        featureScope: "retrieval",
        taskType: "dev",
        agentId: "codex-dev",
        lessonCategory: "error",
        content: "x",
        sourceRefs: ["VAULT-2-003"],
      }),
    });

    assert.equal(response.status, 404);
  });
});

test("POST /api/memory returns 409 on duplicate id", async () => {
  await withServer(async ({ baseUrl }) => {
    const payload = {
      id: "mem-dup-001",
      projectId: "vault-2",
      featureScope: "retrieval",
      taskType: "dev",
      agentId: "codex-dev",
      lessonCategory: "error",
      content: "x",
      sourceRefs: ["VAULT-2-003"],
    };

    const first = await fetch(`${baseUrl}/api/memory`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    assert.equal(first.status, 201);

    const second = await fetch(`${baseUrl}/api/memory`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    assert.equal(second.status, 409);
  });
});

test("GET /api/memory supports contextual filters", async () => {
  await withServer(async ({ baseUrl }) => {
    const entries = [
      {
        projectId: "vault-2",
        featureScope: "retrieval",
        taskType: "dev",
        agentId: "codex-dev",
        lessonCategory: "error",
        content: "retrieval lesson",
        sourceRefs: ["VAULT-2-003"],
        labels: ["api", "retrieval"],
      },
      {
        projectId: "vault-2",
        featureScope: "memory-ui",
        taskType: "design",
        agentId: "codex-design",
        lessonCategory: "success",
        content: "ui lesson",
        sourceRefs: ["VAULT-2-007"],
        labels: ["ui"],
      },
    ];

    for (const entry of entries) {
      const res = await fetch(`${baseUrl}/api/memory`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(entry),
      });
      assert.equal(res.status, 201);
    }

    const response = await fetch(
      `${baseUrl}/api/memory?projectId=vault-2&featureScope=retrieval&taskType=dev&agentId=codex-dev&label=api`,
    );

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.entries.length, 1);
    assert.equal(payload.entries[0].featureScope, "retrieval");
    assert.equal(payload.entries[0].taskType, "dev");
    assert.equal(payload.entries[0].agentId, "codex-dev");
  });
});

test("GET /api/memory returns 400 when projectId is missing", async () => {
  await withServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/api/memory`);
    assert.equal(response.status, 400);
  });
});
