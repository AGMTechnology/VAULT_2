import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { startMemoryApiServer } from "../src/api/server.mjs";

function createTempDbPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vault2-memory-insights-ui-"));
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

test("GET /memory-insights serves the Memory Insights UI shell", async () => {
  await withServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/memory-insights`);
    assert.equal(response.status, 200);

    const html = await response.text();
    assert.equal(html.includes("Memory Insights"), true);
    assert.equal(html.includes("memory-insights-root"), true);
  });
});

test("GET /ui/memory-insights.css and /ui/memory-insights.js serve static assets", async () => {
  await withServer(async ({ baseUrl }) => {
    const cssResponse = await fetch(`${baseUrl}/ui/memory-insights.css`);
    assert.equal(cssResponse.status, 200);
    const css = await cssResponse.text();
    assert.equal(css.includes("--vault-brand-purple"), true);

    const jsResponse = await fetch(`${baseUrl}/ui/memory-insights.js`);
    assert.equal(jsResponse.status, 200);
    const js = await jsResponse.text();
    assert.equal(js.includes("renderMemoryInsights"), true);
  });
});
