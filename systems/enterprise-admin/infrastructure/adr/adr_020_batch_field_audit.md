# ADR-020: Batch field correction audit

**Status:** Candidate; runtime and store policy acceptance pending
**Date:** 2026-10-09
**Tracking:** #46, limited boundary within #29 / #30

## Decision

- Ordinary `PATCH /product-batches/:id` cannot change quantity, expiry, status or
  cost. Both validation and the service boundary reject these writes. Metadata
  import paths do not gain permission to edit batches.
- Dedicated status, expiry and cost operations require existing `update:products`
  permission, a nonempty reason and an authenticated active tenant actor. A
  transition from QUARANTINE or BLOCKED to RELEASED additionally requires
  `release:product_batches`. The code does not seed permissions or grant any role
  this capability. Store approval of operational roles remains outstanding.
- Status transitions are explicit between the three existing states, never a
  same-state successful rewrite. The product row is locked first, in the same
  order used by receipt/sale posting. The batch is read again after the lock;
  eligibility uses the current `saleExpiryCutoff()` after waiting, including
  Asia/Taipei midnight. Corrections never modify quantity or create movements.
- Expired RELEASED lots cannot become saleable through an expiry extension.
  When the old or corrected expiry is unusable on the current Taipei date, a
  released lot's expiry correction is rejected; the operator must first record
  an explicit quarantine/block transition. Nonreleased corrections remain
  nonreleased. Valid unexpired corrections do not silently change status.
- The batch update and a `ProductBatchChange` append share one transaction.
  Records preserve tenant/product/batch, actor ID, operation, full before/after
  status/ISO-expiry/decimal-cost snapshots, trimmed reason and database time.
  Composite batch foreign keys prevent tenant/product mismatches and deleting
  referenced lots. UPDATE/DELETE of audit rows is forbidden by the additive
  migration's database trigger. There is no history edit/delete API.
- History uses a tenant-and-batch-validated cursor with deterministic descending
  time/ID order, 50 records per page. Correction does not remove earlier rows.
- Costs accept at most four decimal places in the existing Decimal(12,4) range.
  No existing order, sale allocation, receipt snapshot or product cost is
  rewritten. Existing missing historical cost snapshots remain #30 work; this
  change does not invent them or choose an accounting valuation method.

## Open integration gate

Initial receipt's existing RELEASED option must pass the same independent release
permission and audit boundary before this change is considered complete. Its final
contract is pending review; do not claim the create-path bypass has been closed
while this gate remains. No new production role grants are part of this ADR.

## Verification and limits

Mock service tests, authenticated real-PostgreSQL regression cases, and admin UI
HTTP-boundary tests accompany the code. The native suite uses only the exact
synthetic Actions database on loopback port 55437. Append-only fixtures intentionally
remain until the runner drops its own preflight-proven empty database; tests do not
disable the trigger or delete audit records for cleanup. The runner requires every
named case to pass with no skips and records source head/tree, service identity,
case results and verified database removal.

At authoring time, only static checks were available. New-head CI, actual native
results, schema integration, browser keyboard/touch/zoom acceptance and policy
review remain required. This does not complete inventory posting, physical returns,
ERP, valuation, order numbering or production migration/deployment.
