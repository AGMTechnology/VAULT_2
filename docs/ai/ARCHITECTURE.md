# VAULT_2 Architecture (Bootstrap)

## Principles
- Local-first
- Deterministic behavior
- Strict traceability of memory sources

## Target modules
- Memory Store (DB schema + migrations)
- Memory API (append/search/retrieval)
- Relevance Engine (ranking/scoring)
- Injection Service (ticket/handoff/referencePrompt)
- Memory Hub UI (design-system compliant)

## Initial folders
- src/api
- src/ui
- tests
- docs/ai