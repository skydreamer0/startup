# pos-ui Module Context

## Purpose

`pos-ui` is the React + Vite point-of-sale interface. It owns cashier-facing workflows, POS state, POS service calls, and POS UI tests / Playwright flows.

## Read this first for

- POS checkout, cart, payment, settlement, or shift UI work.
- POS state/store/service changes.
- POS unit, integration, or E2E test failures.

## Directory map

| Path | Purpose |
| ---- | ------- |
| `src/api/` | POS API clients and request helpers. |
| `src/components/` | POS UI components. |
| `src/components/ui/` | Lower-level reusable UI primitives. |
| `src/hooks/` | POS hooks. |
| `src/lib/` | POS utilities. |
| `src/pages/` | POS screens. |
| `src/services/` | POS workflow services. |
| `src/store/` | POS state management. |
| `src/__tests__/` | POS unit/integration tests. |
| `e2e/` | Playwright E2E tests. |

## Source-of-truth documents

| Need | Read |
| ---- | ---- |
| POS roadmap / status | `../ROADMAP.md` |
| Backend API contract | `../infrastructure/api/api_spec.md` |
| Shared types | `../packages/types/MODULE.md` and `../packages/types/src/` |
| POS plans | `../../docs/plans/` and `../../docs/archive/superpowers/plans/` only when referenced by roadmap or task |
| Agent route selection | `../../../docs/agents/navigation.md` from repo root |

## Common task routes

### Change checkout or cart behavior

1. Open the nearest POS page/component/store/service files.
2. Read backend API spec if requests or persistence are involved.
3. Open nearest POS tests or E2E flow.
4. Update context if workflow meaning, task routing, or API contract assumptions change.

### Debug POS test failure

1. Read the failing unit/integration/E2E test.
2. Open only referenced POS files.
3. Read backend docs/source only if the failure crosses the API boundary.

### Change POS API calls

1. Read `../infrastructure/api/api_spec.md`.
2. Open the relevant `src/api/` or `src/services/` files.
3. Open affected stores/pages/tests.

## Commands

Run from `systems/enterprise-admin/pos-ui/`:

```bash
npm run test
npm run test:e2e
npm run build
```

## Do not assume

- Do not read admin UI unless the task involves shared behavior or shared components.
- Do not change backend assumptions without checking the API spec and relevant backend module.
- Do not infer POS roadmap completion from UI files; read `../ROADMAP.md` first.
