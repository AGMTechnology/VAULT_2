import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { startMemoryApiServer } from "../src/api/server.mjs";

function createTempDbPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vault2-tnr-suite-"));
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

async function postJson(baseUrl, pathname, payload) {
  return fetch(`${baseUrl}${pathname}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function seedMemory(baseUrl) {
  const entries = [
    {
      id: "mem-tnr-001",
      projectId: "vault-2",
      featureScope: "workflow",
      taskType: "dev",
      agentId: "codex-dev",
      lessonCategory: "error",
      content: "Workflow completion needs explicit memory source references.",
      sourceRefs: ["VAULT-2-004", "label:workflow"],
      createdAt: "2026-02-20T09:00:00.000Z",
    },
    {
      id: "mem-tnr-002",
      projectId: "vault-2",
      featureScope: "retrieval",
      taskType: "dev",
      agentId: "codex-dev",
      lessonCategory: "decision",
      content: "Reuse a shared retrieval engine for all memory composition paths.",
      sourceRefs: ["VAULT-2-005", "label:retrieval"],
      createdAt: "2026-02-20T09:10:00.000Z",
    },
    {
      id: "mem-tnr-003",
      projectId: "vault-2",
      featureScope: "memory-ui",
      taskType: "design",
      agentId: "codex-design",
      lessonCategory: "success",
      content: "Memory cards stay readable with stable spacing tokens.",
      sourceRefs: ["VAULT-2-007", "label:ui"],
      createdAt: "2026-02-20T09:20:00.000Z",
    },
  ];

  for (const entry of entries) {
    const response = await postJson(baseUrl, "/api/memory", entry);
    assert.equal(response.status, 201);
  }
}

test("TNR e2e happy path: api + workflow + retrieval + injection + ui routes", async () => {
  await withServer(async ({ baseUrl }) => {
    await seedMemory(baseUrl);

    const listResponse = await fetch(`${baseUrl}/api/memory?projectId=vault-2&limit=20`);
    assert.equal(listResponse.status, 200);
    const listPayload = await listResponse.json();
    assert.equal(listPayload.entries.length >= 3, true);

    const workflowResponse = await postJson(baseUrl, "/api/workflow/ticket-finish", {
      projectId: "vault-2",
      ticketId: "VAULT-2-009",
      fromStatus: "in-progress",
      toStatus: "in-review",
      agentId: "codex-dev",
      memory: {
        featureScope: "workflow",
        taskType: "dev",
        lessonCategory: "decision",
        content: "Capture workflow completion memory for future tickets.",
        sourceRefs: ["VAULT-2-009:dev-done"],
        labels: ["workflow", "tnr"],
      },
    });
    assert.equal(workflowResponse.status, 201);
    const workflowPayload = await workflowResponse.json();
    assert.equal(workflowPayload.audit.ticketId, "VAULT-2-009");

    const auditResponse = await fetch(
      `${baseUrl}/api/workflow/audit?projectId=vault-2&ticketId=VAULT-2-009`,
    );
    assert.equal(auditResponse.status, 200);
    const auditPayload = await auditResponse.json();
    assert.equal(auditPayload.entries.length >= 1, true);

    const retrievalResponse = await postJson(baseUrl, "/api/memory/retrieve", {
      projectId: "vault-2",
      featureScope: "workflow",
      taskType: "dev",
      priority: "P0",
      labels: ["workflow"],
      searchQuery: "completion memory source",
      limit: 5,
    });
    assert.equal(retrievalResponse.status, 200);
    const retrievalPayload = await retrievalResponse.json();
    assert.equal(retrievalPayload.entries.length >= 1, true);
    assert.equal(Array.isArray(retrievalPayload.entries[0].reasons), true);

    const composeTicketResponse = await postJson(baseUrl, "/api/compose/ticket", {
      projectId: "vault-2",
      title: "TNR compose ticket",
      featureScope: "workflow",
      taskType: "dev",
      priority: "P0",
      labels: ["workflow"],
      specMarkdown: "Base specification",
      limit: 5,
    });
    assert.equal(composeTicketResponse.status, 200);
    const composeTicketPayload = await composeTicketResponse.json();
    assert.equal(
      composeTicketPayload.ticket.specMarkdown.includes("Lessons to avoid repeating mistakes"),
      true,
    );
    assert.equal(composeTicketPayload.memoryTrace.sourceMemoryIds.length >= 1, true);

    const composeHandoffResponse = await postJson(baseUrl, "/api/compose/handoff", {
      projectId: "vault-2",
      ticketId: "VAULT-2-009",
      summary: "TNR handoff summary",
      featureScope: "workflow",
      taskType: "dev",
      labels: ["workflow"],
      limit: 5,
    });
    assert.equal(composeHandoffResponse.status, 200);
    const composeHandoffPayload = await composeHandoffResponse.json();
    assert.equal(composeHandoffPayload.handoffMarkdown.includes("Memory source IDs:"), true);

    const composePromptResponse = await postJson(baseUrl, "/api/compose/reference-prompt", {
      projectId: "vault-2",
      ticketId: "VAULT-2-009",
      title: "TNR reference prompt",
      featureScope: "workflow",
      taskType: "dev",
      labels: ["workflow"],
      limit: 5,
    });
    assert.equal(composePromptResponse.status, 200);
    const composePromptPayload = await composePromptResponse.json();
    assert.equal(composePromptPayload.referencePrompt.includes("Memory source IDs:"), true);

    const hubUiResponse = await fetch(`${baseUrl}/memory-hub?projectId=vault-2`);
    assert.equal(hubUiResponse.status, 200);
    const hubHtml = await hubUiResponse.text();
    assert.equal(hubHtml.includes("Memory Hub"), true);

    const insightsUiResponse = await fetch(`${baseUrl}/memory-insights?projectId=vault-2`);
    assert.equal(insightsUiResponse.status, 200);
    const insightsHtml = await insightsUiResponse.text();
    assert.equal(insightsHtml.includes("Memory Insights"), true);
  });
});

test("TNR failure path: critical feature validations return explicit errors", async () => {
  await withServer(async ({ baseUrl }) => {
    const invalidMemoryResponse = await postJson(baseUrl, "/api/memory", {
      projectId: "vault-2",
      taskType: "dev",
    });
    assert.equal(invalidMemoryResponse.status, 400);

    const invalidWorkflowResponse = await postJson(baseUrl, "/api/workflow/ticket-finish", {
      projectId: "vault-2",
      ticketId: "VAULT-2-009",
      fromStatus: "in-progress",
      toStatus: "done",
      agentId: "codex-dev",
      memory: {
        featureScope: "workflow",
        taskType: "dev",
      },
    });
    assert.equal(invalidWorkflowResponse.status, 400);
    const invalidWorkflowPayload = await invalidWorkflowResponse.json();
    assert.equal(invalidWorkflowPayload.error, "Invalid workflow completion payload");

    const invalidRetrievalResponse = await postJson(baseUrl, "/api/memory/retrieve", {
      projectId: "vault-2",
      taskType: "invalid",
      limit: 5,
    });
    assert.equal(invalidRetrievalResponse.status, 400);

    const invalidComposeTicketResponse = await postJson(baseUrl, "/api/compose/ticket", {
      projectId: "vault-2",
      featureScope: "workflow",
    });
    assert.equal(invalidComposeTicketResponse.status, 400);

    const invalidComposeHandoffResponse = await postJson(baseUrl, "/api/compose/handoff", {
      projectId: "vault-2",
      summary: "missing ticket id",
    });
    assert.equal(invalidComposeHandoffResponse.status, 400);

    const invalidComposePromptResponse = await postJson(
      baseUrl,
      "/api/compose/reference-prompt",
      {
        projectId: "vault-2",
        title: "missing ticket id",
      },
    );
    assert.equal(invalidComposePromptResponse.status, 400);
  });
});
