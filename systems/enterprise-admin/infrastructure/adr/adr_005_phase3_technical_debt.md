# ADR-005: Phase 3 Technical Debt Assessment & Service Layer Standardization

- **Status**: Accepted
- **Date**: 2026-02-23
- **Authors**: AI Engineering Assistant + Technical Lead

---

## Context

After completing Phase 3 (CRM, Inventory & Suppliers, Operations Dashboard), we conducted a comprehensive code review retrospective. While all 14 ROADMAP items were successfully delivered with passing tests, we identified several recurring anti-patterns that, if left unaddressed, will compound as we enter Phase 4.

The codebase was developed under time pressure with a "ship fast, iterate later" approach. This ADR formally documents the discovered technical debt items and the architectural decisions we will enforce going forward.

---

## Findings: 6 Critical Improvement Areas

### 🔴 Severity: High

#### 1. Duplicate PrismaClient Instances
- **Problem**: Each service file (`crm.service.ts`, `inventory.service.ts`, `dashboard.service.ts`) creates its own `new PrismaClient()` instead of sharing the singleton from `lib/prisma.ts`.
- **Impact**: In production, this would exhaust database connection pools. Each instance opens its own connection pool (default 5 connections in Prisma), causing `P2024: Too Many Connections` errors under load.
- **Fix**: Import from `lib/prisma.ts` everywhere. Remove all `const prisma = new PrismaClient()` lines in service files.

#### 2. Excessive `any` Type Usage
- **Problem**: Service methods use `any` for Prisma instances, query parameters, and data payloads (e.g., `static async createSupplier(data: any)`). There are 15+ instances of `any` across 3 service files.
- **Impact**: Defeats TypeScript's compile-time safety. Typos in field names won't be caught until runtime. Impossible to refactor safely.
- **Fix**: Use Prisma's generated types (`Prisma.SupplierCreateInput`, `Prisma.ProductUpdateInput`, etc.) and define typed DTOs.

### 🟡 Severity: Medium

#### 3. Duplicated `AppError` Class
- **Problem**: An identical `AppError` class is copy-pasted in every service file instead of being a shared utility.
- **Impact**: Maintenance burden. If we add fields (e.g., `errorCode`, `details`), we must update 3+ files. The global `errorMiddleware` also doesn't correctly handle `errorCode` from thrown `AppError`s — it always returns `INTERNAL_ERROR`.
- **Fix**: Extract to `lib/errors.ts` with proper error code support and update `error.middleware.ts` to use it.

#### 4. Missing RBAC on Business Modules
- **Problem**: CRM, Inventory, and Dashboard routes use `authMiddleware` (JWT verification), but none enforce fine-grained permission checks (e.g., `customers:read`, `products:create`). The RBAC middleware built in Phase 1 is not applied.
- **Impact**: Any authenticated user (even `CONTENT_EDITOR`) can access all CRM data, modify inventory, and view financial KPIs. This violates the principle of least privilege.
- **Fix**: Apply `requirePermission('customers:read')` middleware to each route group.

### 🟢 Severity: Low (but worth tracking)

#### 5. Inconsistent Response Format
- **Problem**: Auth routes return `{ success: true, data: ... }`, but CRM/Inventory routes return `{ status: 'success', data: ... }`. The `api_spec.md` standard is `{ success: true }`.
- **Impact**: Frontend client must handle two different response formats. Confusing for new developers.
- **Fix**: Standardize all responses to `{ success: true/false }` format.

#### 6. No Frontend Data Caching / React Query
- **Problem**: Each page uses raw `useEffect` + `useState` for API calls with no caching, deduplication, or optimistic updates.
- **Impact**: Every page navigation re-fetches all data. No loading skeleton during refetch. No stale-while-revalidate strategy.
- **Fix**: Adopt `@tanstack/react-query` (TanStack Query) for declarative data fetching.

---

## Decision

We accept these findings as formal technical debt items. The prioritized remediation plan is:

| Priority | Item | Effort | When |
|----------|------|--------|------|
| P0 | Singleton PrismaClient | 15 min | Before Phase 4 |
| P0 | Shared AppError + ErrorMiddleware | 30 min | Before Phase 4 |
| P1 | RBAC enforcement on all routes | 30 min | Sprint 1 of Phase 4 |
| P1 | Eliminate `any` types | 45 min | Sprint 1 of Phase 4 |
| P2 | Standardize response format | 20 min | Sprint 1 of Phase 4 |
| P2 | Adopt TanStack Query | 1-2 hr | Sprint 2 of Phase 4 |

---

## Consequences

### Positive
- **Reliability**: Fixing the PrismaClient duplication prevents connection pool exhaustion in production.
- **Security**: RBAC enforcement closes the permission bypass vulnerability.
- **Developer Experience**: Eliminating `any` makes IDE autocompletion and refactoring safe.
- **Code Quality**: Shared `AppError` and response format reduce cognitive overhead for contributors.

### Negative
- **Churn**: Refactoring 3+ service files introduces risk of regression (mitigated by existing 35 passing tests).
- **Migration Cost**: Adopting TanStack Query requires rewriting all page-level data fetching hooks.

### Risks
- Seed script uses hardcoded IDs (`seed-supplier-1`) — must ensure `upsert` logic remains idempotent.
- `lowStock` filter in `inventory.service.ts` currently uses in-memory filtering (Prisma cannot compare two columns in `where`). May need raw SQL for large datasets.
