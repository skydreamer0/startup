# Real HTTP restart and lost-response follow-up to #44

2026-10-06; base master `12c415d5e677e38ec2dfa23d425c600d7395080e`
(#44 merged 13:19:07 UTC). This follow-up is test/harness/evidence only, in the
original executor. Draft review only; no merge, deployment, real-store data,
credential changes or production gate approval. #30/#31/#37 remain open; #29
inventory acceptance is unchanged.

## Current results

| Case / check | Result |
| --- | --- |
| Real Chromium → committed checkout → lost response → owned API SIGKILL/restart → refresh → GET | passed |
| Same path → refresh → same command/original payload POST | passed |
| Per case: order/payment/OUT movement/allocation/command rows | 1 / 1 / 1 / 1 / 1 |
| Product and released lot balance | both 5 → 3; sold / OUT / allocated / both debits = 2 |
| Original order ID, orderNumber and full JSON | unchanged after restart and recovery |
| Frozen intent + unknown + draft survives refresh | passed; removed only after confirmed receipt |
| Existing POS conflict/hash recovery regression | 2 files / 16 tests passed |
| Harness TypeScript check, backend lint, backend/POS builds | passed |
| Existing real PostgreSQL command regression | 1 file / 21 tests passed (19 DB cases + 2 hash vectors) |
| Latest-head CI and independent review | tracked in Draft; do not infer approval from this table |

Raw final browser run: [2/2 with individual DB counts](raw/http-recovery.txt).
The initial harness run failed because the empty process cwd became Vite's root;
the dedicated test config now explicitly selects the POS root and an empty envDir.
[That initial failure](raw/harness-initial-failure.txt) is retained. No #44
application defect was reproduced, so application behavior/schema is unchanged.

## Real path and controlled synchronization

Only the first browser checkout POST is intercepted. `route.fetch()` forwards the
unaltered authenticated request through the owned Vite proxy to the independent
`backend/dist/server.js` process and waits for its actual 201 JSON. The harness
then aborts delivery to Chromium. It never fulfills a fabricated sale or lookup.
The controller returns 201 only after its real PostgreSQL transaction commits;
an independent DB snapshot also verifies the committed command and original JSON.

After POS enters unknown, the harness sends SIGKILL through its retained
ChildProcess handle, verifies SIGKILL exit and HTTP unavailability, and starts a
different PID with the same explicit DB URL and ephemeral JWT secrets. PostgreSQL
is not restarted or reseeded. Before/after/final snapshots are exactly equal.
Refresh hydrates the same saved command, payload and draft. GET verifies the saved
hash through existing UI behavior; resend sends the exact original payload. The
confirmed receipt shows the original number and clears only the saved intent.
The existing known-conflict lock and mismatched-hash behavior are untouched and
covered by the focused POS regression.

No sleep selects the crash point: real 201 plus persisted DB result is the barrier.
The 50ms bounded polling is only process readiness. HTTP kill **before commit** is
not run in this follow-up; the previous command-service crash evidence is separate.

## Environment and fixture evidence

Local PostgreSQL 15.18 is a separately initialized synthetic cluster on
`127.0.0.1:55434`, inside the original executor. Its [startup record](raw/postgres-startup.json),
[initdb output](raw/postgres-initdb.txt) and [server log](raw/postgres-server.txt)
are retained. The explicit administration connection is
`postgresql://test@127.0.0.1:55434/checkout_http_recovery_base`; each case creates a
new `checkout_http_recovery_query_*` or `checkout_http_recovery_retry_*` database.
Guards require a PostgreSQL URL, loopback host, explicit port, user `test` and that
database prefix. Missing/other connections fail; no default DATABASE_URL is used.

Each database starts empty, receives the existing migrations and only a synthetic
tenant, manage:pos cashier role/user, walk-in customer, open shift, one product
and one released 2099-expiry lot (5 units, unit price 100). The UI sells 2 for CASH
200. Both independent databases can start at the same display order number;
this is not a unique-number acceptance claim.

API and POS processes run with a small environment allowlist and empty temporary
cwd/envDir, without reading the checkout's `.env` or `/proc/.../environ`. Secrets
are generated in memory, unchanged across the API restart and omitted from all
records. No source-unknown existing server is used. Browser trace/video are off
to avoid capturing authentication headers; screenshots and allowlisted JSON are
the shareable evidence. All owned API/POS processes are stopped after each case.

| Recovery | API PID change | DB and full JSON evidence | Processes | Screenshots |
| --- | --- | --- | --- | --- |
| GET | 19405 → 19498 | [query snapshot](query/recovery-evidence.json) | [owned PID/env record](query/owned-processes.json) | [unknown after restart/refresh](query/unknown-after-api-restart-and-refresh.png), [confirmed original](query/confirmed-original-order.png) |
| Resend | 19570 → 19626 | [retry snapshot](retry/recovery-evidence.json) | [owned PID/env record](retry/owned-processes.json) | [unknown after restart/refresh](retry/unknown-after-api-restart-and-refresh.png), [confirmed original](retry/confirmed-original-order.png) |

Each evidence JSON includes the baseline, post-commit, post-restart and final
snapshot, original HTTP result, recovered result, frozen intent, POST payloads and
canonical original-result SHA-256. Row IDs link the allocation to its one order
item, lot and OUT movement; payment links to that same order. OUT quantity uses
the existing positive-quantity + OUT-type convention.

## Reproduce

Use an isolated local PostgreSQL 15 server owned by the test runner. Create an
empty administration DB named `checkout_http_recovery_base`, with a test user
allowed to create the per-case databases. Never use a store connection.

```sh
# systems/enterprise-admin/backend (existing dependencies / lockfile)
npm ci
npm run db:generate
npm run build

# systems/enterprise-admin (POS workspace dependencies)
pnpm install --frozen-lockfile
# If workspace installation replaced backend dependencies, repeat backend npm ci/generate/build.

# systems/enterprise-admin/pos-ui
npm run test:e2e:install
npm run test:e2e:http-recovery:types
POS_HTTP_RECOVERY_DATABASE_URL=postgresql://test@127.0.0.1:55434/checkout_http_recovery_base \
  npm run test:e2e:http-recovery
npm test -- src/__tests__/useCheckout.test.tsx src/__tests__/checkoutPayloadHash.test.ts
npm run build
```

The harness copies only test migration inputs into a temporary cwd, migrates each
fresh DB, seeds it, and owns both server lifecycles. No manual API/POS server or
application seed is required. Local browser cache can be selected with
`PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/playwright`. CI adds these two cases to
the existing POS UI job against its synthetic PostgreSQL 15 service and uploads
the screenshot/JSON/raw process evidence (no trace or credential values).

The focused backend regression uses a separate
`checkout_http_recovery_regression` DB on the same owned synthetic cluster:
explicit DATABASE_URL + NODE_ENV=test + fresh test JWT secrets, migrate deploy,
then `npm test -- src/__tests__/checkout-command.integration.test.ts`.
[Raw execution](raw/backend-command-regression.txt), [POS regression](raw/pos-recovery-regression.txt),
and [POS build](raw/pos-build.txt) are retained.

## Not run / remaining scope

- No production migration, real prescription/patient/payment/inventory data,
  provider charge, hardware/printing, deployment, restore rehearsal or gate release.
- No new before-commit HTTP kill, multi-tab first-submit, full offline sync,
  unique order numbers/business date/exact money or #31 scan/freshness/layout work.
- Existing mixed-writer/restore/final-host G1/G2/G4/G7 requirements remain pending.
  This test proves the two bounded HTTP post-commit recovery paths only.
