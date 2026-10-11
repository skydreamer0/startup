# Completed-order split-payment totals (partial #30)

## Bounded behavior

`backend/src/lib/order-payment-totals.ts` reads the already persisted payment rows
for `status=completed` orders. Daily settlement maps CASH/CARD/LINE_PAY to its
existing fields and other methods to `otherAmount`; shift reports retain method
keys. Repeated methods are added with the existing Prisma.Decimal type. Daily
settlement passes its final method grouping into the same helper so TRANSFER and
OTHER are added before conversion, not recombined as Numbers. Each payment group
converts to Number only at the existing numeric response boundary. Order count
and sale-total arithmetic remain unchanged and order-derived.
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
provider payment, or payment-allocation policy changes. Numeric API fields, Number-based order-total arithmetic and refund formulas remain.
Only grouping/summing already stored payment amounts uses Decimal. No rounding,
quantization or residual correction is added. This is not end-to-end exact-money
or maximum-range/overflow acceptance.

## Verification

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
  classification without changing the original order-total calculation.
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
