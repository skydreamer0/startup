# Issue #49 AC1 / AC2: confirmed stock and stale recovery

This test-only slice reuses #68's existing inventory invalidation, #93's owned
PostgreSQL native runner and #100's official Chrome/process ownership infrastructure.
No product API, schema, transaction, brand asset, dependency or permission changes.
Issue #49 stays open pending independent acceptance of exact-head evidence.

## Bounded execution

The existing SKU job runs `pos-ui/e2e/stock-native/run.mjs` after its category slice,
against the same preflight-proven, initially empty, disposable PostgreSQL 15 service.
No local/ambient URL or existing database is accepted. Original jobs/cases, service,
timeout and final cleanup are retained. The runner and fixture require original
SHA/tree/run/service ownership plus exact `STOCK_QA_DATABASE_URL` before DB imports.

Two independent synthetic tenants at 1366×900 and 1024×900 each execute one checkout
and one money-only refund via the unchanged production app, real JWT/RBAC/tenant
middleware and Prisma. Product/batch stock starts at 5, sale quantity is 1, confirmed
physical quantity becomes 4; refund must keep 4. No payment provider is called.
Fixture JWTs authenticate synthetic active users; login UI is excluded.

After each confirmed write, the test outer layer deliberately returns HTTP 500 for
product GETs. This is injected HTTP-read-failure evidence, not a real DB outage.
The page must keep the last number with a visible stale warning and preserve
confirmed success. Checkout clears only the sold cart; the next one-item draft
survives keyboard Enter retry, refund and pointer retry. Extra write attempts fail
the network ledger and suite. Successful reads and transaction writes remain native.

## Evidence and cleanup

Browser response hashes must match uniquely correlated real API responses. DB
snapshots independently validate sale/refund product, batch, order, payment, OUT
movement, allocation, checkout command and numbering counter. Refund may change
only order status/reason/update time. Final reads/retries must keep that snapshot
unchanged; unrelated tables remain unchanged. Exact generated fixture tenant IDs
are removed in FK order, with all business tables empty. The unchanged final SKU
runner separately drops only its owned DB and proves absence. Failed cleanup,
cancellation or skipped/omitted/retried browser cases cannot become acceptance.

Official installed Chrome keeps its sandbox, with no custom flags. External font
CSS is blocked; installed Noto CJK glyphs are checked. Eight native captures,
journeys/network ledgers, source hashes, DB identity/snapshots, phase exits and
process quiescence receipts go into `pos-stock-native-*`. The ephemeral JWT bootstrap
is removed before publication; traces/videos are off. Actual pixels still require
independent review.

## Verification boundaries

Local checks: `node --test pos-ui/e2e/stock-native/run.test.mjs`, both
`tsconfig.stock-native.json` projects, locked Playwright `--list`, production Vite
build. These do not execute the native fixture or establish DB/browser passes.
Native execution requires the ordinary CI service ownership route.

NOT RUN by this slice: login UI, unknown/conflict native recovery, tenant-switch UI,
390px refund modal, 200% zoom, touch/onscreen keyboard, iPad/Safari, scanner hardware,
whole POS responsive acceptance, store or production deployment. Existing lookup
expansion uses a pointer-only row; keyboard-accessible refund UI is not claimed.
AC3's read-only guards/cases remain unchanged. PR #101 owns branding.

## Local candidate checkpoint (2026-10-10)

Node 24.19.0 is outside the repository's Node 22 engine; local checks are source
checks only. Canonical locked installs used npm 11.21.0 and pnpm 10.34.6 in their
existing boundaries, with no manifest/lock change. PASS: four stock safety/report
controls, both stock TypeScript projects, real locked Playwright collection (2 cases,
no launch), production Vite build, existing inventory component suite 37/37,
fixture ESLint, context validation, lock-boundary validation and diff whitespace.

Initial install attempts failed at the unavailable default npm cache (`ENOENT`)
and pnpm's non-TTY modules-removal confirmation. The ordinary locked installs then
completed using the writable `/tmp` cache/store and CI noninteractive mode; no
credentials, security permissions or global settings changed. Prisma generation
completed without a database connection. Native fixture/browser was NOT RUN locally:
this executor has Node 24 and no installed official Chrome, and the owned guard is
intentionally CI-only. No guard spoofing or alternate browser launch was attempted.

Independent review found a receipt gap: sold order-item changes were not covered by
the refund snapshot. The final fixture includes full raw order-item rows, product
and batch rows, compares sale/refund/final snapshots and reconciles raw final item
rows. Mutation controls now reject changed item price or quantity. This was a
test-evidence correction; no product defect or runtime repair has been established.
Exact-head native CI and independent pixel/result review are still pending.
