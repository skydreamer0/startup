# Issue #47 acceptance

Status: source prepared. Local Node24 pure calendar/guard checks passed; Node22,
Prisma generation/typecheck, PostgreSQL, upgrade probes and original Vitest suites
have NOT RUN on this candidate. A skipped opt-in is never native acceptance.

## Scope

- Nine new real PostgreSQL cases in `backend/src/__tests__/order-sequence.integration.test.ts`
- Original command recovery: 21 cases, including same-command concurrency,
  payload conflict, changed business state, worker crash/restart and lost response
- Original stock/FEFO/contention: 38 cases
- Existing checkout unit suite: 5 cases
- Two pure calendar checks and seven pure harness-control checks
- Synthetic old-schema upgrade/duplicate/diagnostic probes

Native fixtures use fresh synthetic tenants/products only. The new test opt-in
accepts exactly `postgresql://test@127.0.0.1:55436/checkout_order_sequence_ci`,
with identical DATABASE_URL and ORDER_SEQUENCE_DATABASE_URL. No ambient fallback.
The original suites are run sequentially against this same owned synthetic DB.
No broad seed, production URL, permission/role grant, or installed local runtime
is part of this procedure.

## CI wiring contract (workflow owner integrates separately)

Use an independent GitHub-hosted job; preserve existing workflow jobs. Checkout
`${{ github.event.pull_request.head.sha || github.sha }}` with persisted
credentials disabled. Node22 and backend-locked npm11.21.0/npm ci only.

Dedicated service: postgres:15-alpine; POSTGRES_USER=test,
POSTGRES_DB=checkout_order_sequence_ci, POSTGRES_HOST_AUTH_METHOD=trust; bind only
127.0.0.1:55436:5432 with pg_isready health check. This trust policy is confined to
the disposable synthetic service; never apply it to any existing database.

Backend working directory and environment:

- DATABASE_URL and ORDER_SEQUENCE_DATABASE_URL: exact URL above
- ORDER_SEQUENCE_QA_HEAD: checked-out PR source head
- ORDER_SEQUENCE_QA_CONTAINER: service container ID
- ORDER_SEQUENCE_QA_NETWORK: service network

Steps:

1. `node scripts/order-sequence-ci.mjs preflight` before migration or installation
2. Install canonical locked backend dependencies; `npm run db:generate`
3. `node --experimental-strip-types --test scripts/business-day.test.mjs scripts/order-sequence-ci.test.mjs`
4. `node scripts/order-sequence-ci.mjs run`
5. Always, if preflight succeeded: `node scripts/order-sequence-ci.mjs cleanup`
6. Always upload `${{ runner.temp }}/order-sequence-qa-${{ github.run_id }}-${{ github.run_attempt }}/`

The harness validates exact head/tree, a clean checkout, no backend .env,
loopback-only nonprivileged dedicated service with no host bind mounts, exact
network membership, empty public schema, server version/user/address and owned
DB. It records source hashes and per-case JSON/logs; missing or skipped cases fail.
Synthetic migration probes create an absent named schema inside that owned DB,
apply unchanged prior migrations, test both failure and upgrade, and drop only
that owned schema. The normal full migration chain then runs on empty public.
Tests clean their own tenant rows; final cleanup independently requires every
business table, including counters, to be empty, drops only the registered owned
DB and verifies it is absent. Failed tests cannot produce accepted.json.

No workflow wiring, remote push, production execution or store/hardware
acceptance is implied by this source checkpoint.
