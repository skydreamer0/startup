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

### Maintain reviewed product/package mappings

ProductListPage opens `pages/Inventory/ProductPackagesDialog.tsx` through
`api/productPackages.ts`. Read ADR-024 and `../infrastructure/api/product-packages.md`.
History/source/actor and one-way retirement are retained; stale writes require
refreshed history and explicit reselection. No stock/price writes occur here.
Auth identity changes discard old reads/drafts. Real API/PG browser evidence is
tracked in `../infrastructure/verification/pos-manufacturer-barcode-contract/README.md`.

### Change an admin page

1. Open the nearest file under `src/pages/<area>/`.
2. Open referenced components, hooks, and API client files only as needed.
3. Read backend API spec only when request/response behavior is involved.

### Change medicine/product labels

`pages/Inventory/ProductListPage.tsx` edits Product's optional medicine identity fields and opens `components/MedicineLabelDialog.tsx` for a selected Product. The dialog requires reviewed Chinese name, English product name, generic name, NHI code, full licence number and valid SKU, plus an actual storage location entered for this print. The Chinese line uses Product.name verbatim; strength and dosage form remain optional product metadata. The local renderer shrinks the three name lines independently and rejects field-specific overflow before preview or send. Changing that location invalidates preview approval. It then calls the workstation-only `services/localLabelPrinter.ts`. The Python contract and installation live in `../local-print-agent/README.md` and ADR-023. Its QR is `P1:<SKU>` for internal product identity; no Code128 or lot identity is produced. The print-time location does not persist to Product or batch inventory. Never store the local token in a frontend bundle or browser persistence, infer physical success from BLE ACK, or route the workstation request through the cloud API. Exact store origin/browser permission and local-API physical output remain acceptance gates.

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
3. Product navigation stores the existing `page`/`lowStock` and selected `productId` in the `/inventory` URL. `ProductBatchesView` reads only that product through the existing batch-list API; `api/productBatches.ts` checks the wire envelope and product identity. Read-only batch quantities retain safe signed integers, including anomalous negatives; negative rows and a visible count warning require manual investigation without changing stock or relaxing receipt/write rules. Back/Forward and return preserve the list location, while user-scoped abortable queries discard old reads. A focused trace control reveals itself by the nearest bounded horizontal movement of its own table container, preserving page/vertical position and the visible focus ring; disabled or already-visible controls do not scroll. Each current batch row can open the existing read-only `BatchTraceDialog`; selected details are discarded on product/user/permission changes, batch refetch or error. No receipt, correction, stock or money mutation is part of this view. The actual-entry/API/owned-PG driver and evidence limits are in `../infrastructure/verification/admin-trace-native/README.md`. See `src/__tests__/productBatchNavigation.test.tsx` and `../infrastructure/verification/product-batch-navigation/README.md`.
4. `src/__tests__/productPagination.test.tsx` uses real clients with synthetic HTTP-boundary fixtures, deferred responses and BatchList cross-page options. Evidence/union checkpoint and reproduction are in `../infrastructure/verification/product-ui-pagination/README.md`. JSDOM is not browser/real HTTP acceptance.

### Change financial or inventory reader lifecycle

The five reader roots also use `pages/useReaderFocusReveal.ts` to reveal only their current enabled control after focus/resize, preserving the full 3px outline plus 3px offset with nearest, clamped movement through its own scroll ancestors. No already-visible/unrelated control moves; unmount cancels pending work. Native checks require all four ring edges to remain visible.

The five reader pages opt into `pages/ReaderControls.css`: 44px controls, visible keyboard focus, wrapping period/sort controls, responsive cash/margin summaries and named keyboard-scrollable tables. Keep these selectors under `.admin-reader-page`; do not apply them globally or hide page overflow. `readerControls.test.tsx` checks CSS/DOM contracts; the native reader package separately proves real geometry and ArrowRight scrolling.

The three `pages/Reports/` pages, `InventoryAnalyticsPage` and `SupplierListPage`
use the existing `useGuardedRead` cache-owner contract. Query keys include the
current reader ID and all HTTP reads consume AbortSignal. A 401/403 latches data
unavailable for that query until a non-aborted authorized success; generic errors,
remounts, actor changes and late canceled success cannot revive denied data.
Ordinary failed refreshes may retain previously authorized data with the stale
notice. Retry is query-local, including separate trends and supplier ranking.
Estimate disclosures and existing amounts/ranking formulas remain unchanged.
Actual-entry/real-API/owned-PG scope and unverified operational limits are in
`../infrastructure/verification/admin-readers-native/README.md`.

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

`BatchListPage` and the product-scoped `ProductBatchesView` open the same read-only
`BatchTraceDialog`. The global batch list opens it without changing its current
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

The existing Admin CI Chrome harness (`../pos-ui/e2e/admin-margin-warning/`)
retains its original 22 warning cases and adds two batch-source journeys at
1366×768 and 390×844. It reuses the same build, GET-only synthetic HTTP boundary,
sandboxed Chrome, CJK glyph/PNG evidence and owned-process cleanup. The extension
adds no job/service/environment and does not validate real API/DB, 1024px, native
200% zoom or physical devices. Native CI evidence remains subject to independent
artifact review; the separate local browser route was blocked by socket policy.


## Authentication intent and cache handover

`hooks/useAuth.tsx` binds each profile/login operation to an abortable process-local
identity generation (`api/authSession.ts`). Logout, a new login, demo selection and
unmount invalidate old results. `api/requestLifecycle.ts` captures request identity
synchronously and keeps token snapshots in a private WeakMap, so superseded401 or
refresh responses cannot replace/clear the current actor or replay an old request
with a new actor's credentials. Session endpoint401s are not automatically replayed.
`hooks/AuthCacheBoundary.tsx` clears and cancels the shared QueryClient at identity
transitions; query-local denied-read guards remain in force. LoginPage keeps its
submitting/error UI mounted and provides associated field labels and an error alert.
This is a client lifecycle boundary, not JWT revocation, a new permission grant or
a rollback of server writes. See the exact-source evidence and synthetic native
limits in `../infrastructure/verification/admin-auth-handover/README.md`.

## Existing batch entry read acceptance

`src/api/receiptProducts.ts` validates the existing paginated inventory response before `BatchListPage` publishes product choices. Invalid rows, inconsistent page/total/limit, duplicates and non-progress pages stay inside the existing retryable form read error; retry retains the unsent draft. No receipt submit, release permission, price or API policy changed.

The owned browser runner is `../pos-ui/e2e/batch-entry-native/run.mjs`, with the production API fixture in `../backend/scripts/admin-batch-entry-browser-fixture.ts`. It reuses the same-head built Admin from the successful preceding package acceptance step, allows only exact owned GET reads, validates all 33 raw tables before/after, drains HTTP before exact-ID cleanup, and records immutable originals. Its bounded scope and unexecuted gates are in `../pos-ui/e2e/batch-entry-native/README.md`.
