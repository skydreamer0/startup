# Current-schema inventory provenance dry-run

Bounded preparation for [#29 AC8](https://github.com/skydreamer0/startup/issues/29)
and [#37 G2](https://github.com/skydreamer0/startup/issues/37), based on
`master@257a937dba8712116178b5ad9762d19b71f37093`. This is a diagnostic,
not a migration, repair command, historical reconstruction or gate release.
No production data, schema, migration, workflow, dependency or permissions change.
The original `backend/prisma/diagnostics/preflight-sales-stock.sql` is unchanged.

## Report contract

`backend/prisma/diagnostics/preflight-inventory-provenance.sql` is one read-only
SELECT against the current `public` schema, including the existing receipt and
sale-allocation migrations. It intentionally does not support pre-migration schemas.
All sections share one statement snapshot; use the read-only repeatable-read
wrapper below when running or comparing reports. There is no pagination or silent
row limit. The statement timeout fails the run instead of returning a partial pass.

Each row has `section`, `tenant_id`, `product_id`, `record_id`, and JSON `details`:

- `product`: `stock_quantity` is the physical-total projection, including quarantined,
  blocked and expired stock. Compare it with **all** batch remainders, including zero
  and negative rows. It is not sale eligibility, or proof of an actual physical count.
- `batch`: display its current status/expiry, linked positive IN totals and source-linked
  sale allocations. `linked_evidence_net_quantity` is only linked IN minus linked OUT
  allocations; `difference_from_linked_evidence` is the batch remainder minus that net.
  No opening balance is inferred from either number.
- `movement`: retain each raw type/quantity, batch/reference IDs, allocation quantity
  and OUT difference. Unlinked IN, old OUT without allocations/order references,
  nonpositive movements and unsupported types (including ADJUSTMENT) are explicit.
- `order_item`: retain the order's tenant/status and compare item quantity with its
  allocations. Missing allocations remain unknown even for refunded/cancelled orders;
  statuses do not prove whether a historical posting happened.
- `allocation`: preserve each actual order/item/lot/movement link and quantity.
  `source_linked` means matching tenant/product relationships, positive OUT and
  allocation quantities, and an OUT reference to that order. It does **not** mean
  movement/item totals agree; inspect their separate mismatch rows as well.

Every product and batch retains `UNKNOWN_NO_VERIFIED_OPENING_BASELINE`, including
zero or equal quantities and fully linked recent records. Source-less batches stay
`UNKNOWN_RECEIPT_SOURCE`. A linked IN proves only the current batch link, not a full
supplier receipt/evidence document. Unsupported types are never assigned a sign.
No baseline, lot, receipt, correction, reversal, release decision or policy is invented.

Independent aggregates prevent receipt × sale × batch join fan-out. All relationship
joins and groupings use tenant/product identities; order items inherit the order's
tenant and are checked against the product. Legacy malformed cross-tenant rows are
reported under their own tenant, excluded from the other product's totals, and flagged.
The report is an administrative **all-tenant** export on an explicitly authorized
copy. It is not tenant-scoped application access or an API authorization mechanism.
Do not distribute it beyond the approved recipients.

Amounts and counts are decimal **strings** in JSON. Sums/subtraction use PostgreSQL
`numeric`, avoiding signed-32-bit overflow and JavaScript JSON integer truncation.
Ordering is tenant, product, section and unique record ID with `C` collation. No
clock-dependent classification or export timestamp changes otherwise identical rows.

## Run only on an approved isolated copy

This work used fresh synthetic data only. Do not use a store/production connection.
Verify the selected database identity and current schema before running. From
`systems/enterprise-admin/backend`, with an already authorized connection:

```bash
psql "$APPROVED_SYNTHETIC_DATABASE_URL" -X -v ON_ERROR_STOP=1 -P pager=off <<'SQL'
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';
\i prisma/diagnostics/preflight-inventory-provenance.sql
ROLLBACK;
SQL
```

A timeout, schema error or connection failure is a failed/incomplete run, never a
clean inventory result. The wrapper never commits and the diagnostic has no DML,
DDL, temporary table, sequence operation or repair side effect.

## Exact-file SQL regression

`backend/src/__tests__/inventory-provenance.integration.test.ts` reads and executes
the actual SQL file; it is not a SQL-text assertion or a mocked query result. All
fixtures are synthetic. Each report runs in READ ONLY / REPEATABLE READ. The test
also proves the engine rejects a write in that transaction, compares canonical
stored-row JSON before/after, checks deterministic output, and verifies all business
tables have zero rows after fixture cleanup.

Two explicit, mutually exclusive execution modes exist:

### Native PostgreSQL (required before native acceptance)

Use a newly created, owned, loopback-only disposable PostgreSQL database with user
`test`, no password/URL options, an explicit port, and a name matching
`checkout_http_recovery_inventory_provenance_[a-z0-9_]+`. Apply the **existing**
repository migrations on that known-empty synthetic database using the usual
approved runner; this test never migrates or resets an external database.
Set `DATABASE_URL` and `INVENTORY_PROVENANCE_DATABASE_URL` to the same exact URL,
and `INVENTORY_PROVENANCE_ALLOW_SYNTHETIC=1`. The suite requires every current
migration and zero business rows before creating any fixtures.

```bash
node node_modules/vitest/vitest.mjs run src/__tests__/inventory-provenance.integration.test.ts \
  --maxWorkers=1 --no-file-parallelism --reporter=verbose --reporter=json \
  --outputFile.json=/tmp/inventory-provenance-native.json
```

Require **20 passed, zero failed, zero skipped**, the exact head/tree, engine
identity and cleanup output. The two native-only cases exercise:

1. A separate real connection committing product/batch changes while the read-only
   transaction continues to see its original snapshot, followed by a fresh report.
2. Actual `InventoryPostingService.receiveBatch`, two-lot `CheckoutService.checkout`
   and `refundOrder` service writes, proving the refund creates no IN or stock change.

The runner must then remove only its own disposable database and record removal.
A similarly named existing DB or a skipped suite is not acceptance. No native CI
job/workflow is added in this slice; the existing default suite skips without opt-in.

### Embedded PGlite (limited SQL evidence)

If an already installed PGlite is available, set only
`INVENTORY_PROVENANCE_PGLITE_PATH` to its absolute module path, then run the same
command. There is no package addition or installer. The test creates a fresh
in-memory database, applies all 12 unchanged migrations and closes it afterward.
The report labels this engine explicitly; it does not emulate Prisma service calls
or claim separate-connection/native PostgreSQL behavior.

## Local evidence and limits (2026-10-09 UTC)

- **PASSED:** PGlite 0.5.8, actual PostgreSQL SQL execution, 18 cases; all 12 current
  migrations applied to a new in-memory synthetic database. Covers two receipt
  lots/split-sale/money-only-refund **SQL fixture state**, legacy 9 versus 4 (delta 5),
  equal/source-less unknown history, all statuses/expired/zero batches, empty stock,
  identical tenant SKUs and malformed legacy tenant links, fan-out, unlinked IN/OUT/
  order items, missing/excess allocations, invalid source links, independently
  mismatched order quantities, unsupported/negative values, numeric values beyond
  signed 32-bit, unchanged stored rows, stable ordering and enforced READ ONLY.
- **FAILED then corrected:** the first PGlite run had 15 passed / 1 failed / 2 skipped;
  cleanup initially deleted tenant A's product before tenant B's malformed legacy
  order item. Cleanup now deletes each dependent table across all owned fixture
  tenants before referenced products; it does not delete unrelated rows. Original
  failure logs are retained with the local checkpoint, not relabelled as a pass.
- **PASSED locally:** focused integration-test TypeScript checking, full backend lint,
  backend build and agent-context validation. The default local runtime is Node
  24.19.0, whereas repository CI uses Node 22; this is not Node-22 CI evidence.
  The first build hit a TypeScript declaration-path error from a borrowed
  node_modules symlink; copying the unchanged existing cache locally resolved it.
  No manifest, lockfile, dependency version or application code was changed.
- **NOT RUN:** the two native-only tests, native PostgreSQL/service/connection
  concurrency acceptance, real store data, old-schema upgrade/rollback compatibility,
  representative-store performance, writer cutover and physical opening stock review.
  No `postgres`, `initdb`, `pg_ctl`, `psql` or Docker was available in this workspace.
  No new engine was installed and no socket/security restriction was bypassed.
- **Still incomplete:** #29 full AC8, historical reconciliation/rebuild, receipt
  documents, physical returns, bins, same-lot production workflow, corrections/
  reversals, store release-role decisions and #37 G2. Matching numbers or this
  bounded report cannot complete these requirements. No issue is closed; no merge,
  deployment, formal migration or gate release is authorized by this evidence.

Local raw logs, JSON results, source hashes, exact commit/tree and independent review
belong with the checkpoint/publication receipt. Review the exact new head before any
Draft publication; broader backend CI and business gates remain separate evidence.
