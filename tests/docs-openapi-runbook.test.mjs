import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

const expectedApiPaths = [
  "/api/memory",
  "/api/memory/retrieve",
  "/api/workflow/ticket-finish",
  "/api/workflow/audit",
  "/api/compose/ticket",
  "/api/compose/handoff",
  "/api/compose/reference-prompt",
];

test("VAULT-2-010 docs bundle exists and documents implemented API routes", () => {
  const openApiPath = path.join(root, "docs/ai/openapi.yaml");
  const runbookPath = path.join(root, "docs/ai/MEMORY_RUNBOOK.md");
  const docsIndexPath = path.join(root, "docs/ai/README.md");
  const serverPath = path.join(root, "src/api/server.mjs");

  assert.equal(fs.existsSync(openApiPath), true, "Missing docs/ai/openapi.yaml");
  assert.equal(fs.existsSync(runbookPath), true, "Missing docs/ai/MEMORY_RUNBOOK.md");

  const openApi = fs.readFileSync(openApiPath, "utf8");
  const runbook = fs.readFileSync(runbookPath, "utf8");
  const docsIndex = fs.readFileSync(docsIndexPath, "utf8");
  const serverCode = fs.readFileSync(serverPath, "utf8");

  for (const apiPath of expectedApiPaths) {
    assert.equal(
      openApi.includes(apiPath),
      true,
      `OpenAPI must document path: ${apiPath}`,
    );
    assert.equal(
      serverCode.includes(apiPath),
      true,
      `Server should implement path: ${apiPath}`,
    );
  }

  assert.equal(
    runbook.includes("## Onboarding checklist"),
    true,
    "Runbook must include onboarding checklist",
  );
  assert.equal(
    runbook.includes("## Agent execution flow"),
    true,
    "Runbook must include agent execution flow",
  );
  assert.equal(
    runbook.includes("## API usage quickstart"),
    true,
    "Runbook must include API usage quickstart",
  );
  assert.equal(
    docsIndex.includes("docs/ai/openapi.yaml"),
    true,
    "AI docs index must link openapi.yaml",
  );
  assert.equal(
    docsIndex.includes("docs/ai/MEMORY_RUNBOOK.md"),
    true,
    "AI docs index must link MEMORY_RUNBOOK.md",
  );
});
