# Issue #30: bounded POS today-orders query

This partial slice consumes the existing ADR-019 / #47 Taipei-midnight calendar.
`GET /pos/orders/today` continues to select by `Order.createdAt`, now within
`[Taipei midnight, next Taipei midnight)` rather than host-local midnight with no
upper bound. For 2026-10-11 in Taipei this is 2026-10-10T16:00:00.000Z inclusive
through 2026-10-11T16:00:00.000Z exclusive. The server samples the clock once per
read. The optional injected clock is internal, not a new HTTP query parameter.

The existing tenant scope, optional shift filter, all-status behavior, descending
createdAt ordering, 200-row cap and item/product response shape are retained.
This does not query or backfill businessDate, reinterpret order numbers, or decide
refund accounting. Payment/refund/stock writers, schema, date-helper semantics,
reports and settlement policies are unchanged. Issue #30 and all release gates
remain open; this is not deployment or operational acceptance.

## Focused verification

`backend/src/__tests__/pos.todayOrders.test.ts` covers the instants immediately
before/at Taipei midnight, the exclusive next midnight, future-row exclusion,
UTC/Taipei TZ settings with identical synthetic results, tenant/shift boundaries,
unchanged query shape/status handling, default clock and failure propagation.
Persistence is mocked: these tests are not native PostgreSQL, HTTP or browser
acceptance. The all-status fixtures intentionally include refunded and pending.

Reproduce from `systems/enterprise-admin/backend` with the repository's Node 22
and npm 11.21.0 toolchain after `npm ci` and `npm run db:generate`:

```sh
TZ=UTC npm test -- src/__tests__/pos.todayOrders.test.ts
TZ=Asia/Taipei npm test -- src/__tests__/pos.todayOrders.test.ts
npm run build
npm run lint
```

At the initial Draft publication, local runtime tests/build/lint are NOT RUN:
this workspace has no backend dependencies and its Node 24 / npm 11.9.0 do not
match the pinned toolchain. Remote exact-head CI results and independent review
must be checked separately. Native PostgreSQL, UI/browser, devices and production
acceptance are NOT RUN. No production data was accessed.
