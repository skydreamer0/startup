# POS category PostgreSQL and HTTP acceptance (#49)

This is the remaining database/API evidence slice for the existing category API.
It does not add a category model, change application behavior or close the broader
Issue #49, #31 or #37 acceptance gates.

## Existing execution path

The ordinary `pos-sku-acceptance` CI job still uses the same `ubuntu-latest` runner,
20-minute timeout, PostgreSQL 15 Alpine service, single-member network and
loopback-only port 55435. There is no new job, runner type, environment, credential,
permission, service or dependency. The five original SKU cases are unchanged and
reported separately from the nine new category cases.

`backend/scripts/pos-product-lookup-ci.mjs` owns preflight, the existing migrations,
case-level report validation and cleanup. It refuses an existing/nonempty schema,
a reused ownership record, a wrong source/head/run/service/network or an ambient
URL. Only after ownership is established does it pass a separate
`POS_CATEGORIES_DATABASE_URL` opt-in to the new suite. That opt-in must equal both
existing database variables and the exact owned synthetic URL, in test mode.
Missing opt-in skips the suite without loading application/Prisma modules or
creating fixtures; skipped cases are never accepted by this harness.

Do not set these variables against a local, store, production or existing database.
The native suite is intended for the already guarded CI path, not a standalone
migration, broad seed or workstation PostgreSQL installation.

## Nine native cases

All use real Prisma/PostgreSQL without database, JWT, route or middleware mocks.
The HTTP cases mount the existing default rate limiter, tenant middleware, POS routes, auth/RBAC,
controller/service and error middleware on a test-only Express application.
Authentication uses real signatures with public, test-only signing values supplied
by the harness and synthetic database users. It does not log in to a real account.

1. Concurrent tenant-scoped service reads return different category IDs for the
   same names and never mix request contexts.
2. Real JWT-to-tenant-to-permission HTTP reads return sorted, exact `id`/`name`
   projections, without private category fields.
3. Empty and zero-stock categories stay visible despite more than 100 products,
   an empty product search, a foreign category filter and an in-stock filter.
4. An authenticated tenant with no categories receives a successful empty list.
5. Missing/invalid authentication returns 401 without category data.
6. A real active user lacking existing `manage:pos` returns 403.
7. A suspended user or a valid token presented with another tenant header returns
   401 without category data.
8. Alternating A/B/A HTTP requests do not reuse another tenant's categories.
9. The service fails closed without tenant context.

After each case, all fixture product/category/user rows and order/payment/movement
counts must remain unchanged. Fixture cleanup removes only the UUID-scoped data
created by this suite. The harness then requires zero rows in every business table,
drops only the database whose empty ownership it recorded and verifies its absence.
Failure still attempts owned cleanup but cannot produce passed acceptance.

## Evidence and local checks

The existing `pos-sku-*` artifact retains exact SHA/tree, run/attempt, source hashes,
service/server identity, guard probes, commands, raw logs, per-case Vitest JSON,
row counts and cleanup. `native.json` remains the original five SKU cases;
`categories.json` is the new category suite. `tests.json` and final `accepted.json`
require both exact case inventories with zero failed, omitted, substituted or skipped
cases. A green unrelated job or historical artifact does not validate this change.

Local pure checks:

```bash
node --test backend/scripts/pos-product-lookup-ci.test.mjs
```

These run report/ownership/URL negative controls only, never PostgreSQL. The category
opt-in guard also rejects query strings, fragments, wrong hosts/ports/users/databases,
passwords, mismatched ambient variables and non-test mode.

## Evidence boundaries and remaining gates

This adds HTTP-to-real-database evidence for the category read contract. It is not
browser-to-API-to-database, staff-login security review, exhaustive authentication
verification, cross-terminal freshness, confirmed checkout/refund quantity or a
payment-provider test. The bounded mismatched-header rejection does not resolve
#37's broader tenant-header/authentication design review.

The existing category 500/error/retry tests remain mocked and separate. This suite
does not intentionally stop PostgreSQL or modify database privileges. UI dimensions,
native page zoom, real keyboard/pointer/touch, iPad/Safari, hardware and store
acceptance remain separate. Original #49 checkboxes must only change after the
relevant exact-head evidence has been independently reviewed.
