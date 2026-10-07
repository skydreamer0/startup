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

### Change sale stock deduction

1. Read ADR-013, `../infrastructure/adr/adr_014_sale_batch_posting.md` and active issues linked from `../ROADMAP.md`.
2. POS and general orders call `src/lib/inventory-posting.ts` with the same caller-owned transaction for aggregate product/batch debits, OUT movements and durable `SaleBatchAllocation` rows. `sale-stock.ts` is its internal product-debit helper.
3. Eligibility uses released stock and Asia/Taipei calendar dates from `batch-expiry.ts`; stock is unusable on its expiry day. Existing/unreviewed batches default to quarantine. Other writers still await common-authority cutover.
4. Use `src/__tests__/stock-contention.integration.test.ts` with real PostgreSQL for contention, FEFO, persistence and rollback evidence. Use `prisma/diagnostics/preflight-sales-stock.sql` for read-only legacy balance discrepancies. This partial boundary does not complete G1/G2/G4 or command dedupe.
5. POS `refundOrder` registers money-only refund status with a conditional transition; it must not receive stock or modify sale allocations. Read ADR-015 before changing refund/return semantics. Physical-return receipt remains separate pending work.
6. Excel product import is metadata-only and cannot set physical stock. Read ADR-016, `src/lib/product-import-preview.ts` and `src/__tests__/excel-import.integration.test.ts` before changing preview/confirm identity or normalization. Confirm requires a signed tenant/file/normalized-revision preview; bump parser version when semantics change.
7. Initial batch receipt uses `InventoryPostingService.receiveBatch` in the caller-owned transaction, product lock first, then lot + IN movement with receipt cost snapshot. Product/batch editors reject direct quantity writes; CSV creates at zero. Read ADR-017 and `inventory-receipt.integration.test.ts`. Batch RBAC uses the existing product permission catalogue. This does not implement physical returns, same-lot additional delivery, bins or reversal/rebuild.
8. POS command orchestration uses `src/modules/pos/checkout-command.service.ts` (ADR-018). The tenant/kind/commandId claim and immutable result share the existing posting transaction. Replay precedes current business checks; result lookup requires manage:pos and missing results stay UNKNOWN. Read `checkout-command.integration.test.ts`; unique order numbers, exact money and full G1 remain pending.

### Change persistence or model meaning

1. Read `prisma/schema.prisma`.
2. Open affected module services/repositories.
3. Use `src/lib/tenant-persistence.ts` for tenant-scoped `where` / `data` injection before adding hand-written `tenantId` filters.
4. Check seed/migration impact.
5. Update context if model meaning, tenant boundaries, or source-of-truth assumptions change.

### Change product-list pagination

1. Read API spec §3.6 and `src/modules/inventory/inventory.service.ts`.
2. Low-stock filtering compares Product stockQuantity to its safetyStock through the tenant-scoped Prisma delegate before paging. Count and rows use the same predicate; order is name then unique ID.
3. Mocked service coverage is `src/modules/inventory/__tests__/products-pagination.test.ts`; bounded #50B1 evidence is `../infrastructure/verification/products-low-stock-pagination/README.md`. The wire payload stays total/page/limit/data; UI pagination, invalid-parameter policy and cross-update snapshots are separate work.

### Debug a backend test failure

1. Read the failing test file.
2. Open only the module files referenced by the failing test.
3. Use broader module inspection only after the local failure path is understood.
4. Real HTTP restart/lost-response acceptance lives in `../pos-ui/e2e/checkout-http-recovery.spec.ts` with an owned-process harness and `src/__tests__/helpers/checkout-http-fixture.ts`. It requires explicit isolated loopback test databases; reproduction/evidence is in `../infrastructure/verification/checkout-command/http-restart/README.md`. The fixture is excluded from the API build.

## Commands

Run from `systems/enterprise-admin/backend/`:

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
