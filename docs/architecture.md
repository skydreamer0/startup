# System Architecture

## Overview

PharmaSaaS is a single-tenant-first, multi-tenant-ready SaaS for pharmacy operations.
Current deployment: one system (`enterprise-admin`). Future: add `pos` system in Phase 9.

## System Boundaries

```
┌─────────────────────────────────────────────────────────┐
│                      Browser                            │
│                                                         │
│  ┌──────────────────┐        ┌──────────────────────┐  │
│  │   Admin UI        │        │   POS UI (Phase 9)   │  │
│  │  React 19 + Vite  │        │   React 19 + Vite    │  │
│  │  Port 5173        │        │   Port 5174          │  │
│  └────────┬─────────┘        └──────────┬───────────┘  │
└───────────┼──────────────────────────────┼──────────────┘
            │ REST / JWT                   │ REST / JWT
            ▼                              ▼
┌─────────────────────────────────────────────────────────┐
│                   Backend API (Express 5)                │
│                        Port 3000                        │
│                                                         │
│   Auth  │  RBAC  │  CRM  │  Inventory  │  Analytics    │
│                                                         │
└─────────────────────────┬───────────────────────────────┘
                          │ Prisma ORM
                          ▼
                 ┌────────────────┐
                 │  PostgreSQL 15 │
                 │    Port 5433   │
                 └────────────────┘
```

## Data Flow: API Request

```
Client → JWT validation (auth.middleware)
       → Tenant injection (tenant.middleware)
       → Permission check (rbac.middleware)
       → Route handler (module controller)
       → Service layer (business logic)
       → Prisma (auto-scoped to tenant)
       → PostgreSQL
```

## Multi-Tenancy

Row-level isolation via Prisma extension (`lib/prisma.ts`).
Every query automatically filters by `tenantId` from the request context.
No data leaks between tenants by construction.

## Key Design Decisions

See `systems/enterprise-admin/infrastructure/adr/` for full ADR list.

| Decision | ADR | Choice |
|---|---|---|
| Database | ADR-001 | PostgreSQL |
| Auth | ADR-002 | Stateless JWT |
| Backend framework | ADR-003 | Express 5 |
| Multi-tenancy | ADR-006 | Row-level via Prisma extension |
| Shared UI boundary | ADR-012 | Defer `packages/ui` until cross-app primitive reuse is proven |

## Future Systems (Planned)

| System | Phase | Status |
|---|---|---|
| `systems/pos/` | Phase 9 | Not started |
| `packages/shared/` | Phase C | When 2+ systems share code |
