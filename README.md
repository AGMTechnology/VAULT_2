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

## Memory API v1
- Start server: `npm run start:api`
- Endpoints:
  - `POST /api/memory` append a memory entry
  - `GET /api/memory` list and filter entries
  - `POST /api/memory/retrieve` contextual ranking with score/reasons/source refs
  - `POST /api/workflow/ticket-finish` enforce memory push at ticket completion (`in-review`/`done`)
  - `GET /api/workflow/audit` list memory push audit entries by project/ticket/agent
- Expected validation codes:
  - `400` invalid payload/query
  - `404` project not found
  - `409` duplicate memory entry id
