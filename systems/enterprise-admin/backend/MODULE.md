# backend Module Context

## Purpose

`backend` is the Express + Prisma API service for `enterprise-admin`. It owns authentication, tenant-aware domain APIs, persistence, and backend tests.

## Read this first for

- Backend route, controller, service, repository, middleware, or auth work.
- API behavior that affects `admin-ui` or `pos-ui`.
- Prisma-backed data model or persistence changes.
- Backend test failures.

## Directory map

| Path | Purpose |
| ---- | ------- |
| `src/server.ts` | API process entry point. |
| `src/config/` | Runtime configuration. |
| `src/lib/` | Shared backend utilities and infrastructure helpers. |
| `src/middleware/` | Express middleware, including auth / request safety concerns. |
| `src/modules/` | Domain modules such as auth, inventory, orders, POS, CRM, analytics, users, roles, and reports. |
| `src/types/` | Backend-local TypeScript types. |
| `src/__tests__/` | Backend integration or cross-module tests. |
| `prisma/schema.prisma` | Database schema source of truth. |
| `prisma/seed.ts` | Seed data for local/dev workflows. |

## Source-of-truth documents

| Need | Read |
| ---- | ---- |
| API contract | `../infrastructure/api/api_spec.md` |
| Database schema | `prisma/schema.prisma` |
| Architecture constraints | `../infrastructure/adr/` |
| Test strategy | `../infrastructure/standards/test_pyramid.md` |
| Agent route selection | `../../../docs/agents/navigation.md` from repo root |

## Common task routes

### Add or change a backend endpoint

1. Read `../infrastructure/api/api_spec.md`.
2. Open the nearest `src/modules/<domain>/` route/controller/service files.
3. Open the nearest tests for that module.
4. Update API spec and context if the contract meaning changes.

### Change persistence or model meaning

1. Read `prisma/schema.prisma`.
2. Open affected module services/repositories.
3. Check seed/migration impact.
4. Update context if model meaning, tenant boundaries, or source-of-truth assumptions change.

### Debug a backend test failure

1. Read the failing test file.
2. Open only the module files referenced by the failing test.
3. Use broader module inspection only after the local failure path is understood.

## Commands

Run from `systems/enterprise-admin/backend/`:

```bash
npm run test
npm run lint
npm run build
npm run db:generate
```

## Do not assume

- Do not infer feature completion from source code; read `../ROADMAP.md` for progress.
- Do not change tenant-sensitive behavior without checking auth / tenant constraints.
- Do not change schema meaning without checking `prisma/schema.prisma`, affected services, and context freshness.
