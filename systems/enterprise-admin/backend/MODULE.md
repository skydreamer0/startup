# backend Module Context

## Purpose

`backend` is the Express + Prisma API service for `enterprise-admin`. It owns authentication, tenant-aware domain APIs, persistence, and backend tests.

## Read this first for

- Backend route, controller, service, repository, middleware, or auth work.
- API behavior that affects `admin-ui` or `pos-ui`.
- Prisma-backed data model or persistence changes.
- Backend test failures.

## Directory map

| Path | Purpose |
| ---- | ------- |
| `src/server.ts` | API process entry point. |
| `src/config/` | Runtime configuration. |
| `src/lib/` | Shared backend utilities and infrastructure helpers, including route policy assembly and tenant persistence helpers. |
| `src/middleware/` | Express middleware, including auth / request safety concerns. |
| `src/modules/` | Domain modules such as auth, inventory, orders, POS, CRM, analytics, users, roles, and reports. |
| `src/types/` | Backend-local TypeScript types. |
| `src/__tests__/` | Backend integration or cross-module tests. |
| `prisma/schema.prisma` | Database schema source of truth. |
| `prisma/seed.ts` | Seed data for local/dev workflows. |

## Source-of-truth documents

| Need | Read |
| ---- | ---- |
| API contract | `../infrastructure/api/api_spec.md` |
| Database schema | `prisma/schema.prisma` |
| Architecture constraints | `../infrastructure/adr/` |
| Test strategy | `../infrastructure/standards/test_pyramid.md` |
| Agent route selection | `../../../docs/agents/navigation.md` from repo root |

## Common task routes

### Add or change a backend endpoint

1. Read `../infrastructure/api/api_spec.md`.
2. Open the nearest `src/modules/<domain>/` route/controller/service files.
3. Use `src/lib/admin-route-policy.ts` / `src/lib/route-policy.ts` for auth, plan, permission, and validation middleware assembly.
4. Open the nearest tests for that module.
5. Update API spec and context if the contract meaning changes.

### Change process health or startup

1. `/health` is process-only liveness; `/ready` checks database connectivity and all packaged Prisma migration history. See `../infrastructure/verification/health-readiness/README.md` for the contract and deployment usage.
2. `src/lib/readiness.ts` performs read-only, bounded single-flight checks with a silent dedicated Prisma client. `src/server.ts` gates listening on readiness; `src/config/env.ts` retains required configuration validation. Errors expose fixed codes, never connection strings.
3. Do not treat nginx edge `/health` as backend readiness. Probes never apply migrations or change tenant data.

### Change sale stock deduction

1. Read ADR-013, `../infrastructure/adr/adr_014_sale_batch_posting.md` and active issues linked from `../ROADMAP.md`.
2. POS and general orders call `src/lib/inventory-posting.ts` with the same caller-owned transaction for aggregate product/batch debits, OUT movements and durable `SaleBatchAllocation` rows. `sale-stock.ts` is its internal product-debit helper.
3. Eligibility uses released stock and Asia/Taipei calendar dates from `batch-expiry.ts`; stock is unusable on its expiry day. Existing/unreviewed batches default to quarantine. Other writers still await common-authority cutover.
4. Use `src/__tests__/stock-contention.integration.test.ts` with real PostgreSQL for contention, FEFO, persistence and rollback evidence. Use `prisma/diagnostics/preflight-sales-stock.sql` for read-only legacy balance discrepancies. This partial boundary does not complete G1/G2/G4 or command dedupe.
5. POS `refundOrder` registers money-only refund status with a conditional transition; it must not receive stock or modify sale allocations. Read ADR-015 before changing refund/return semantics. Physical-return receipt remains separate pending work.
6. Excel product import is metadata-only and cannot set physical stock. Read ADR-016, `src/lib/product-import-preview.ts` and `src/__tests__/excel-import.integration.test.ts` before changing preview/confirm identity or normalization. Confirm requires a signed tenant/file/normalized-revision preview; bump parser version when semantics change.
7. Initial batch receipt uses `InventoryPostingService.receiveBatch` in the caller-owned transaction, product lock first, then lot + IN movement with receipt cost snapshot. Product/batch editors reject direct quantity writes; CSV creates at zero. Read ADR-017 and `inventory-receipt.integration.test.ts`. Batch RBAC uses the existing product permission catalogue. This does not implement physical returns, same-lot additional delivery, bins or reversal/rebuild.
8. POS command orchestration uses `src/modules/pos/checkout-command.service.ts` (ADR-018). The tenant/kind/commandId claim and immutable result share the existing posting transaction. Replay precedes current business checks; result lookup requires manage:pos and missing results stay UNKNOWN. Read `checkout-command.integration.test.ts`; exact money and full G1 remain pending.
9. POS numbering uses `src/lib/business-day.ts` (Taipei midnight) and `src/modules/pos/order-number.ts` (ADR-019). FEFO retains fresh per-debit clock checks; new POS orders persist businessDate and increment a tenant/day counter in the command transaction. Old order dates/numbers are not rewritten. Read `prisma/diagnostics/preflight-order-numbers.sql` before an approved migration; `order-sequence.integration.test.ts` plus `scripts/order-sequence-ci.mjs` provide guarded exact-head synthetic acceptance in the independent `Order sequence PostgreSQL acceptance` CI job. It requires all nine sequence, 21 command, 38 stock and five mocked cases, additive upgrade/duplicate probes, zero remaining fixture rows and owned-DB removal; skipped tests are not acceptance. The integrated workflow retains context/backend/admin/POS, pagination, SKU, batch audit and sequence jobs. The sequence runner also applies both new migrations in order to a populated owned synthetic schema, compares every old row, checks counter initialization and append-only audit, and verifies schema removal. See `../infrastructure/verification/pharmacy-integration/README.md` for integration provenance and rollout gates. Exact-head results must be reviewed before release. See `../infrastructure/verification/order-sequence/README.md`.

### Change batch fields or initial release

Read ADR-020 and `../infrastructure/api/batch_field_audit.md`, then
`src/modules/product-batches/` and its nearest tests. RELEASED receipt requires
independent release permission, trusted active tenant actor and reason; receipt/IN/
initial audit share one transaction. Ordinary nonreleased receipts keep their policy.
Expiry correction rechecks the current Taipei date after the product lock.
The sole ProductBatchChange schema/migration/tenant registry and append-only
protections are supplied by ADR-021. Do not invent a second model or treat
#47 / PR #77 numbering as this dependency. Native evidence and remaining gates
are tracked in `../infrastructure/verification/product-batch-change-integration.md`.

### Change persistence or model meaning

1. Read `prisma/schema.prisma`.
2. Open affected module services/repositories.
3. Use `src/lib/tenant-persistence.ts` for tenant-scoped `where` / `data` injection before adding hand-written `tenantId` filters.
4. Check seed/migration impact.
5. Update context if model meaning, tenant boundaries, or source-of-truth assumptions change.

### Change product-list pagination

1. Read API spec §3.6 and `src/modules/inventory/inventory.service.ts`.
2. Low-stock filtering compares Product stockQuantity to its safetyStock through the tenant-scoped Prisma delegate before paging. Count and rows use the same predicate; order is name then unique ID.
3. Mocked service coverage is `src/modules/inventory/__tests__/products-pagination.test.ts`; real PostgreSQL/tenant coverage is `src/__tests__/products-pagination.integration.test.ts` with explicit guarded PRODUCT_PAGINATION_DATABASE_URL opt-in. Bounded #50B1 evidence and reproduction are in `../infrastructure/verification/products-low-stock-pagination/README.md`. The wire payload stays total/page/limit/data; UI pagination, invalid-parameter policy and cross-update snapshots are separate work.
4. The ordinary CI workflow's separate `Product pagination PostgreSQL acceptance` job runs the unchanged 6 mocked and 8 native cases on its exact source head. `scripts/products-pagination-ci.mjs` verifies the disposable Actions service's loopback-only binding and empty DB before migration, and requires per-case results plus owned-DB cleanup. Historical 8 skipped results are not native acceptance; this does not replace the original four jobs or release gates.

### Verify exact POS SKU lookup

The ordinary CI job `Exact SKU PostgreSQL and current POS browser acceptance` uses
`scripts/pos-product-lookup-ci.mjs` to run the unchanged five native cases in
`src/__tests__/pos-product-lookup.integration.test.ts` against an owned disposable
Actions PostgreSQL service. See `../infrastructure/verification/pos-product-lookup-ci/README.md`
for exact-head provenance, safety controls, cleanup evidence and distinct browser scope.
This is SKU-only; Product has no barcode field. It does not replace the original five jobs.
The same owned service separately validates category reads through real JWT, tenant,
auth/RBAC and PostgreSQL using `src/__tests__/pos-categories.integration.test.ts`.
The original SKU cases remain unchanged. See
`../infrastructure/verification/pos-categories/README.md` for the bounded nine-case
contract, separate opt-in and remaining browser/device gates.

### Debug a backend test failure

1. Read the failing test file.
2. Open only the module files referenced by the failing test.
3. Use broader module inspection only after the local failure path is understood.
4. Real HTTP restart/lost-response acceptance lives in `../pos-ui/e2e/checkout-http-recovery.spec.ts` with an owned-process harness and `src/__tests__/helpers/checkout-http-fixture.ts`. It requires explicit isolated loopback test databases; reproduction/evidence is in `../infrastructure/verification/checkout-command/http-restart/README.md`. The fixture is excluded from the API build.
5. Argon2 upgrade acceptance uses `scripts/argon2-compat/README.md` and `.github/workflows/argon2-compat.yml` from repo root. Keep the 9 synthetic-service checks and 2 mutation controls separate from `verify-http.cjs`, which verifies the compiled final Node22/Alpine app over HTTP with real PostgreSQL/JWT, checkout and money-only refunds. The latter permits only its named empty disposable Actions service DB, explicit guarded migrations and synthetic fixtures; never supply a production URL or use the image's default migration-starting command. New-head evidence and the ordinary four-job CI are both required.

## Commands

Run from `systems/enterprise-admin/backend/`:

Install with npm 11.21.0 and `npm ci` using this directory's package-lock.json;
the backend is excluded from the frontend pnpm workspace. Node.js 22 is used by
CI and Docker. See `../infrastructure/standards/dependency_management.md`.

```bash
npm run test
npm run lint
npm run build
npm run db:generate
```

## Do not assume

- Do not infer feature completion from source code; read `../ROADMAP.md` for progress.
- Do not change tenant-sensitive behavior without checking auth / tenant constraints.
- Do not change schema meaning without checking `prisma/schema.prisma`, affected services, and context freshness.

## Batch audit shared persistence

`prisma/schema.prisma` owns the sole `ProductBatchChange` model; additive migration
`20261009120000_product_batch_changes` implements composite tenant/product/batch/actor
keys, exact operation/snapshot checks and UPDATE/DELETE/TRUNCATE protection. Read
ADR-020 and ADR-021 before changing audit semantics. This model is registered in
`src/lib/tenant-scoped-models.ts`; it has no update/delete API. INITIAL_RELEASE uses
`{exists:false}` before and a full released snapshot after in the receipt transaction.
`BatchAuditService` continues product-lock-first correction and post-wait Taipei date
checks. The dedicated ordinary-CI PG15 job runs the original 15 native cases and six
`batch-change-schema.integration.test.ts` contract cases on the exact source head,
requires zero skips, and drops only its preflight-proven empty owned synthetic DB.
Append-only fixture rows remain until that DROP. Handoff and result provenance live
in `../infrastructure/verification/product-batch-change-integration.md`. UI receipt
reason/browser, store roles and independent review remain separate gates.
