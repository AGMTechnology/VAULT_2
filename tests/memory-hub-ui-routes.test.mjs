import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { startMemoryApiServer } from "../src/api/server.mjs";

function createTempDbPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vault2-memory-ui-routes-"));
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

test("GET /memory-hub serves the Memory Hub UI shell", async () => {
  await withServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/memory-hub`);
    assert.equal(response.status, 200);

    const html = await response.text();
    assert.equal(html.includes("Memory Hub"), true);
    assert.equal(html.includes("memory-hub-root"), true);
  });
});

test("GET /ui/memory-hub.css and /ui/memory-hub.js serve static assets", async () => {
  await withServer(async ({ baseUrl }) => {
    const cssResponse = await fetch(`${baseUrl}/ui/memory-hub.css`);
    assert.equal(cssResponse.status, 200);
    const css = await cssResponse.text();
    assert.equal(css.includes("--vault-brand-purple"), true);

    const jsResponse = await fetch(`${baseUrl}/ui/memory-hub.js`);
    assert.equal(jsResponse.status, 200);
    const js = await jsResponse.text();
    assert.equal(js.includes("renderMemoryHub"), true);
  });
});
