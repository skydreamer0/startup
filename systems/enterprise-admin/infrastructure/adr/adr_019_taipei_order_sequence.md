# ADR-019: Taipei business day and transactional POS order numbers

## Status

Proposed — Issue #47 only; Draft checkpoint, not deployment approval. Real
PostgreSQL acceptance is pending until exact-head CI evidence is reviewed.

## Decision

- `business-day.ts` defines the Asia/Taipei midnight calendar and returns the
  ISO date plus `[start, end)` UTC instants for future #30 query consumers.
  `batch-expiry.ts` delegates to this source: expiry day remains unsellable.
  No late-shift rollover or refund accounting policy is introduced.
- `CheckoutService.checkout(dto, clock)` accepts an optional server-side clock
  function (not an HTTP field). Default uses real time. FEFO reads this clock
  afresh after stock waits and before each batch conditional debit. Do not freeze
  a Date at command arrival or bypass existing expiry rechecks.
- After inventory debit, the new command reads the clock for its numbering date.
  That date is fixed for the subsequent counter claim, even if waiting for its
  tenant/day counter or committing crosses midnight. The business date describes
  this numbering decision, not commit time. Separate commands sampling opposite
  sides of midnight use different rows. Historical createdAt remains unchanged.
- `OrderNumberCounter` has a composite `(tenantId, businessDate)` primary key,
  a tenant FK and a database CHECK for `0 <= lastSequence <= 99999`. It participates
  in the existing tenant-scoped model allowlist. A caller-owned transaction does
  `createMany(skipDuplicates)` then conditional increment below 99999, then reads
  the locked row. Competing commands serialize on that row without catching an
  aborted unique violation. No secondary transaction, new stock lock strategy,
  distributed service, or deadlock retry is introduced.
- New POS orders persist nullable `Order.businessDate` as a SQL DATE and retain
  `POS-YYYYMMDD-NNNNN`. Sequence 99999 is valid; the next attempt returns HTTP 409
  with `ORDER_SEQUENCE_EXHAUSTED` and rolls back all sale effects. There is no
  wrap, truncation, rollover into another day or hidden retry.
- A unique `(tenantId, orderNumber)` index protects all writers. NULL legacy
  numbers remain allowed; another tenant may use the same printed number.
  Command claim/replay still happens first under ADR-018. A replay returns its
  immutable original JSON before clock, price, shift or stock reads and never
  allocates another number. Counter, order/items/payments, movements, allocations
  and successful command result commit or roll back together.

## Upgrade and legacy policy

The additive `20261009010000_taipei_order_sequence` migration explicitly wraps
DDL, preflight and initialization in a transaction. It locks orders against
concurrent writes during the preflight/unique-index/counter initialization window.
Migration timing and an approved deployment remain operational decisions. Retire
old checkout writers before accepting traffic with the new allocator: old code
does not advance counters, and uniqueness is a final guard, not mixed-version
allocation coordination.

First run `prisma/diagnostics/preflight-order-numbers.sql` only on an authorized
copy. It is independently executable with psql and read-only; it lists duplicate
tenant/number groups with every affected order ID, then nonstandard POS numbers.
Migration repeats the duplicate check, reports affected IDs and fails with no
partial DDL. Neither path renumbers, deletes or repairs any historical order.

Initialization uses the date PRINTED on recognizable legacy POS numbers, never
createdAt converted to Taipei. Calendar-invalid dates and non-POS/unparseable
numbers do not seed counters and are not rewritten. Valid five-digit suffixes
seed each tenant/printed-day maximum. Existing longer numeric suffixes reserve
99999 for that printed day, forcing explicit exhaustion rather than collision.
The diagnostic flags these overflows for human review. All old businessDate
values remain NULL; no historical UTC numbers are relabeled. New nullable fields
also leave non-POS writers' behavior intact. The migration does not turn old order
numbers into an authoritative historical business-day accounting source.

## Evidence and limits

See `../verification/order-sequence/README.md` and
`../api/pos-order-number-contract.md` for DATE serialization and old replay shape. Acceptance includes distinct
concurrent commands on different products (so inventory locks cannot hide the
number race), midnight clocks, rollback, exhaustion, tenant isolation, uniqueness,
and unchanged #44 recovery/stock regression suites. Synthetic upgrade probes
assert duplicate failure, read-only diagnostics, no partial schema, legacy row
identity, NULL historical business dates, initialized maxima and overflow bounds.

This supplies a common calendar helper to #30; it does not rewrite daily
settlement queries, historical monetary fields, refund date policy, costs,
permissions, or all-writer inventory authority. It does not close #30, #46 or
release gates. It does not authorize a production migration or deployment.
