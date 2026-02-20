import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";

import { createMemoryApi } from "./memory-api.mjs";
import { applyMemorySchemaMigration } from "./memory-store.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uiDir = path.resolve(__dirname, "../ui");

const staticUiRoutes = {
  "/memory-hub": {
    filePath: path.join(uiDir, "memory-hub.html"),
    contentType: "text/html; charset=utf-8",
  },
  "/memory-insights": {
    filePath: path.join(uiDir, "memory-insights.html"),
    contentType: "text/html; charset=utf-8",
  },
  "/ui/memory-hub.css": {
    filePath: path.join(uiDir, "memory-hub.css"),
    contentType: "text/css; charset=utf-8",
  },
  "/ui/memory-insights.css": {
    filePath: path.join(uiDir, "memory-insights.css"),
    contentType: "text/css; charset=utf-8",
  },
  "/ui/memory-hub.js": {
    filePath: path.join(uiDir, "memory-hub.js"),
    contentType: "application/javascript; charset=utf-8",
  },
  "/ui/memory-insights.js": {
    filePath: path.join(uiDir, "memory-insights.js"),
    contentType: "application/javascript; charset=utf-8",
  },
  "/ui/memory-hub-model.mjs": {
    filePath: path.join(uiDir, "memory-hub-model.mjs"),
    contentType: "application/javascript; charset=utf-8",
  },
  "/ui/memory-insights-model.mjs": {
    filePath: path.join(uiDir, "memory-insights-model.mjs"),
    contentType: "application/javascript; charset=utf-8",
  },
};

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) {
    return {};
  }

  return JSON.parse(raw);
}

function toQueryObject(url) {
  const query = {};
  for (const [key, value] of url.searchParams.entries()) {
    query[key] = value;
  }
  return query;
}

function sendStaticFile(res, routeConfig) {
  if (!fs.existsSync(routeConfig.filePath)) {
    json(res, 404, { error: "Not found" });
    return;
  }

  const fileContent = fs.readFileSync(routeConfig.filePath, "utf8");
  res.statusCode = 200;
  res.setHeader("content-type", routeConfig.contentType);
  res.end(fileContent);
}

function buildProjectRegistryFromDb(db) {
  const registry = new Set(["vault-2", "all"]);
  const rows = db
    .prepare(
      `
      SELECT DISTINCT project_id AS projectId
      FROM memory_entries
      WHERE project_id IS NOT NULL AND TRIM(project_id) <> ''
    `,
    )
    .all();

  for (const row of rows) {
    if (!row?.projectId || typeof row.projectId !== "string") {
      continue;
    }
    registry.add(row.projectId.trim().toLowerCase());
  }
  return registry;
}

export async function startMemoryApiServer({
  dbPath,
  host = "127.0.0.1",
  port = 0,
  projectRegistry,
}) {
  if (!dbPath) {
    throw new Error("dbPath is required");
  }

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  applyMemorySchemaMigration(db);

  const resolvedProjectRegistry = projectRegistry
    ? new Set(Array.from(projectRegistry).map((value) => String(value).trim().toLowerCase()))
    : buildProjectRegistryFromDb(db);

  const api = createMemoryApi({ db, projectRegistry: resolvedProjectRegistry });

  const server = http.createServer(async (req, res) => {
    try {
      if (!req.url) {
        json(res, 400, { error: "Bad request" });
        return;
      }

      const url = new URL(req.url, "http://localhost");

      const staticRoute = staticUiRoutes[url.pathname];
      if (staticRoute) {
        if (req.method !== "GET") {
          json(res, 405, { error: "Method not allowed" });
          return;
        }
        sendStaticFile(res, staticRoute);
        return;
      }

      if (url.pathname === "/api/memory") {
        if (req.method === "POST") {
          const body = await readJson(req);
          const result = api.postMemory(body);
          json(res, result.status, result.body);
          return;
        }

        if (req.method === "GET") {
          const query = toQueryObject(url);
          const result = api.getMemory(query);
          json(res, result.status, result.body);
          return;
        }

        json(res, 405, { error: "Method not allowed" });
        return;
      }

      if (url.pathname === "/api/workflow/ticket-finish") {
        if (req.method !== "POST") {
          json(res, 405, { error: "Method not allowed" });
          return;
        }

        const body = await readJson(req);
        const result = api.postWorkflowTicketFinish(body);
        json(res, result.status, result.body);
        return;
      }

      if (url.pathname === "/api/memory/retrieve") {
        if (req.method !== "POST") {
          json(res, 405, { error: "Method not allowed" });
          return;
        }

        const body = await readJson(req);
        const result = api.retrieveMemory(body);
        json(res, result.status, result.body);
        return;
      }

      if (url.pathname === "/api/compose/ticket") {
        if (req.method !== "POST") {
          json(res, 405, { error: "Method not allowed" });
          return;
        }

        const body = await readJson(req);
        const result = api.composeTicket(body);
        json(res, result.status, result.body);
        return;
      }

      if (url.pathname === "/api/compose/handoff") {
        if (req.method !== "POST") {
          json(res, 405, { error: "Method not allowed" });
          return;
        }

        const body = await readJson(req);
        const result = api.composeHandoff(body);
        json(res, result.status, result.body);
        return;
      }

      if (url.pathname === "/api/compose/reference-prompt") {
        if (req.method !== "POST") {
          json(res, 405, { error: "Method not allowed" });
          return;
        }

        const body = await readJson(req);
        const result = api.composeReferencePrompt(body);
        json(res, result.status, result.body);
        return;
      }

      if (url.pathname === "/api/workflow/audit") {
        if (req.method !== "GET") {
          json(res, 405, { error: "Method not allowed" });
          return;
        }

        const query = toQueryObject(url);
        const result = api.getWorkflowAudit(query);
        json(res, result.status, result.body);
        return;
      }

      json(res, 404, { error: "Not found" });
    } catch (error) {
      if (error instanceof SyntaxError) {
        json(res, 400, { error: "Invalid JSON body" });
        return;
      }

      json(res, 500, {
        error: "Internal server error",
        detail: error instanceof Error ? error.message : "unknown",
      });
    }
  });

  await new Promise((resolve) => {
    server.listen(port, host, resolve);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Unable to resolve server address");
  }

  const baseUrl = `http://${host}:${address.port}`;

  return {
    baseUrl,
    close: async () => {
      await new Promise((resolve) => {
        server.close(resolve);
      });
      db.close();
    },
  };
}

async function main() {
  const dbPath = process.env.VAULT2_DB_PATH || path.resolve(__dirname, "../../data/vault2.db");
  const host = process.env.VAULT2_API_HOST || "127.0.0.1";
  const port = Number.parseInt(process.env.VAULT2_API_PORT || "3022", 10);

  const runtime = await startMemoryApiServer({ dbPath, host, port });
  process.stdout.write(`VAULT_2 memory API running on ${runtime.baseUrl}\n`);

  const shutdown = async () => {
    await runtime.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  void main();
}
