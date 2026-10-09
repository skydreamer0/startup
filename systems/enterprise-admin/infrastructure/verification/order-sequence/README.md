# Issue #47 acceptance

Status: wired into the independent `Order sequence PostgreSQL acceptance` job
in `.github/workflows/ci.yml`. Exact-head CI is required; this document does not
claim a run passed. Local Node24 pure calendar/guard checks are supplementary,
not Node22 or native PostgreSQL evidence. A skipped opt-in is never acceptance.

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

## Executable CI workflow

The independent GitHub-hosted job preserves all five existing workflow jobs. It checks out
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

## Review the run

Open the PR's CI/CD Pipeline run for the candidate head. The new job checks out
that source SHA directly; the ordinary jobs retain their existing merge-checkout
behavior. Confirm all six jobs pass, then inspect the uploaded
`order-sequence-<head>-<attempt>` artifact:

- `source.json`: exact head, tree, parent(s), workflow/run identity and Node22
- `source-hashes.json`: workflow, source, schema, migration and test identities
- `guard.json` and `network.json`: exact URL and isolated service provenance
- `migration-duplicate.json`: read-only diagnostic, original IDs, rejected upgrade,
  unchanged old rows and no partial DDL
- `migration-upgrade.json`: additive upgrade, unchanged old fields/numbers, NULL
  old business dates, counter maxima and database bounds/uniqueness
- `native.json`, `command.json`, `stock.json`, `mock.json` and their logs: every
  required case passed; missing, failed, pending, todo or substituted native cases fail
- `cleanup-counts.json`, `migration-cleanup.json`, `cleanup.json`: no remaining
  business rows, owned upgrade schema absent, owned database removed
- `accepted.json`: written only after tests, migration checks and cleanup pass

If the job fails, retain its logs/artifact and fix the cause; never lower expected
counts, skip original cases, seed business data or point the harness at another
DB to obtain green results. The next push reruns exact-head acceptance. A failed
preflight does not authorize cleanup of an unowned database.

Passing this synthetic CI does not authorize production execution, legacy-data
repair, store/hardware acceptance, merge or deployment. Retire old numbering
writers under a separately approved rollout, as required by ADR-019.
