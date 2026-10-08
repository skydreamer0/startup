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
