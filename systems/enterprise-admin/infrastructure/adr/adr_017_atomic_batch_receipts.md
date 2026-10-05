# ADR-017: Atomic batch receipts and closed quantity bypasses

## Status

Accepted — 2026-10-06. Additional #29 delivery after ADR-014/015/016.

## Context

Creating a batch increased its quantity without increasing the product projection
or recording an IN movement. Product/batch editors and new-product CSV imports
could set quantity independently. Actual PostgreSQL regression tests reproduced
eight failures, including conservation after a concurrent receipt/sale and a
403 caused by permissions absent from the seed catalogue.

## Decision

- Batch creation is an initial receipt for a new product/lot combination.
  `ProductBatchService` owns one transaction and delegates to
  `InventoryPostingService.receiveBatch` using that same client. The product
  row is conditionally incremented first, taking the same lock used by sales;
  the lot and IN movement then commit together. Invalid integer quantities,
  negative aggregate balances and overflow reject the whole operation.
- A new receipt movement records batchId, quantity and costPriceAtReceipt.
  The nullable composite lot/product/tenant foreign key preserves provenance
  and prevents deletion of referenced lots. A PostgreSQL CHECK requires a
  linked receipt to be IN with positive quantity and a cost snapshot. Existing
  movements remain unlinked; no historical lot or opening balance is invented.
- Unreviewed receipts default to QUARANTINE. Operators with existing product
  creation permission can explicitly record the existing RELEASED/BLOCKED
  states; release eligibility is checked after obtaining the product lock,
  using the confirmed Asia/Taipei expiry-day policy. This is the normal initial
  receipt path, not physical-return inspection or an approval workflow.
- Same-lot creation fails with 409 and rolls back the earlier increment. It
  does not add another delivery to an existing lot. Command identity, replay
  result recovery and multiple deliveries to one lot remain separate work.
- Product creation starts at zero (a supplied zero remains compatible); any
  positive initial stock is rejected. Product updates reject any stockQuantity
  field, and batch updates reject quantity. Both API validation and service
  guards apply. Metadata corrections cannot overwrite a sale or receipt.
- CSV master-data imports also create at zero. Existing SKUs are skipped as
  before. They are not stock intake; the response explicitly warns operators.
- Batch routes use catalogue permissions: read:products for reads,
  create:products for receipts, update:products for metadata and removal of
  unused empty lots. Correct flat product-body validation to allow metadata
  requests while enforcing the quantity restriction.
- Admin product stock is an output rather than an editable field. The receipt
  form consumes all product pages, sends a complete date, defaults to quarantine
  and invalidates product/batch reads after success. Batch query errors are
  shown as errors; expiry-day and quarantine status are visible separately.

## Verification and migration limits

Migration `20261006100000_atomic_batch_receipts` was applied after the previous
eight migrations in an isolated PostgreSQL 15 database. Prisma schema diff
reported no difference. Synthetic legacy product 9 / lot 4 remains unchanged,
quarantined and without a fabricated receipt link. A new receipt preserves an
existing discrepancy; production opening reconciliation is still required.

The full backend suite passed 28 files / 218 tests, including 15 new real DB
cases covering atomicity, duplicate-lot rollback, competing sale, movement-write
failure, tenant/FK/CHECK boundaries, reconnect provenance, cost snapshots, expiry
day, flat authenticated APIs, read-only permission and CSV zero-stock import.
Admin UI passed 7 files / 21 tests, lint and build. Actual Chromium metadata
create → receipt → trace → edit conserved product 3 / lot 3 / IN 3 without page
errors. A subsequent real API sale consumed two received lots as 3 + 1; after
stopping and restarting the API process, order-to-lots and both lots-to-order
remained readable, with aggregate 1 / lot totals 0 + 1. CI results are recorded
in the PR.

Receipt records have no edit/delete API, but full immutable operation headers,
actor/reversal links, bin/status balances, physical returns, adjustments and
ledger rebuilding are not implemented by this slice. Returned goods must not
be passed through initial receipt to claim they were inspected. Production
G1/G2/G4, durable commands and complete #29/#30 acceptance remain open.
