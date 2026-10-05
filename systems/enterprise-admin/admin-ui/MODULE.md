# admin-ui Module Context

## Purpose

`admin-ui` is the React + Vite back-office web app for enterprise operators. It consumes backend APIs, shared types, and UI components to manage pharmacy operations.

## Read this first for

- Back-office page, component, hook, layout, or API-client work.
- UI tests for admin workflows.
- Changes that affect admin navigation, data display, or interaction patterns.

## Directory map

| Path | Purpose |
| ---- | ------- |
| `src/api/` | Admin UI API clients and request helpers. |
| `src/components/` | Reusable UI components. |
| `src/contexts/` | React context providers. |
| `src/hooks/` | Shared UI hooks. |
| `src/layouts/` | Layout shells and navigation structure. |
| `src/lib/` | UI utilities and shared frontend helpers. |
| `src/pages/` | Back-office feature pages such as CRM, Inventory, Orders, POS, Reports, and Shifts. |

## Source-of-truth documents

| Need | Read |
| ---- | ---- |
| Backend API contract | `../infrastructure/api/api_spec.md` |
| Shared types | `../packages/types/MODULE.md` and `../packages/types/src/` |
| Architecture constraints | `../infrastructure/adr/` when UI architecture changes |
| Agent route selection | `../../../docs/agents/navigation.md` from repo root |

## Common task routes

### Change an admin page

1. Open the nearest file under `src/pages/<area>/`.
2. Open referenced components, hooks, and API client files only as needed.
3. Read backend API spec only when request/response behavior is involved.

### Change an API client

1. Read `../infrastructure/api/api_spec.md`.
2. Open the relevant `src/api/` file.
3. Open affected page/hook consumers.
4. Update context if API contract meaning or source-of-truth routing changes.

### Change product Excel import

1. Read API spec §3.9 and ADR-016. This is master-data import: quantities are not inventory postings; existing stock stays unchanged and new products start at zero.
2. `src/components/ImportProductsModal.tsx` pairs preview identity with the selected File and must send that token through `src/api/excel.ts` on confirmation. Changing the file or a rejected confirmation requires preview again.
3. Use the nearest modal tests for file/token pairing and recovery. Backend `excel-import.integration.test.ts` supplies real PostgreSQL stock-preservation and preview-integrity evidence.

### Change initial batch receipt

1. Read API spec §3.10 and ADR-017. Product metadata cannot edit physical stock; receipt is the batch creation operation and unreviewed stock defaults to quarantine.
2. `pages/Inventory/BatchListPage.tsx` consumes paginated product data, sends a complete expiry date and refreshes both batch/product queries after receipt. Show API errors and keep expiry/inspection states distinct, using Asia/Taipei dates.
3. Use its nearest screen tests and a real API/browser receipt flow. Physical-return receipt and approval remain separate pending work.

### Debug a UI test failure

1. Read the failing test.
2. Open the component/page under test.
3. Open only the hooks or API mocks referenced by that test.

## Commands

Run from `systems/enterprise-admin/admin-ui/`:

```bash
npm run test
npm run lint
npm run build
```

## Do not assume

- Do not read backend source files unless API behavior, auth, or persistence is part of the task.
- Do not hardcode fake operational data when real API data is expected.
- Do not infer feature completion from UI presence; read `../ROADMAP.md` for progress.
