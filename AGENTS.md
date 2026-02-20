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
- 	ests/ bootstrap and feature tests.
- docs/ai/ architecture, enjeux, playbook, design references.

## Quality Rules
- TDD mandatory (red -> green for each ticket).
- Keep scope limited to current ticket.
- Move tickets to in-review with explicit evidence.

## Commands
`ash
npm test
`
"@ | Set-Content -Path "C:\Users\ahmed\Desktop\VAULT_2\README.md" -NoNewline

@"
# AGENTS - VAULT_2

Agent execution rules for VAULT_2:

1. Read and apply README.md, AGENTS_PM.md, and docs in docs/ai/ before coding.
2. Follow strict TDD: write failing tests first, then implementation, then green tests.
3. Keep changes scoped to the assigned ticket.
4. At end of each ticket, push a structured memory lesson entry.
5. Use the design system references in docs/ai/DESIGN_SYSTEM_VAULT0.md.
6. For in-review transition, provide explicit DEV_DONE evidence in ticket comments.