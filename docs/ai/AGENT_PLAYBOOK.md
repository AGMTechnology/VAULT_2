# VAULT_2 Agent Playbook

## Mandatory flow per ticket
1. Read mandatory docs from `AGENTS.md`.
2. Move ticket to `in-progress` (with reviewed docs evidence).
3. Follow TDD `red -> green` for the ticket scope.
4. Execute test commands and capture output in ticket evidence.
5. Add `[DEV_DONE]` comment with changed files, tests, and commit id.
6. Append one structured memory entry for the ticket.
7. Move ticket to `in-review`.

## Memory quality checklist
- project/feature/taskType identified
- clear success/failure/decision statements
- source references attached
- next-session focus added

## API-focused execution checklist
- Validate payloads and expected HTTP codes (`200/201/400/404/409`).
- For retrieval/injection changes, cover one nominal path and one failure path.
- Keep OpenAPI contract (`docs/ai/openapi.yaml`) aligned with real behavior.
- Update `docs/ai/MEMORY_RUNBOOK.md` when commands or payload examples change.
