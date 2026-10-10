# Completed-order split-payment totals (partial #30)

## Bounded behavior

`backend/src/lib/order-payment-totals.ts` reads the already persisted payment rows
for `status=completed` orders. Daily settlement maps CASH/CARD/LINE_PAY to its
existing fields and other methods to `otherAmount`; shift reports retain method
keys. Repeated methods are added. Order count and sale total remain order-derived.
An empty payment relation explicitly falls back to the order's primary method
and total, preserving legacy orders. Existing zero or inconsistent payment rows
are not repaired, allocated, or replaced with a fabricated residual.

The readers load only payment rows belonging to the active tenant. Their existing
order selection is unchanged. Non-completed statuses keep the previous whole-order
primary-method classification, even when payment rows exist.

## Important unfinished financial policy

This deliberately DOES NOT fix existing refund inconsistencies: daily settlement
still selects `paymentStatus=paid` (including refunded orders), while shift reports
still exclude refunded orders from gross and subtract them again for net and cash.
Preservation is a compatibility boundary, **not an approved accounting policy**.
The tests lock that unchanged behavior only to prevent this split-payment patch
from silently deciding refund policy. Do not release financial reporting on this
slice's evidence. Full #30, G1 and the other business/deployment gates remain open.

No schema, writer, refund event, business date, historical cost, rounding, change,
provider payment, or payment-allocation policy changes. Numeric API fields and
existing Number arithmetic remain; this is not end-to-end exact-money acceptance.

## Current verification checkpoint

- Mocked reader RED: daily 100 cash / 0 card; shift opening 200 gave cash balance
  300 instead of 260 for persisted cash 60 + card 40. Both failures were observed.
- Pure and mocked reader tests: 16 passed after the fix.
- Backend typecheck and focused ESLint: passed with a local copy of existing
  dependency bytes (Node 24.19.0, not a fresh CI Node 22 install).
- Native PostgreSQL/HTTP acceptance and independent review: pending at this
  checkpoint. Browser, physical devices and formal financial acceptance: not run.
- Pre-existing category lifecycle CI failure is unrelated and is not relabelled.

Run the focused tests from `backend/`:

```sh
node node_modules/vitest/vitest.mjs run src/lib/__tests__/order-payment-totals.test.ts src/__tests__/split-payment-totals.test.ts
```
