# VAULT_0 Design System Rules

Figma references used as source of truth:
- `https://www.figma.com/design/Iv7ECJGcMxmZnTtMq6A6UA/Untitled?node-id=2-2176&m=dev`
- `https://www.figma.com/design/Iv7ECJGcMxmZnTtMq6A6UA/Untitled?node-id=5-4256&m=dev`
- `https://www.figma.com/design/Iv7ECJGcMxmZnTtMq6A6UA/Untitled?node-id=5-4832&m=dev`

## Tokens

Canonical token source in code:
- `lib/ui/design-tokens.ts`

Global CSS variable injection:
- `app/layout.tsx` injects `vaultCssVariables`
- `app/globals.css` consumes those variables

Core mapping:
- `brand.purple` -> `#6c5ce7`
- `brand.navy` -> `#1a1a2e`
- `surface.sidebarBg` -> `#1a1a2e`
- `surface.cardBorder` -> `#e5e7eb`
- `text.primary` -> `#101828`
- `text.secondary` -> `#6a7282`

Typography mapping:
- Sans UI text: `Arimo`
- Key/ID monospace text: `Cousine`

## UI Rules

1. Use DS tokens first, never ad-hoc hex values for brand/surface/text.
2. Use status configuration from `components/dashboard/config.ts` for label + badge colors.
3. Keep board columns at fixed max height with internal scroll:
   - `max-h-[65vh]`
   - `md:max-h-[70vh]`
4. Keep sidebar width at DS value (`240px`) and dark navy background.
5. Ticket keys should use mono style for strong Jira-like readability.

## Component Boundaries

Dashboard view rendering is split into dedicated components:
- `components/dashboard/views/backlog-view.tsx`
- `components/dashboard/views/list-view.tsx`
- `components/dashboard/views/board-view.tsx`

The parent container keeps data loading, API calls, and orchestration in:
- `components/dashboard.tsx`

This split is intentional:
- view components stay presentational
- parent remains the workflow/state coordinator

## Icon & Status Conventions

Status pill and dot visual rules are centralized in:
- `components/dashboard/config.ts` (`STATUS_APPEARANCE`)

Do not duplicate status color logic in feature files.
Use:
- `STATUS_LABEL`
- `STATUS_BADGE`
- `getStatusPillClassName`

