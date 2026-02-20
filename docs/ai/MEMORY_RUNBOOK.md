# VAULT_2 Memory Runbook

## API usage quickstart
1. Install dependencies: `npm install`
2. Start API server: `npm run start:api`
3. Base URL: `http://127.0.0.1:3022`

Health check by route:
- `GET /memory-hub`
- `GET /memory-insights`

Append memory entry:
```bash
curl -X POST http://127.0.0.1:3022/api/memory \
  -H "content-type: application/json" \
  -d '{
    "projectId": "vault-2",
    "featureScope": "workflow",
    "taskType": "dev",
    "agentId": "codex-dev",
    "lessonCategory": "decision",
    "content": "Replay tnr suite before in-review transitions.",
    "sourceRefs": ["VAULT-2-009", "commit:b3e4637"],
    "labels": ["tnr", "workflow"]
  }'
```

Post-mortem memory entry (5-point human/process template):
```bash
curl -X POST http://127.0.0.1:3022/api/memory \
  -H "content-type: application/json" \
  -d '{
    "projectId": "vault-2",
    "featureScope": "workflow",
    "taskType": "dev",
    "agentId": "codex-dev",
    "lessonCategory": "error",
    "content": "[POST_MORTEM] Front request used invalid API limit.",
    "sourceRefs": ["VAULT-2-021", "label:postmortem"],
    "labels": ["postmortem", "api-contract"],
    "processLesson": {
      "decisionMoment": "Set fetch limit in UI request builder.",
      "assumptionMade": "Backend would auto-clamp values.",
      "humanReason": "Rushed UI tweak and skipped contract reread.",
      "missedControl": "Compare request params with API validator bounds.",
      "nextRule": "Use shared bounded builder and add negative-value test."
    }
  }'
```

Retrieve contextual memory:
```bash
curl -X POST http://127.0.0.1:3022/api/memory/retrieve \
  -H "content-type: application/json" \
  -d '{
    "projectId": "vault-2",
    "featureScope": "workflow",
    "taskType": "dev",
    "priority": "P0",
    "labels": ["workflow"],
    "searchQuery": "in review transition",
    "limit": 5
  }'
```

List memory with project/date filters:
```bash
curl "http://127.0.0.1:3022/api/memory?projectId=all&dateFrom=2026-02-01&dateTo=2026-02-20&limit=200"
```
- `limit` must stay in the API contract range `1..200`.
- `dateFrom` and `dateTo` accept `YYYY-MM-DD` or ISO timestamp.

Compose ticket/handoff/reference prompt:
```bash
curl -X POST http://127.0.0.1:3022/api/compose/ticket \
  -H "content-type: application/json" \
  -d '{
    "projectId": "vault-2",
    "title": "New ticket using memory context",
    "featureScope": "workflow",
    "taskType": "dev",
    "priority": "P1",
    "labels": ["workflow"],
    "specMarkdown": "Base specification"
  }'
```

Workflow completion + audit:
```bash
curl -X POST http://127.0.0.1:3022/api/workflow/ticket-finish \
  -H "content-type: application/json" \
  -d '{
    "projectId": "vault-2",
    "ticketId": "VAULT-2-010",
    "fromStatus": "in-progress",
    "toStatus": "in-review",
    "agentId": "codex-dev",
    "memory": {
      "featureScope": "documentation",
      "taskType": "dev",
      "lessonCategory": "success",
      "content": "OpenAPI + runbook updates must stay tested by docs checks.",
      "sourceRefs": ["VAULT-2-010"],
      "labels": ["docs", "openapi"]
    }
  }'
```

Read workflow audit:
```bash
curl "http://127.0.0.1:3022/api/workflow/audit?projectId=vault-2&ticketId=VAULT-2-010&limit=20"
```

## Agent execution flow
1. Read `AGENTS.md` and all required docs.
2. Move assigned ticket to `in-progress`.
3. Start with failing test, then implementation, then green test.
4. Keep OpenAPI and docs aligned with behavior changes.
5. Add `[DEV_DONE]` evidence comment before `in-review`.
6. Push one memory entry with source refs for the finished ticket.
7. For post-mortem entries, include structured `processLesson` with 5 mandatory points:
   - decisionMoment
   - assumptionMade
   - humanReason
   - missedControl
   - nextRule

## Onboarding checklist
- Confirm local setup: `npm install`, `npm run test`, `npm run start:api`.
- Review API contract: `docs/ai/openapi.yaml`.
- Review architecture boundaries: `docs/ai/ARCHITECTURE.md`.
- Review delivery contract: `AGENTS.md` and `docs/ai/AGENT_PLAYBOOK.md`.
- Verify TNR commands: `npm run test:tnr` and `npm run test:tnr:full`.
- Validate one end-to-end memory cycle:
  - append with `POST /api/memory`
  - retrieve with `POST /api/memory/retrieve`
  - compose with `POST /api/compose/ticket`
  - audit with `GET /api/workflow/audit`
