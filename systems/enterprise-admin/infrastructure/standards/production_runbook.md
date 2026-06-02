# Production Runbook

> Scope: `systems/enterprise-admin` production Docker Compose deployment.  
> Related architecture: `../adr/adr_011_production_deployment.md`.  
> Last updated: 2026-06-02.

This runbook turns Phase 11 deployment scaffolding into an operator workflow. It covers the minimum steps an on-call or cloud worker needs to deploy, verify, migrate, roll back, and restore the enterprise admin stack without relying on conversation history.

---

## 1. Deployment Topology

Production runs as one Docker Compose stack from `systems/enterprise-admin`:

| Service | Responsibility | Public exposure |
| --- | --- | --- |
| `nginx` | Single HTTP entrypoint and reverse proxy | Host port `80` by default; `443` is reserved for future TLS enablement. |
| `backend` | Express API and `/health` endpoint | Internal Compose network only, exposed to `nginx` as `backend:3000`. |
| `admin-ui` | Static admin SPA served by nginx | Internal Compose network only, proxied at `/`. |
| `pos-ui` | Static POS SPA served by nginx | Internal Compose network only, proxied at `/pos/`. |
| `postgres` | Application database | Bound to host port `5433` for current scaffold access; restrict or remove host binding on hardened hosts. |

Nginx route contract:

- `/api/*` proxies to `backend:3000`.
- `/pos` redirects to `/pos/`.
- `/pos/*` proxies to `pos-ui:80` after stripping the `/pos/` prefix.
- `/` proxies to `admin-ui:80`.
- `/health` returns `ok` from the edge proxy.

---

## 2. Secret And Environment Ownership

Use `systems/enterprise-admin/.env.production.example` as the template, not as a deployable secret file.

| Variable | Owner | Rotation / handling |
| --- | --- | --- |
| `DATABASE_URL` | Platform / DBA owner | Must match the production database credentials. Rotate with DB password rotation and update dependent services together. |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | Platform / DBA owner | Required only when Compose owns Postgres. Do not commit real values. |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Backend / security owner | Minimum 32 random characters. Rotate by deploying new secrets and forcing user re-login. |
| `JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN` | Backend owner | Keep access tokens short-lived; refresh duration follows product security policy. |
| `URL`, `FRONTEND_URL`, `CORS_ORIGIN` | Platform / frontend owner | Must match the public DNS origin exactly, including scheme. |
| TLS certificate material | Platform owner | Store outside git. Current Compose file includes certbot placeholders only. |

Before any production deploy:

1. Copy `.env.production.example` to the deployment host secret store or host-local `.env.production` file.
2. Replace every `change-me`, `replace-with-*`, and `example.com` value.
3. Confirm the deploy user can read secrets but they are not world-readable.
4. Confirm no real secrets appear in git diff, shell history, PR text, or logs.

---

## 3. Standard Deployment Procedure

Run commands from `systems/enterprise-admin` unless noted otherwise.

### 3.1 Preflight

1. Confirm the branch/commit being deployed and review the associated PR.
2. Confirm CI has passed, especially backend `prisma generate`, backend build, admin-ui build, and pos-ui build.
3. Confirm `.env.production` or the host secret injection mechanism is populated.
4. Confirm disk space is sufficient for image build, Postgres data, and a backup artifact.
5. Create a pre-deploy database backup before running migrations.

### 3.2 Build And Start

```bash
make prod
```

Equivalent command:

```bash
docker compose up -d --build
```

Expected result:

- `postgres` becomes healthy first.
- `backend` starts after Postgres is healthy.
- `admin-ui` and `pos-ui` start after backend is healthy.
- `nginx` exposes the public HTTP entrypoint.

### 3.3 Verify Health

```bash
docker compose ps
curl -fsS http://localhost/health
docker compose exec backend wget -qO- http://localhost:3000/health
```

Interpretation:

| Check | Healthy signal | Action when unhealthy |
| --- | --- | --- |
| `docker compose ps` | Services show `running` / `healthy` where healthchecks exist. | Run `docker compose logs -f <service>` and check the dependency chain. |
| `GET /health` at nginx | Returns `ok`. | Check nginx config, upstream service names, and port exposure. |
| Backend healthcheck | Backend `/health` returns JSON from inside the backend container. | Check `DATABASE_URL`, JWT env parsing, Prisma generation, and backend logs. |
| Admin UI route `/` | Admin shell loads. | Check `admin-ui` container build and nginx upstream. |
| POS route `/pos/` | POS shell loads with assets under `/pos/`. | Check `VITE_BASE=/pos/` build arg and nginx rewrite rules. |

---

## 4. Migration Procedure

Use migrations only after a backup exists and the release commit is confirmed.

```bash
make migrate
```

Equivalent command:

```bash
docker compose run --rm backend npx prisma migrate deploy
```

Migration checklist:

1. Confirm backup artifact exists and restore steps are known.
2. Confirm no application deploy is simultaneously running.
3. Run `make migrate` once per deployment.
4. Watch backend logs for Prisma migration errors.
5. Re-run health checks and smoke-test login plus a read-only admin page.

If migration fails:

1. Stop further deploy steps.
2. Capture `docker compose logs backend postgres`.
3. Do not retry repeatedly without identifying the failed migration and DB state.
4. If the failed migration partially changed schema/data, follow the rollback/restore section.

---

## 5. Rollback Procedure

Rollback depends on whether migrations were applied.

### 5.1 Application-Only Rollback

Use when no migration ran or when the migration is backward-compatible with the previous image.

1. Check out or select the previous known-good release commit/tag.
2. Rebuild and restart:

```bash
docker compose up -d --build
```

3. Verify `docker compose ps`, `/health`, `/`, and `/pos/`.
4. Record the rollback commit and reason in the incident notes.

### 5.2 Migration Rollback / Restore

Use when a migration changed schema/data and the previous app version is not compatible.

1. Stop write traffic if possible.
2. Keep containers/logs available for forensics.
3. Restore the pre-deploy database backup into the target database.
4. Deploy the previous known-good application commit.
5. Re-run health checks and smoke tests.
6. Open a follow-up issue with the failed migration name, logs, and restore timestamp.

Do not manually edit production schema as a rollback unless the DBA/platform owner approves and records the exact SQL.

---

## 6. Backup And Restore Expectations

Minimum production expectation:

- Take a database backup before every migration-bearing deploy.
- Keep automated daily backups for the retention period defined by the platform owner.
- Test restore on a non-production database before trusting a backup strategy.
- Store backup artifacts outside the application git repository.

Suggested Compose-owned Postgres backup command pattern:

```bash
docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > backup-$(date +%Y%m%d%H%M%S).sql
```

Suggested restore command pattern for a verified backup:

```bash
cat backup.sql | docker compose exec -T postgres psql -U "$POSTGRES_USER" "$POSTGRES_DB"
```

For managed databases, use the provider snapshot and point-in-time recovery workflow instead of ad hoc host-local dumps.

---

## 7. Monitoring Checklist

Use this checklist during deploys and as first-response triage.

### 7.1 Service Health

- `nginx` `/health` returns `ok`.
- Backend `/health` is reachable from inside the Compose network.
- `docker compose ps` shows no restart loop.
- `docker compose logs -f nginx backend postgres` has no repeated 5xx, connection, or migration errors.

### 7.2 Error Monitoring

- Track backend 5xx rate and failed auth requests.
- Track nginx upstream errors for `/api/*`, `/pos/*`, and `/` separately.
- Alert when SLO thresholds in `slo_error_budget.md` are breached.

### 7.3 Audit And Security Signals

- Confirm sensitive admin actions still write audit logs after deploy.
- Alert on unusual spikes in failed login attempts.
- Alert on repeated RBAC/permission-denied responses for privileged endpoints.
- Never log passwords, JWT secrets, full payment data, or other sensitive PII.

### 7.4 Rate Limit And Abuse Signals

- Monitor barcode/product lookup spikes from POS clients.
- Monitor analytics/report endpoints for repeated expensive requests.
- Alert when edge/backend rate limit counters approach configured limits.

### 7.5 Data And Database Signals

- Monitor Postgres disk usage, connection count, and restart count.
- Confirm migration completion before accepting write traffic.
- Confirm backup job completion and restore-test cadence.

---

## 8. First Response For Failed Deploys

1. Keep the failing containers running long enough to capture logs unless they are actively damaging data.
2. Capture:

```bash
docker compose ps
docker compose logs --tail=200 nginx backend postgres admin-ui pos-ui
```

3. Classify the failure:
   - **Config/secrets:** env parser errors, CORS mismatch, JWT secret length, wrong public URL.
   - **Database:** Postgres unhealthy, migration failed, Prisma client/schema mismatch.
   - **Routing:** nginx 404/502, `/pos/` asset path errors, `/api/*` proxy errors.
   - **Build/image:** UI assets missing, backend image build failed, stale image tag.
4. Apply the smallest safe fix or rollback path.
5. Re-run health checks and smoke tests.
6. Record the root cause, command output, and follow-up owner.

---

## 9. Known Gaps And Deferred Hardening

- TLS/certbot is scaffolded but deferred until host DNS is fixed.
- Compose-owned Postgres is acceptable for scaffolded deployments; hardened production may require a managed database and private networking.
- The current Compose scaffold binds Postgres to host port `5433`; remove or firewall that binding for hardened hosts.
- Roadmap A found that some cloud environments cannot fetch Prisma engines from `binaries.prisma.sh`; production/CI runners must either allow that host or cache the required engines. CI now caches `~/.cache/prisma`, but first-time runners still need network access or a pre-populated cache.
- POS Playwright E2E requires browser installation via `pnpm --filter pos-ui run test:e2e:install` before it can be used as a deploy gate. Cloud runners may receive 403 responses from Playwright CDN downloads; use network allowlisting or a pre-populated browser cache before promoting E2E to a required gate.
