# VAULT_2

Memory-first platform for contextual AI memory orchestration.

## Mission
- Capture lessons learned after every ticket.
- Retrieve contextual memory fragments by project, feature, and task type.
- Inject memory into ticket creation, handoff, and agent reference contracts.

## Bootstrap Scope (VAULT-2-001)
- Dedicated standalone repository.
- Base structure for API/UI/tests.
- AI-friendly documentation and project rules.
- Design-system references linked to VAULT_0 sources.

## Structure
- src/api/ API surface for memory append/retrieval/injection.
- src/ui/ Memory Hub UI (design-system compliant).
- tests/ bootstrap and feature tests.
- docs/ai/ architecture, enjeux, playbook, design references.

## Quality Rules
- TDD mandatory (red -> green for each ticket).
- Keep scope limited to current ticket.
- Move tickets to in-review with explicit evidence.

## Commands
- npm test
- npm run test:tnr
- npm run test:tnr:full
- npm run start:api then open `http://127.0.0.1:3022/memory-hub`
- open `http://127.0.0.1:3022/memory-insights` for insights view

## TNR Runbook
- `npm run test:tnr` runs the dedicated end-to-end regression suite for memory critical paths:
  - memory API append/list validation
  - ticket workflow completion + audit trace
  - contextual retrieval scoring
  - compose injection endpoints (ticket/handoff/reference prompt)
  - UI route availability (`/memory-hub`, `/memory-insights`)
- `npm run test` runs all feature tests.
- `npm run test:tnr:full` replays full feature suite and dedicated TNR suite in one command.

## Memory API v1
- Start server: `npm run start:api`
- Endpoints:
  - `POST /api/memory` append a memory entry
  - `GET /api/memory` list and filter entries
  - `POST /api/memory/retrieve` contextual ranking with score/reasons/source refs
  - `GET /memory-hub` Memory Hub UI (list, filters, detail, UI states)
  - `GET /memory-insights` Memory Insights UI (top lessons, recurring errors, frequent decisions)
  - `POST /api/compose/ticket` enrich ticket draft with contextual memory
  - `POST /api/compose/handoff` enrich handoff markdown with contextual memory
  - `POST /api/compose/reference-prompt` enrich reference prompt with contextual memory
  - `POST /api/workflow/ticket-finish` enforce memory push at ticket completion (`in-review`/`done`)
  - `GET /api/workflow/audit` list memory push audit entries by project/ticket/agent
- Expected validation codes:
  - `400` invalid payload/query
  - `404` project not found
  - `409` duplicate memory entry id
