# ADR-014: Eligible sale batch posting and durable allocations

## Status

Accepted — 2026-10-06. A partial #29 delivery, building on ADR-013.

## Context

POS batch deductions had no persisted lot-to-order link; general orders did not
deduct batches. Expired or quarantined stock could be sold. Both writers must
participate in one PostgreSQL transaction without building a second inventory
authority or assuming unknown historic lots.

## Decision

- `InventoryPostingService.debitSale` receives the caller's transaction client.
  It claims aggregate product demand in sorted product order, then conditionally
  debits eligible batches ordered by expiry, receipt time and ID. The original
  price/discount lines retain distinct generated IDs, including duplicate SKUs.
- POS and general-order orchestrators create those exact order-item IDs, then
  call `recordSale` on the same client. OUT movements and `SaleBatchAllocation`
  rows commit together with product/batch projections and the order. Allocation
  persistence failure rolls back all earlier writes; no internal transaction or
  automatic command replay is introduced.
- An allocation links tenant/order/item/product/batch/movement and positive
  integer quantity, with an expiry-at-sale snapshot. Composite foreign keys
  constrain tenant/product/source consistency. Referenced orders, items, batches
  and movements cannot be deleted through their normal parent delete paths.
  Allocation rows have no update/delete API. Full immutable ledger/reversal
  controls and all-writer authority remain follow-up work.
- Store policy confirmed by the user: Asia/Taipei calendar date, unusable on the
  expiry day. Eligibility requires `RELEASED`, positive quantity and an expiry
  calendar date later than today. Recheck status, original expiry and a fresh
  calendar cutoff during each conditional debit, including midnight races.
  Unknown or month-only expiry inputs continue to be rejected; no date is inferred.
- Batch states are `RELEASED`, `QUARANTINE`, `BLOCKED`. The additive migration
  defaults existing and newly unreviewed batches to `QUARANTINE`. Existing
  inventory permissions govern explicit status updates; a future physical-return
  release workflow and its approver policy are not implied by this change.
- Order-detail reads include actual allocations. Batch detail includes the most
  recent 100 sale allocations and their total count. Empty historical allocation
  arrays mean untraceable history, not that a sale used no stock.
- Keep the existing advance-warning horizon of 30 days. `expiringSoon` uses the
  store calendar, excludes zero balances, and includes overdue stock needing
  action. Frontend actionable reminders are still tracked by #31.

## Migration and activation

Migration `20261006090000_sale_batch_allocations` changes no existing quantities
and creates no historical allocation. It adds a PostgreSQL positive-quantity
check alongside the Prisma relations; CI therefore uses `migrate deploy` rather
than `db push`, so these constraints are actually exercised.

Run `backend/prisma/diagnostics/preflight-sales-stock.sql` against a staging copy
before activation. Reconcile each discrepancy by a documented physical count;
do not silently create lots. Review known batches before explicit release.
Existing batches will be unavailable for sale until reviewed, so the migration
must be coordinated with that review before production deployment. Development
seed batches alone are explicitly released; seed data is not a migration strategy.

Local upgrade evidence: apply the seven prior migrations, insert an old product
balance 9 / batch balance 4 and an old completed order, then apply this migration.
Both quantities remain 9 / 4, the batch becomes QUARANTINE, old order allocations
remain zero, and the read-only preflight reports difference 5. This tests a
synthetic upgrade, not a completed real-store G2 reconciliation.

## Consequences and remaining scope

Sales with only ineligible or unbatched legacy stock now fail with an actionable
error instead of silently consuming unknown stock. Product.stockQuantity remains
the physical aggregate projection, including quarantined/expired stock, and is
not a promise of sellable availability.

Receipt/batch quantity edits, product edits, Excel imports, refunds/physical
returns, bins, corrections and ledger rebuilding still need common-authority
cutover in #29. Command identity/result recovery, unique order numbers and exact
money remain #30. This slice does not complete G1/G2/G4 or close either parent.
