import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { startMemoryApiServer } from "../src/api/server.mjs";

function createTempDbPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vault2-compose-memory-"));
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

async function appendMemory(baseUrl, payload) {
  const response = await fetch(`${baseUrl}/api/memory`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  assert.equal(response.status, 201);
}

test("POST /api/compose/ticket injects relevant memory into ticket and reference prompt", async () => {
  await withServer(async ({ baseUrl }) => {
    await appendMemory(baseUrl, {
      id: "mem-ticket-1",
      projectId: "vault-2",
      featureScope: "workflow",
      taskType: "dev",
      agentId: "codex-dev",
      lessonCategory: "error",
      content: "Always keep memory source IDs explicit in workflow transitions.",
      sourceRefs: ["VAULT-2-004", "commit:workflow123"],
      labels: ["workflow", "api"],
      createdAt: "2026-02-20T09:00:00.000Z",
    });

    await appendMemory(baseUrl, {
      id: "mem-ticket-2",
      projectId: "vault-2",
      featureScope: "memory-ui",
      taskType: "design",
      agentId: "codex-design",
      lessonCategory: "success",
      content: "UI memory details should show stable card proportions.",
      sourceRefs: ["VAULT-2-007"],
      labels: ["ui"],
      createdAt: "2026-02-20T09:01:00.000Z",
    });

    const response = await fetch(`${baseUrl}/api/compose/ticket`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: "vault-2",
        title: "Implement memory injection on ticket draft",
        featureScope: "workflow",
        taskType: "dev",
        priority: "P0",
        labels: ["workflow", "api"],
        specMarkdown: "Base ticket specification",
        limit: 3,
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ticket.specMarkdown.includes("Lessons to avoid repeating mistakes"), true);
    assert.equal(payload.ticket.specMarkdown.includes("mem-ticket-1"), true);
    assert.equal(payload.ticket.referencePrompt.includes("Lessons to avoid repeating mistakes"), true);
    assert.equal(payload.memoryTrace.sourceMemoryIds.includes("mem-ticket-1"), true);
  });
});

test("POST /api/compose/ticket keeps anti-repetition section when no contextual memory exists", async () => {
  await withServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/api/compose/ticket`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: "vault-2",
        title: "Draft without memory context",
        featureScope: "unknown-scope",
        taskType: "dev",
        priority: "P1",
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ticket.specMarkdown.includes("Lessons to avoid repeating mistakes"), true);
    assert.equal(payload.ticket.specMarkdown.includes("No contextual memory matched"), true);
    assert.equal(payload.memoryTrace.sourceMemoryIds.length, 0);
  });
});

test("POST /api/compose/handoff returns enriched handoff markdown with memory trace", async () => {
  await withServer(async ({ baseUrl }) => {
    await appendMemory(baseUrl, {
      id: "mem-handoff-1",
      projectId: "vault-2",
      featureScope: "handoff",
      taskType: "dev",
      agentId: "codex-dev",
      lessonCategory: "decision",
      content: "Capture unresolved blockers directly in handoff body.",
      sourceRefs: ["VAULT-2-010"],
      labels: ["handoff"],
      createdAt: "2026-02-20T09:00:00.000Z",
    });

    const response = await fetch(`${baseUrl}/api/compose/handoff`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: "vault-2",
        ticketId: "VAULT-2-006",
        summary: "Handoff for memory injection work",
        featureScope: "handoff",
        taskType: "dev",
        labels: ["handoff"],
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.handoffMarkdown.includes("# Handoff - VAULT-2-006"), true);
    assert.equal(payload.handoffMarkdown.includes("Lessons to avoid repeating mistakes"), true);
    assert.equal(payload.handoffMarkdown.includes("mem-handoff-1"), true);
    assert.equal(payload.memoryTrace.sourceMemoryIds.includes("mem-handoff-1"), true);
  });
});

test("POST /api/compose/reference-prompt traces source memory ids", async () => {
  await withServer(async ({ baseUrl }) => {
    await appendMemory(baseUrl, {
      id: "mem-prompt-1",
      projectId: "vault-2",
      featureScope: "prompting",
      taskType: "dev",
      agentId: "codex-dev",
      lessonCategory: "constraint",
      content: "Reference prompts must include explicit source IDs.",
      sourceRefs: ["VAULT-2-006", "commit:prompt001"],
      labels: ["prompting"],
      createdAt: "2026-02-20T09:00:00.000Z",
    });

    const response = await fetch(`${baseUrl}/api/compose/reference-prompt`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: "vault-2",
        ticketId: "VAULT-2-006",
        title: "Inject memory into reference prompt",
        featureScope: "prompting",
        taskType: "dev",
        labels: ["prompting"],
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.referencePrompt.includes("Lessons to avoid repeating mistakes"), true);
    assert.equal(payload.referencePrompt.includes("Memory source IDs:"), true);
    assert.equal(payload.memoryTrace.sourceMemoryIds.includes("mem-prompt-1"), true);
  });
});

test("compose endpoints include Human/Process Lessons when structured post-mortem context exists", async () => {
  await withServer(async ({ baseUrl }) => {
    await appendMemory(baseUrl, {
      id: "mem-process-compose-1",
      projectId: "vault-2",
      featureScope: "workflow",
      taskType: "dev",
      agentId: "codex-dev",
      lessonCategory: "error",
      content: "[POST_MORTEM] UI memory request used invalid limit.",
      sourceRefs: ["VAULT-2-010", "label:postmortem"],
      labels: ["postmortem", "workflow"],
      processLesson: {
        decisionMoment: "Set fetch limit manually in UI module.",
        assumptionMade: "Expected backend to auto-cap limit.",
        humanReason: "Rushed UX tweak and skipped API contract recheck.",
        missedControl: "Verify request params against API validator boundaries.",
        nextRule: "Only build request URLs via bounded helper + test.",
      },
      createdAt: "2026-02-20T12:00:00.000Z",
    });

    const ticketResponse = await fetch(`${baseUrl}/api/compose/ticket`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: "vault-2",
        title: "Apply memory process lessons in workflow",
        featureScope: "workflow",
        taskType: "dev",
        labels: ["workflow"],
        specMarkdown: "Base spec",
      }),
    });
    assert.equal(ticketResponse.status, 200);
    const ticketPayload = await ticketResponse.json();
    assert.equal(ticketPayload.ticket.specMarkdown.includes("Human/Process Lessons"), true);
    assert.equal(ticketPayload.ticket.specMarkdown.includes("Decision moment"), true);
    assert.equal(ticketPayload.ticket.referencePrompt.includes("Human/Process Lessons"), true);

    const handoffResponse = await fetch(`${baseUrl}/api/compose/handoff`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: "vault-2",
        ticketId: "VAULT-2-021",
        summary: "Apply process lesson",
        featureScope: "workflow",
        taskType: "dev",
        labels: ["workflow"],
      }),
    });
    assert.equal(handoffResponse.status, 200);
    const handoffPayload = await handoffResponse.json();
    assert.equal(handoffPayload.handoffMarkdown.includes("Human/Process Lessons"), true);
    assert.equal(handoffPayload.handoffMarkdown.includes("Next rule"), true);

    const promptResponse = await fetch(`${baseUrl}/api/compose/reference-prompt`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: "vault-2",
        ticketId: "VAULT-2-021",
        title: "Reference prompt with process lessons",
        featureScope: "workflow",
        taskType: "dev",
        labels: ["workflow"],
      }),
    });
    assert.equal(promptResponse.status, 200);
    const promptPayload = await promptResponse.json();
    assert.equal(promptPayload.referencePrompt.includes("Human/Process Lessons"), true);
    assert.equal(promptPayload.referencePrompt.includes("Missed control"), true);
  });
});

test("compose ticket remains backward-compatible with legacy memory entries without processLesson", async () => {
  await withServer(async ({ baseUrl }) => {
    await appendMemory(baseUrl, {
      id: "mem-legacy-1",
      projectId: "vault-2",
      featureScope: "workflow",
      taskType: "dev",
      agentId: "codex-dev",
      lessonCategory: "decision",
      content: "Legacy memory without structured process fields.",
      sourceRefs: ["VAULT-2-004"],
      labels: ["workflow"],
      createdAt: "2026-02-20T12:10:00.000Z",
    });

    const response = await fetch(`${baseUrl}/api/compose/ticket`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: "vault-2",
        title: "Legacy compatibility",
        featureScope: "workflow",
        taskType: "dev",
        labels: ["workflow"],
      }),
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ticket.specMarkdown.includes("Lessons to avoid repeating mistakes"), true);
    assert.equal(payload.ticket.specMarkdown.includes("Human/Process Lessons"), false);
  });
});
