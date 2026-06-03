# Architecture Health Report — Enterprise Admin System

> Last refreshed: 2026-06-02  
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
| `cd systems/enterprise-admin/backend && pnpm run lint` | Pass with warnings | Real technical-debt signal, not a blocker | 0 errors, 20 warnings, mostly explicit `any` and unused variables. |
| `cd systems/enterprise-admin/backend && pnpm run db:generate` | Fail | Environment / dependency-fetch gap | Prisma engine checksum and engine downloads from `binaries.prisma.sh` returned `403 Forbidden`. |
| `cd systems/enterprise-admin/backend && PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1 pnpm run db:generate` | Fail | Environment / dependency-fetch gap | Checksum was bypassed, but engine download itself still returned `403 Forbidden`. |
| `cd systems/enterprise-admin/backend && pnpm run build` | Fail | Inconclusive backend type health because generated Prisma client is absent | TypeScript cannot import `PrismaClient`/`Prisma`; additional strictness and portable Express-router type errors are visible and should be rechecked after Prisma generation succeeds. |
| `cd systems/enterprise-admin/backend && pnpm run test` | Fail | Test environment gap | 19 files / 124 tests passed; 3 integration suites exited because required env vars were absent. |
| `cd systems/enterprise-admin/backend && DATABASE_URL=... JWT_*... pnpm run test` | Fail | Environment gap after env parity improved | 19 files / 124 tests passed; the same 3 suites then failed because `.prisma/client/default` was missing. |
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

The backend remains only partially verified because Prisma generation was blocked by a dependency-fetch failure. That is tracked as P1 because the blocker is environment/verification parity, not confirmed broken product behavior.

---

## P1 Findings — Near-Term Engineering Risks

### P1-1: Backend build and DB-backed tests are blocked when Prisma engines cannot be fetched

**Evidence:** `pnpm run db:generate` failed on `binaries.prisma.sh` with `403 Forbidden`; retrying with `PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1` bypassed checksum validation but still failed to download the engine file. Backend build then could not import generated `PrismaClient`/`Prisma`, and DB-backed tests could not resolve `.prisma/client/default`.

**Likely owner area:** Backend / CI / dependency management.

**Classification:** Environment and CI-parity risk. CI may still pass if GitHub runners can reach Prisma binaries, but cloud/local workers cannot reliably verify backend build/test health without a cached engine or deterministic generation strategy.

**2026-06-02 follow-up:** CI now caches Prisma engines under `~/.cache/prisma`, and production/test standards document that first-time runners still need access to `binaries.prisma.sh` or a pre-populated cache. Backend build remains inconclusive in this local environment until Prisma generation can complete.

### P1-2: Backend strict TypeScript health is inconclusive and needs a clean Prisma-generated rerun

**Evidence:** The first backend build surfaced missing Prisma exports plus many strictness errors (`implicit any`, `unknown[]` to `string[]`) and portable Express route/app inference errors (`TS2742`). Some strictness errors can be cascading from the missing generated Prisma client; the Express router portability errors are likely independent and should be verified after `prisma generate` succeeds.

**Likely owner area:** Backend.

**Classification:** Potential real code health issue; blocked from final diagnosis by Prisma generation failure.

**Recommended follow-up:** Re-run `pnpm run db:generate && pnpm run build` in an environment with Prisma engine access. If `TS2742` remains, annotate Express `app`/`router` exports explicitly. If strictness errors remain, triage by module and avoid broad type suppressions.

### P1-3: POS E2E verification depends on undeclared Playwright browser installation

**Evidence:** `pnpm run test:e2e` discovered 6 tests but failed before executing assertions because the Chromium headless shell was missing.

**Likely owner area:** POS UI / CI / developer environment.

**Classification:** Documented environment gap.

**2026-06-02 follow-up:** POS now exposes `pnpm run test:e2e:install` for Chromium installation, and the Playwright config plus test standards document that E2E still requires a running backend and seeded POS data before it becomes a default PR gate. In this cloud environment, Chromium download still returns 403 from the Playwright CDN, so runners need allowlisting or a pre-populated browser cache.

---

## P2 Findings — Maintenance and Observability Improvements

### P2-1: Backend lint allows accumulating warning-level type debt

**Evidence:** Backend ESLint passed with 20 warnings, including explicit `any` usages and unused variables.

**Likely owner area:** Backend.

**Classification:** Maintenance debt, not a current blocker.

**Recommended follow-up:** Convert warnings into tracked cleanup issues by module. Consider tightening lint severity only after the current warning inventory is reduced.

## Clean Areas Checked

- **Agent context routing:** Root validation and workspace `agent:context` both passed.
- **Admin UI build/lint/unit tests:** All checked commands passed.
- **POS UI production build:** TypeScript + Vite build passed.
- **POS UI unit/component test boundary:** Resolved 2026-06-02; Vitest now includes only `src/**/*.{test,spec}.{ts,tsx}` and excludes Playwright `e2e/**`.
- **Admin UI smoke coverage:** Improved 2026-06-02 with focused render smoke tests for Dashboard, Users, Roles, Margin, Cash Flow, and Sales Ranking pages.
- **Backend lint hard failures:** No ESLint errors were reported.
- **Backend non-DB unit-style tests:** 19 files / 124 tests passed before DB/generated-client-dependent suites failed.

---

## Follow-Up Placement

Active follow-up now belongs in `ROADMAP.md`:

1. Phase 14 tracks the 2026-06-03 architecture deepening candidates from `architecture-review-20260603-005952.html`.
2. Backend hardening should re-run `pnpm run db:generate && pnpm run build` in an environment where Prisma engines can be generated, then fix any remaining non-cascading TypeScript errors.
3. POS E2E remains an environment/readiness item until runners have Playwright Chromium access or a pre-populated browser cache.
4. Shared UI library extraction is not active work; ADR-012 keeps `packages/ui/` deferred until cross-app primitive reuse is proven.
