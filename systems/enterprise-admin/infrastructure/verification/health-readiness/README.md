# Backend liveness and readiness (#51)

## Contract

These unauthenticated operational routes are on the backend (port 3000), outside
`/api/v1/admin`. They do not require tenant context or expose database details.

- `GET /health`: process liveness only; 200 with the existing `status: "ok"` and timestamp. No database query.
- `GET /ready`: 200 `{ "status": "ready" }` only when the database responds and every packaged Prisma migration has a successful, non-rolled-back history row.
- Any readiness failure: 503 `{ "status": "not_ready", "code": "..." }`, `Cache-Control: no-store`.
- Codes: `DATABASE_UNAVAILABLE`, `MIGRATION_HISTORY_UNAVAILABLE`, `MIGRATIONS_PENDING`, `MIGRATION_FAILED`, `MIGRATION_FILES_UNAVAILABLE`, `READINESS_TIMEOUT`.
- A failed/in-progress, non-rolled-back history row blocks readiness. A rolled-back attempt alone never counts as applied; an explicitly resolved rollback followed by a successful retry does.
- Probes are read-only and single-flight. The HTTP deadline is five seconds; callers cannot queue more probes while the underlying operation is pending. No automatic migration, repair, schema write or secret/error-string response occurs.

The backend starts listening only after the same readiness gate succeeds. Missing
or invalid required configuration uses the existing Zod schema and exits 1 with
`INVALID_CONFIGURATION` plus field names only. Failed startup dependencies exit 1
with `STARTUP_NOT_READY` and a fixed readiness code. Other startup/listen failures
also exit 1 with fixed codes. A later DB outage leaves liveness up but readiness down.

## Deployment checks

The current nginx `/health` is an edge response, not a backend or database probe.
Use the backend container/network endpoint for dependency gating:

```sh
# Edge only
curl -fsS http://localhost/health
# Backend process only
docker compose exec backend wget -qO- http://localhost:3000/health
# Backend dependencies and packaged migration history
docker compose exec backend wget -qO- http://localhost:3000/ready
```

Use `/ready` for traffic/admission decisions and `/health` for process liveness.
Existing Compose healthcheck wiring is not changed by this slice. Do not infer DB
readiness from `docker compose ps` until a deployment's gate explicitly uses `/ready`.
The container must retain `prisma/migrations` beside `dist` (the existing Dockerfile
already does). Readiness does not verify arbitrary schema drift or replace migration
review/backups. Apply reviewed migrations through the existing authorized workflow;
the probes never run migrations. The current image default CMD still performs its
existing `migrate deploy`; test the compiled server with an explicit entrypoint when
verifying fail-fast without auto-migration.

## Verification status

Synthetic tests cover HTTP status, secret-safe errors, migration pending/failure/
rollback classification, and missing/blank configuration process exits. PostgreSQL,
compiled Alpine image and outage acceptance must be reported separately from mocked
tests and skips. No production database, host, security setting or deployment is
part of this verification.

## Guarded CI acceptance

The existing Backend CI appends `scripts/health-readiness/ci.mjs` after ordinary
tests. It verifies GitHub-hosted Actions, exact execution commit/tree, the service
container ID/network/image and existing test authentication. It never consumes an
arbitrary database URL. The maintenance connection is a local socket within that
verified PostgreSQL service; application traffic uses a newly created, uniquely
named `health_readiness_ci_<run>_<attempt>` database. Existing `test_db`, the five
CI jobs, pagination 6+8 cases and their original guards stay unchanged.

The compiled final Alpine image runs `node /qa/verify.cjs` via an explicit
entrypoint, bypassing the image's migration-starting default command. Only the
empty owned database receives an explicit migration deploy. A temporary copy of
unchanged `dist` and packaged Prisma migrations is used for the synthetic pending
migration fixture; there is no production override for expected migrations.

The ten native cases require zero skips:

1. Final Alpine compiled server startup and HTTP readiness 200
2. A fixture-only packaged pending migration produces HTTP 503
3. A committed failed migration history row produces HTTP 503 across the independent HTTP connection
4. A committed rollback-only history row does not count as applied
5. Missing packaged migration files produce HTTP 503
6. Stopping the owned TCP proxy listener and all sockets produces readiness 503 while liveness stays 200
7. A fresh process during that outage exits 1 without listening
8. Restoring that same proxy restores readiness 200
9. Missing JWT configuration exits 1 without listening
10. Canary-free process/HTTP output and no business fixtures left behind

Proxy, API and process probes share the same disposable Alpine network namespace;
no host networking or additional published ports are used. Faults are restored
between cases. Acceptance and cleanup are separate CI stages: even an acceptance
failure must stop the owned runner, drop only its recorded database and verify
absence. Cleanup cannot turn a failed acceptance into a pass. Artifacts record
source head separately from GitHub's PR merge execution head/tree and image ID;
never label merge-tree evidence as exact source-head execution.

The eight dependency-free service guard tests can run with:

```sh
node --test scripts/health-readiness/ci.test.mjs
```

Local static/guard checks do not constitute native acceptance. Native PG, Alpine,
HTTP outage/recovery and the nineteen Vitest cases remain NOT RUN until the exact
published CI execution supplies its acceptance and cleanup records.
