# Architecture Health Report — Enterprise Admin System

> Last refreshed: 2026-06-05
> Scope: `systems/enterprise-admin/` (`backend`, `admin-ui`, `pos-ui`, workspace CI/context)  
> Method: Roadmap A fresh audit from `docs/plans/2026-06-02-cloud-improvement-roadmaps.md`; command output and nearest source-of-truth inspection only.

---

## 2026-05-17 Arch-Fix Snapshot Status

The 2026-05-17 architecture-health report is now treated as a closed historical snapshot, not an active TODO list. Its Arch-Fix follow-up work has been completed in later ROADMAP phases, including analytics service decomposition, plan gating, POS UX hardening, deployment scaffolding, and context-routing improvements.

This document now tracks the current health snapshot from 2026-06-02 onward.

---

## 2026-06-02 Current Health Snapshot

### Verification Inventory

| Area | Existing local commands inspected |
| --- | --- |
| Workspace | `pnpm run dev`, `pnpm run build`, `pnpm run test`, `pnpm run lint`, `pnpm run agent:context` |
| Backend | `pnpm run build`, `pnpm run test`, `pnpm run test:coverage`, `pnpm run lint`, `pnpm run db:generate`, migration/seed/reset/studio commands |
| Admin UI | `pnpm run build`, `pnpm run test`, `pnpm run test:coverage`, `pnpm run lint`, Vite dev/preview commands |
| POS UI | `pnpm run build`, `pnpm run test`, `pnpm run test:e2e`, Playwright UI/report commands, Vite dev/preview commands |

### Verification Results

| Command | Result | Classification | Evidence |
| --- | --- | --- | --- |
| `./scripts/validate-agent-context.sh` | Pass | Context wiring healthy | `agent context validation passed.` |
| `cd systems/enterprise-admin && pnpm run agent:context` | Pass | Workspace context script healthy | Delegates to root validation and passed. |
| `cd systems/enterprise-admin/backend && pnpm run lint` | Pass | Backend lint clean | 0 errors, 0 warnings on 2026-06-05. |
| `cd systems/enterprise-admin/backend && pnpm run db:generate` | Pass | Backend Prisma generation healthy after dependency install parity was restored | Prisma Client v6.19.3 generated successfully on 2026-06-05. |
| `cd systems/enterprise-admin/backend && pnpm run build` | Pass | Backend strict TypeScript build healthy after Prisma Client generation | `tsc` completed successfully on 2026-06-05. |
| `cd systems/enterprise-admin/backend && pnpm run test` | Fail | DB-backed integration environment gap | 24 files / 137 tests passed; 19 integration tests were skipped after `api.integration.test.ts` failed to connect to PostgreSQL at `127.0.0.1:5433`. Docker was unavailable locally (`Cannot connect to the Docker daemon`). |
| `cd systems/enterprise-admin/admin-ui && pnpm run lint` | Pass | Admin UI lint healthy | No ESLint output. |
| `cd systems/enterprise-admin/admin-ui && pnpm run test` | Pass | Admin UI unit/render tests healthy | 2 files / 10 tests passed after focused admin page smoke tests were added. |
| `cd systems/enterprise-admin/admin-ui && pnpm run build` | Pass | Admin UI production build healthy | TypeScript + Vite build completed. |
| `cd systems/enterprise-admin/pos-ui && pnpm run build` | Pass | POS UI production build healthy | TypeScript + Vite build completed. |
| `cd systems/enterprise-admin/pos-ui && pnpm run test` | Pass | POS unit/component test boundary fixed | 22 files / 126 tests passed; Vitest now excludes Playwright `e2e/**` specs. |
| `cd systems/enterprise-admin/pos-ui && pnpm run test:e2e` | Fail | Environment gap | Playwright found 6 tests but Chromium executable was not installed in `/root/.cache/ms-playwright`. |

---

## P0 Findings — Release Blockers

### No confirmed P0 product regression found in this audit

The admin UI and POS UI production builds passed. Backend unit-style tests that do not require generated Prisma client or database access passed in the local audit. No verified security incident, data corruption path, or broken user-facing flow was confirmed from command output.

The backend build and non-DB test surface are verified. The remaining backend gap is DB-backed integration verification, which depends on local PostgreSQL availability.

---

## P1 Findings — Near-Term Engineering Risks

### P1-1: DB-backed backend tests still require a running local PostgreSQL

**Evidence:** On 2026-06-05, `pnpm run db:generate` and `pnpm run build` both passed after workspace dependency parity was restored. `pnpm run test` then advanced to 24 passing files / 137 passing tests, but `api.integration.test.ts` failed because PostgreSQL was not reachable at `127.0.0.1:5433`. Attempting `docker compose ps` failed because the local Docker daemon was not running.

**Likely owner area:** Backend / CI / dependency management.

**Classification:** Environment readiness gap. Backend build health is no longer blocked by Prisma generation in the current workspace, but DB-backed tests still require the ADR-007 local PostgreSQL workflow (`docker compose up -d postgres`) plus seeded data.

**2026-06-05 follow-up:** Start Docker locally, run `docker compose up -d postgres`, then run migrations/seed before rerunning the full backend test suite.

### P1-2: Backend warning-level type debt is cleared

**Evidence:** `pnpm run lint` passed with 0 warnings on 2026-06-05 after typed Prisma inputs replaced the remaining explicit `any` casts and unused parameters/imports were removed. `pnpm run build` also passed after Prisma Client was generated.

**Likely owner area:** Backend.

**Classification:** Resolved.

**Recommended follow-up:** Keep lint at 0 warnings; avoid broad type suppressions.

### P1-3: POS E2E verification depends on undeclared Playwright browser installation

**Evidence:** `pnpm run test:e2e` discovered 6 tests but failed before executing assertions because the Chromium headless shell was missing.

**Likely owner area:** POS UI / CI / developer environment.

**Classification:** Documented environment gap.

**2026-06-02 follow-up:** POS now exposes `pnpm run test:e2e:install` for Chromium installation, and the Playwright config plus test standards document that E2E still requires a running backend and seeded POS data before it becomes a default PR gate. In this cloud environment, Chromium download still returns 403 from the Playwright CDN, so runners need allowlisting or a pre-populated browser cache.

---

## P2 Findings — Maintenance and Observability Improvements

### P2-1: Backend dependency install parity should stay explicit

**Evidence:** The current workspace recovered Prisma and frontend native package availability by running `pnpm install --force`, after an earlier install had ignored build scripts and left optional/native packages incomplete.

**Likely owner area:** Workspace / CI / developer environment.

**Classification:** Environment reproducibility risk.

**Recommended follow-up:** Keep dependency install guidance explicit for fresh agents and CI workers: run `pnpm install`, then `backend pnpm run db:generate`; DB-backed tests additionally require Docker/PostgreSQL per ADR-007.

## Clean Areas Checked

- **Agent context routing:** Root validation and workspace `agent:context` both passed.
- **Admin UI build/lint/unit tests:** All checked commands passed.
- **POS UI production build:** TypeScript + Vite build passed.
- **POS UI unit/component test boundary:** Resolved 2026-06-02; Vitest now includes only `src/**/*.{test,spec}.{ts,tsx}` and excludes Playwright `e2e/**`.
- **Admin UI smoke coverage:** Improved 2026-06-02 with focused render smoke tests for Dashboard, Users, Roles, Margin, Cash Flow, and Sales Ranking pages.
- **Backend lint:** 0 errors and 0 warnings on 2026-06-05.
- **Backend build:** Prisma Client generation and strict TypeScript build passed on 2026-06-05.
- **Backend non-DB unit-style tests:** 24 files / 137 tests passed before DB-backed integration tests failed on local PostgreSQL availability.

---

## Follow-Up Placement

Active follow-up now belongs in `ROADMAP.md`:

1. Phase 14 tracks the 2026-06-03 architecture deepening candidates from `architecture-review-20260603-005952.html`.
2. Backend hardening should start Docker/PostgreSQL and seed data, then rerun the full backend integration suite.
3. POS E2E remains an environment/readiness item until runners have Playwright Chromium access or a pre-populated browser cache.
4. Shared UI library extraction is not active work; ADR-012 keeps `packages/ui/` deferred until cross-app primitive reuse is proven.
