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