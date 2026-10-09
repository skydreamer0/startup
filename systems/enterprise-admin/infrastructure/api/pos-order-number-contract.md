# POS order-number contract — Issue #47 / ADR-019 (Draft)

This additive contract supplements api_spec.md §3.11 without changing checkout
input, command identity, payload hash, authentication or permissions.

- New successful POS checkout results include `businessDate`, serialized by
  Prisma/JSON as `YYYY-MM-DDT00:00:00.000Z`. This is the SQL DATE representation,
  not the actual Taipei start instant. For example the business date 2026-10-09
  starts at 2026-10-08T16:00:00.000Z, while its DATE wire value is
  2026-10-09T00:00:00.000Z. Consumers must treat it as a calendar label.
- `orderNumber` remains `POS-YYYYMMDD-NNNNN`, now with tenant-unique database
  enforcement and a transactional per-business-day counter. New numbering
  samples the clock after stock work. The selected date stays fixed during the
  counter wait; it is not a promise that commit occurs on that same calendar day.
- Exhausting 99999 returns `409` with code `ORDER_SEQUENCE_EXHAUSTED` and message
  `本營業日單號已達上限，請聯絡管理員`. No order or command result commits, and stock,
  payments and counter changes roll back. Never fabricate a replacement number
  or silently advance a date in the UI.
- Successful command replay/result lookup returns the original saved JSON,
  including its original number/date if present. A pre-upgrade snapshot may
  omit businessDate entirely; it is never rewritten to add one. Legacy orders
  read directly have NULL businessDate, as do non-POS writers that do not set it.
- No server clock or businessDate field can be supplied through the HTTP body.
  The optional injected service clock is only an internal deterministic seam.

Exact amounts, historical cost, daily-settlement and refund accounting policies
remain unchanged and outside this delivery.
