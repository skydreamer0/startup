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
| UI design sources and receipt acceptance | `../infrastructure/design-system/MASTER.md` and `pages/batch-receipt.md`; execution evidence in `../infrastructure/verification/batch-receipt-uiux/` |
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
3. `src/__tests__/batchReceipt.test.tsx` exercises the real AuthProvider and receipt client through synthetic HTTP-boundary fixtures. `create:products` gates receipt; `release:product_batches` additionally gates RELEASED with a trimmed 1–1000 character reason. QUARANTINE/BLOCKED omit the reason. Keep failed drafts and inline permission/error states, block duplicate submission and cancellation while pending, and reset cancelled drafts. These JSDOM cases do not replace a real API/browser receipt flow. Physical-return receipt and approval remain separate pending work.

### Change inventory product pagination

1. `inventoryApi.getProducts` consumes ApiSuccess<InventoryProductPage> with total/page/limit/data, not the shared meta/items pagination types.
2. `ProductListPage` keys reads by page and lowStock; filter changes reset page one. Pending/error data is unavailable, no previous-page placeholder is shown, and server total reductions only clamp downward to the new last page. Supplier selection/draft handling is independent.
3. `src/__tests__/productPagination.test.tsx` uses real clients with synthetic HTTP-boundary fixtures, deferred responses and BatchList cross-page options. Evidence/union checkpoint and reproduction are in `../infrastructure/verification/product-ui-pagination/README.md`. JSDOM is not browser/real HTTP acceptance.

### Change supplier list consumption

1. `inventoryApi.getSuppliers()` unwraps the existing `ApiSuccess<Supplier[]>` wire envelope once and returns `Promise<Supplier[]>`. `ProductListPage` options and `SupplierListPage` rows consume that array directly.
2. Keep successful empty, loading and failed supplier queries distinct. Retry is an explicit button and must not submit the product form. Missing/error/refetched options must preserve the current supplierId, visible selection and draft; no query effect may reset them or select the first option.
3. `src/__tests__/supplierLists.test.tsx` uses typed synthetic wire fixtures through the real inventory client with only HTTP methods mocked. Execution evidence is in `../infrastructure/verification/admin-suppliers/README.md`; product pagination, backend low-stock filtering and full #31/G0 acceptance remain separate.

### Debug a UI test failure

1. Read the failing test.
2. Open the component/page under test.
3. Open only the hooks or API mocks referenced by that test.

## Commands

Run from `systems/enterprise-admin/admin-ui/`:

Install through the system-root pnpm workspace (10.34.6), using only its root
pnpm-lock.yaml; do not create a package-lock or nested pnpm lock here.
See `../infrastructure/standards/dependency_management.md`. Vendored shadcn CSS
and its license/provenance are in `src/styles/vendor/`; no CLI dependency is needed.

```bash
npm run test
npm run lint
npm run build
```

## Do not assume

- Do not read backend source files unless API behavior, auth, or persistence is part of the task.
- Do not hardcode fake operational data when real API data is expected.
- Do not infer feature completion from UI presence; read `../ROADMAP.md` for progress.

### Change batch field corrections and history

1. Read `../infrastructure/api/batch_field_audit.md` and ADR-020. Ordinary batch
   PATCH no longer edits expiry, status or cost. `BatchAuditPanel.tsx` uses the
   three reason-required correction endpoints plus paginated immutable history.
   INITIAL_RELEASE history starts at `{exists:false}`, not a fabricated prior lot.
   Receipt reason UI lives in `BatchListPage.tsx`; ADR-021 supplies the unique shared
   audit model. Current UI evidence and remaining gates are in
   `../infrastructure/verification/initial-release-reason-ui.md`.
2. Keep permission denial, request uncertainty, history failure and empty history
   distinct. Preserve failed drafts and do not show success after a rejected write.
   Disable repeated submission and closing the panel while its write is pending.
3. `src/__tests__/batchAudit.test.tsx` exercises the real API client through mocked
   HTTP methods; these tests do not replace actual browser or native DB acceptance.

### Read batch receipt and sale provenance

`BatchListPage` opens the read-only `BatchTraceDialog` without changing its current
expiry filter or starting a mutation. `api/batchTrace.ts` validates the existing
`GET /product-batches/:id` envelope, requested batch/tenant identities, linked IN
receipts and sale allocations. It exposes only the latest 100 sale allocations
and the server total; an empty link set means unknown history, never proof of no
receipt or sale. It does not calculate balances, money or opening stock.
The query is user/tenant/batch-scoped, abortable and discarded after unmount;
auth identity/permission changes forget the open selection. Loading, 403, 404,
failed refresh and successful empty histories remain distinct. Tests use the
real read client with synthetic HTTP, not backend authorization proof. See
`src/__tests__/batchTrace.test.tsx` and
`../infrastructure/verification/batch-source-trace/README.md`.
