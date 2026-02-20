import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

const requiredFiles = [
  "README.md",
  "AGENTS.md",
  "AGENTS_PM.md",
  "docs/ai/README.md",
  "docs/ai/ARCHITECTURE.md",
  "docs/ai/PROJECT_ENJEUX.md",
  "docs/ai/AGENT_PLAYBOOK.md",
  "docs/ai/DESIGN_SYSTEM_VAULT0.md",
];

const requiredDirs = [
  "src/api",
  "src/ui",
  "tests",
  "docs/ai",
];

test("bootstrap docs and structure exist", () => {
  for (const rel of requiredFiles) {
    const abs = path.join(root, rel);
    assert.equal(fs.existsSync(abs), true, `Missing required file: ${rel}`);
  }

  for (const rel of requiredDirs) {
    const abs = path.join(root, rel);
    assert.equal(fs.existsSync(abs), true, `Missing required directory: ${rel}`);
  }
});