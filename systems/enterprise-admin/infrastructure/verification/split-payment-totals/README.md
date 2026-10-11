# Completed-order split-payment totals (partial #30)

## Bounded behavior

`backend/src/lib/order-payment-totals.ts` reads the already persisted payment rows
for `status=completed` orders. Daily settlement maps CASH/CARD/LINE_PAY to its
existing fields and other methods to `otherAmount`; shift reports retain method
keys. Repeated methods are added with the existing Prisma.Decimal type. Daily
settlement passes its final method grouping into the same helper so TRANSFER and
OTHER are added before conversion, not recombined as Numbers. Each payment group
converts to Number only at the existing numeric response boundary. Order counts
remain unchanged. Order-derived sale totals also add persisted amounts with
Prisma.Decimal, then convert once to Number, avoiding intermediate binary drift
between separate orders (for example, 0.1 + 0.2). No total is derived from or
normalized to the payment sum.
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
refund formulas remain. Grouping/summing already stored payment amounts and
order sale totals uses Decimal. No explicit rounding,
quantization or residual correction is added. This is not end-to-end exact-money
or maximum-range/overflow acceptance. The existing Decimal implementation has
finite precision, and the Number response boundary remains lossy for amounts
beyond Number precision; this patch does not change either contract.

## Order-total precision follow-up (stacked on #111)

This follow-up starts at #111 head `cb39ce50d56ede45a42e8369dff5f0c2f257fe64`
(tree `68959e0dbd985caeccf90a119fd8bd51cd7c7817`), with master still
`83a1b15cf156c7b0b409ee96b2fabab67b9c74e4` at author verification. Its only runtime
change is the helper's order-total accumulator and final Number conversion.
Payment classification, tenant scopes, cohorts, queries, refund/discount/net/cash
formulas, writers and schema are unchanged. Net/cash formulas may still produce
binary drift; compatibility is not refund-policy approval.

- Original-helper negative control with the new tests: 22 passed / 11 failed.
  Both readers reproduced order-total `0.30000000000000004` while the classified
  cash sum was `0.3`. The changed helper passes all 33 pure/mocked cases.
- Backend build, backend and focused-test typechecks, full backend ESLint,
  context validation and unchanged ownership guards (14/14) passed. Prettier's
  check fails on the same three source/test files at both the #111 base and this
  follow-up; no broad formatting-only rewrite is included or claimed as passing.
- Tests cover separate Decimal/string/number totals, signed cancellation,
  negative and zero stored facts, four-decimal values, unchanged empty counts,
  fallback/status classification and inconsistent-payment sums without repair.
  The pure-only five-decimal and unsafe-integer cases are outside Order's
  Decimal(12, 4) storage contract: they establish no added quantization and the
  existing lossy Number boundary, not native storage/range acceptance.
- Runtime: Node 24.19.0 / npm 11.9.0, standalone backend `npm ci` using the unchanged
  lockfile. The required Node 22 / npm 11.21.0 environment was not used. No
  dependency, workflow, browser, database, schema or security setting changes.
- Fresh native PostgreSQL/HTTP, browser/device, full financial/G1 and exact-head
  CI acceptance remain open. This checkout has no PostgreSQL installation; no
  installation or existing-database fallback was attempted. Independent review
  of this follow-up is separate from #111's historical evidence. Keep Draft.
- This stacked change depends on #111 and inherits its unresolved acceptance
  gates, including the reported category lifecycle/browser CI gate. No merge or
  deployment is authorized by this evidence.

## Cross-order native regression addition (2026-10-11)

The existing owned native harness now adds a twelfth case: two real checkout
requests in one synthetic shift, separately priced at 0.1 and 0.2. It requires two
distinct persisted completed/paid orders, each with its matching tenant, shift,
Decimal total and one CASH payment. Both unchanged HTTP readers must return two
orders and numeric totalSales/grossSales/CASH totals of 0.3. Complete before/after
application-table snapshots must be identical; the separate
`decimal-cross-order.json` artifact retains the stored facts, responses and snapshots.
This specifically exercises accumulation across orders, unlike the two historical
decimal cases, which each store one order totaling 0.3.

Native execution of this new case is **NOT RUN** in the author checkout: neither
PostgreSQL nor Docker is installed. No installation or existing database fallback
was attempted. The existing CI workflows provision isolated PostgreSQL for other
acceptance suites, but neither their commands nor package scripts invoke this
nonce-owned split-payment runner. An ordinary CI pass therefore cannot establish
native cross-order acceptance. No workflow, runner ownership guard, dependency,
production code, schema, refund, tenant or date policy is changed in this addition.
Typechecking or pure/mocked tests are not native PostgreSQL evidence. Keep Draft;
fresh native results and independent acceptance remain required.

## Historical #111 verification (not rerun by the follow-up)

- Precise mocked-reader RED: daily 100 cash / 0 card; shift opening 200 gave cash
  balance 300 instead of 260 for cash 60 + card 40. Both failures were observed.
- Pure and mocked-reader tests: 20 passed after the fix. Ownership guards: 14 passed.
- Isolated native PostgreSQL 15.19 + unchanged Express HTTP API: 11 passed, 36 HTTP
  exchanges (the original nine cases plus two persisted-decimal regressions). Actual checkout stores 60/40; reverse payment order with CARD primary
  is identical; repeated methods and CASH/CARD/LINE_PAY/TRANSFER/OTHER reconcile;
  same-command replay leaves the entire database unchanged and retains exactly
  two payments, one allocation, one OUT movement and one command. Legacy rows,
  unchanged refund/noncompleted outputs, foreign-tenant payment filtering and
  both endpoints' tenant/RBAC/auth/missing-shift boundaries are checked.
- Exact native REDs were observed before the Decimal follow-up: stored CASH0.1
  + CASH0.2 produced CASH0.30000000000000004 in both HTTP readers; stored
  TRANSFER0.1 + OTHER0.2 produced daily otherAmount0.30000000000000004. Both now
  return numeric0.3. Each RED ran the original nine cases successfully first and
  failed the added case, then verified all three owned-resource cleanup checks.
  The follow-up also covers repeated methods across orders and fallback/status
  classification. That #111 slice did not change order-total calculation; the
  separately bounded follow-up above does.
- Both readers are surrounded by complete application-table snapshots. No row
  changes are allowed. Real receipts and checkout are synthetic fixtures only.
- The first native attempt passed eight cases then failed because the harness
  expected 401 for a request missing both token and tenant; the existing tenant
  middleware returns 400 first. The corrected harness checks both missing-tenant
  400 and explicit-tenant/absent-token 401. Original failed evidence is retained;
  no production behavior was changed to satisfy the test.
- Backend build/typecheck, harness typecheck and focused ESLint passed with a
  local copy of existing dependency bytes on Node 24.19.0, not a fresh Node 22
  frozen install. Broader non-integration tests: 240 passed, 5 failed in the
  existing startup-config suite because tsx CLI's Unix IPC bind returned EPERM.
  These broader tests predate the Decimal follow-up and were not rerun.
  Those failures remain failures; no security bypass or source change was made.
  An earlier unconfigured full-suite attempt failed missing database/config
  prerequisites (232 passed / 43 failed / 64 skipped); it is not full acceptance.
- Independent review of the previous `ecd21a22` / tree `491234dd` was bounded PASS
  for its own subject only. The Decimal follow-up requires fresh independent
  delta/runtime review and exact new-head CI; both are pending at author handoff. A pre-existing category lifecycle CI failure remains open.
- No browser, device, production, full financial, refund-policy, rounding,
  overflow, historical-cost or cross-day acceptance is claimed.

## Reproduction and ownership

From `backend/`, with existing installed dependencies and an already authorized
PostgreSQL 15.19 official installation (the runner installs nothing):

```sh
node node_modules/vitest/vitest.mjs run src/lib/__tests__/order-payment-totals.test.ts src/__tests__/split-payment-totals.test.ts
node --import tsx --test scripts/split-payment-guards.test.ts
node node_modules/typescript/bin/tsc --noEmit
node node_modules/typescript/bin/tsc --noEmit --target ES2020 --module commonjs --moduleResolution node --esModuleInterop --skipLibCheck --strict scripts/split-payment-local.ts scripts/split-payment-guards.ts src/types/*.d.ts
python3 scripts/split-payment-owned.py --pg-bin "$APPROVED_PG_BIN" --output "$NEW_EVIDENCE_DIRECTORY"
```

The native runner requires a new output directory, refuses `.env`, and never
consumes an ambient database URL. It starts a new nonce-owned loopback-only cluster
and creates a uniquely named empty database. Before migration it checks data
location, listen address, system identity, database absence and empty public schema.
Before constructing the application DB client, matching explicit URLs, owner
marker, nonce, source identity and canonical paths are checked; the connected
server's actual identity is then compared again. No existing database is reused.
Afterward the runner verifies ownership again, drops only its database, stops only
its own postmaster and removes only its own directory. Cleanup has its own receipt.

Evidence includes all tracked source hashes plus runner hashes, runtime and
ownership identity, migration and raw test logs, per-case outcomes, actual HTTP
payloads without authentication tokens, full synthetic snapshots, and a separate
cleanup receipt. Failed attempts retain logs and still clean their owned resources.
This local runner derives from PR #110's ownership pattern; it has a distinct
nonce/database/output namespace and shares no database or server with that work.
No workflow, dependency, shared existing runner, or environment configuration changes.
