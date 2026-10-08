# Architecture Health Report — Enterprise Admin System

> Last refreshed: 2026-10-08 (post-merge status/evidence reconciliation; historical audit results retained below)
> Scope: `systems/enterprise-admin/` (`backend`, `admin-ui`, `pos-ui`, workspace CI/context)  
> Method: GitHub PR/commit/run metadata, saved job logs and nearest source-of-truth documents for the current refresh; earlier audit methods and execution results retain their dated scope. This documentation refresh did not rerun application tests.

---

## 2026-10-08 Post-Merge Status Refresh

Current baseline: merged master [`dfe6b3bfaed6abd6e514eef9423b660bbaa898f3`](https://github.com/skydreamer0/startup/commit/dfe6b3bfaed6abd6e514eef9423b660bbaa898f3), tree `e1dfdd2228a94007cd3e9152eb386b6827aa6606`. All merge timestamps in this section are UTC. This is a status correction for [#52](https://github.com/skydreamer0/startup/issues/52), not a new product audit or release approval. [ROADMAP.md](ROADMAP.md) retains the active work and unchecked parent gates.

### ADR-018 And Checkout Recovery

[ADR-018 — Durable POS checkout command recovery](infrastructure/adr/adr_018_checkout_command_recovery.md) records tenant/kind/command identity, transactionally saved original results, payload-conflict handling and POS frozen-intent/hash-checked recovery. The bounded implementation merged via [#44](https://github.com/skydreamer0/startup/pull/44) on 2026-10-06 13:19:07 UTC as `12c415d5`; durable identity/result recovery is no longer wholly pending. The ADR's original Proposed/Draft status is retained as authoring-stage history, not the current PR state or a deployment approval.

The post-commit lost-response/HTTP-host restart follow-up [#45](https://github.com/skydreamer0/startup/pull/45) merged on 2026-10-06 17:49:56 UTC as `1f7eeb09`. Its accepted head `72eb4713` passed four-job [CI 37506102015](https://github.com/skydreamer0/startup/actions/runs/37506102015) and independent bounded review. Real Chromium → owned HTTP API → isolated PostgreSQL exercised GET and identical-payload resend after SIGKILL/new PID, 2/2 passed; each fixture retained one order/payment/OUT/allocation/command and product/lot 5→3. [Original reproduction/evidence](infrastructure/verification/checkout-command/http-restart/README.md) remains unchanged.

Unique order numbers, business date, exact money, historical costs/refund reconciliation, before-commit HTTP kill, multi-tab/full offline behavior and complete #30/G1 acceptance remain pending. Neither #44 nor #45 establishes in-store deployment or real-store inventory acceptance.

### Other Merged Slices And Their Limits

| Slice | Verified merged state | Evidence boundary |
| --- | --- | --- |
| Scanner safety / suppliers / product pagination | [#53](https://github.com/skydreamer0/startup/pull/53), [#54](https://github.com/skydreamer0/startup/pull/54), [#55](https://github.com/skydreamer0/startup/pull/55) and [#56](https://github.com/skydreamer0/startup/pull/56) merged on 2026-10-07; per-slice timestamps and runs are in ROADMAP. Their Draft/pending-review descriptions in original evidence are historical. | Supplier/scanner bounded browser evidence uses intercepted synthetic HTTP. #55's original 253-pass run includes 8 real PostgreSQL pagination cases; later ordinary CI reports those 8 as skipped. #56 product-pagination evidence is component/JSDOM and synthetic HTTP, not browser/real-HTTP business acceptance. |
| Dependency/lock maintenance | [#61](https://github.com/skydreamer0/startup/pull/61) merged 2026-10-07 07:10:03 UTC as `a8de4233`; four-job [post-merge CI 37585682248](https://github.com/skydreamer0/startup/actions/runs/37585682248) passed. | Backend standalone npm; frontend/shared pnpm; three Docker images and locked Prisma CLI smoke passed. See [dependency standard](infrastructure/standards/dependency_management.md); historical pnpm backend commands below describe earlier environments. |
| Fixed-subject browser evidence/provenance | [#66](https://github.com/skydreamer0/startup/pull/66) merged 2026-10-08 04:51:47 UTC as `772289d6`. [#59](https://github.com/skydreamer0/startup/pull/59) and [#65](https://github.com/skydreamer0/startup/pull/65) closed as covered, without separate merges. | Exact head `fa967309` / tree `d93c35ec30fac4fbf7ec3232711f006660dbcf3b`: Node22 [CI 37729148349](https://github.com/skydreamer0/startup/actions/runs/37729148349), four jobs passed. Independent bounded review checked the downloaded 41-file artifact, 40 entry hashes, 13 passed cases, 19 PNGs and 13 clean network records. Immutable historical scanner/supplier subjects remain pinned; this is not latest-master integrated app E2E. |
| Argon2 compatibility integration | [#67](https://github.com/skydreamer0/startup/pull/67) merged 2026-10-08 13:46:45 UTC as `dfe6b3bf`, preserving #66. [#62](https://github.com/skydreamer0/startup/pull/62) is closed/merged; [#64](https://github.com/skydreamer0/startup/pull/64) closed as covered, not separately merged. | Current final-image evidence below supersedes only the earlier local-runtime not-run limitation. All accounts, stock and databases used by the harness are isolated synthetic fixtures. |

### Current Integration Evidence

- [Alpine run 37785360555](https://github.com/skydreamer0/startup/actions/runs/37785360555) checked out feature head `44f8863895ac7577853988b91cfe4609e387619f`, tree `e1dfdd2228a94007cd3e9152eb386b6827aa6606`. Nine baseline checks passed, both mutation controls were rejected, and all 14 named HTTP/PostgreSQL/JWT/stock/refund scenarios passed in the same final image `sha256:d0a9365de22f6c3c22cfba6f857d978685b2a4b26fce230f3eae225b20793912` (Node 22.23.3 / Alpine / argon2 0.45.1 / PostgreSQL 15.19). Stock remained 5→3→3 across sale/refund. The 9 baseline checks use synthetic persistence/JWT; the 14-scenario bridge uses real HTTP, PostgreSQL and signed JWT with synthetic users/data. [Harness scope and reproduction](backend/scripts/argon2-compat/README.md).
- [Artifact 11553444214](https://github.com/skydreamer0/startup/actions/runs/37785360555/artifacts/11553444214): 10,824-byte ZIP, SHA256 `84df5b7dfa325d2fdaacc833ec06c0f1d76c77986caece9e195969fa79fa5903`, 15 files. #67 records independent final acceptance of the downloaded artifact, all 10 input hashes, runtime/image identities and 9+2+14 outcomes. This refresh reads that acceptance and job logs; it does not claim a new artifact download or runtime rerun.
- [Ordinary CI 37785360881](https://github.com/skydreamer0/startup/actions/runs/37785360881) passed Agent Context Validation, Backend CI, Admin UI CI and POS UI CI. Its actual checkout was synthetic PR merge `9075a52b2ef7cc72a0d68f0e61cae3059247c31c`, whose GitHub tree equals the feature and merged-master tree above. Raw job logs report Backend **245 passed / 8 skipped**, Admin **67 passed**, POS **193 passed**, and real HTTP restart/lost-response **2 passed**. The 8 skips are existing opt-in `products-pagination.integration.test.ts` cases, not 8 new real-PostgreSQL passes or failures; the original #55 native evidence stays separate.
- [Post-merge master CI 37787070678](https://github.com/skydreamer0/startup/actions/runs/37787070678) passed the same four jobs for `dfe6b3bf`; its Backend log again reports 245 passed / 8 opt-in skipped. This confirms CI on merged master, without expanding the Alpine or fixed-subject browser evidence scopes.

### Still Open / Reading Historical Evidence

Physical returns/quarantine/partial quantities, bins/reversal/rebuild and real-store reconciliation remain incomplete. [#48 exact lookup](https://github.com/skydreamer0/startup/issues/48), [#49 POS freshness](https://github.com/skydreamer0/startup/issues/49), broader #31 workflows and #37 delivery/deployment gates remain open. Production fail-fast/readiness, backup/restore and final-host acceptance are still required. Merged code, Docker builds and isolated synthetic checks are not evidence of in-store deployment, physical scanner validation, provider payments or complete G0–G7 acceptance.

Everything below is retained historical evidence, including original failures, RED/GREEN counts and old environment limitations. Words such as “current”, “latest” or “pending” inside those dated sections refer to that checkpoint; use this refresh and ROADMAP for today's state. Original ADR/evidence files and raw logs are not rewritten by this status correction.

---

## 2026-10-06 Sales Stock Refresh

The second #29 slice now shares eligible batch posting between POS and general
orders and persists actual allocations (ADR-014). The latest local full backend
suite passed 26 files / 187 tests, including 31 real PostgreSQL stock cases.
Prisma generation, build and lint passed. A synthetic seven-migration upgrade
preserved a 9 / 4 legacy discrepancy, quarantined the old lot, and left the old
order untraceable with zero fabricated allocations. The read-only preflight
reports that difference. Existing/unreviewed lots require review before release;
there was no production data migration or complete G1/G2/G4 acceptance. Refunds,
other writer cutover, commands and monetary correctness remain active work.

The following table records the first slice's earlier evidence:

The subsequent ADR-015 refund correction reproduced 4 failures before the fix
and passed the full backend 194 tests afterward (38 real DB stock/refund cases).
POS unit/render tests passed 23 files / 135 tests and production build passed.
Chromium E2E passed 6/6, including actual checkout/receipt/refund registration
with unchanged product stock. Refund registration no longer receives physical
goods; partial return/quarantine/release and financial command execution are
still pending.

ADR-016 now binds product-import confirmation to signed tenant/file/normalized
preview identity and prevents master-data imports from changing physical stock.
Latest backend suite: 27 files / 203 tests passed, including 9 real PostgreSQL
import cases. Admin UI: 6 files / 18 tests, lint and build passed. A real Chromium
admin upload/preview/confirm smoke kept API stock 2 when the file requested 999;
unknown opening lots were not invented. Existing product/batch editor writers,
receipt/return posting and full reconciliation still need cutover.

ADR-017 initial receipts now share the product lock and transaction for aggregate,
lot and IN movement writes, with durable lot/cost provenance. Direct product/lot
quantity edits are rejected, and CSV creates at zero. Eight failures were reproduced;
full backend 28 files / 218 tests and Admin UI 7 files / 21 tests passed, including
15 new real DB receipt/API cases. Build/lint/generation passed; migration/schema
diff found no drift. Actual Chromium create/receipt/trace/edit conserved 3 / 3 / 3
with no page errors. Receipt and prior sale provenance survived a real API process
restart. The synthetic legacy 9 / 4 discrepancy remains unchanged; physical
return, bin/reversal/rebuild and production reconciliation are still incomplete.
The first #29/#30 slice repairs aggregate duplicate demand and competing POS/general-order product debits. PostgreSQL tests synchronized real reads and reproduced 5 failures before the fix, including two buyers of the last unit and a negative batch balance. ADR-013 records the transaction boundary and its limits.

| Check | Result | Evidence / scope |
| --- | --- | --- |
| Backend Prisma generation | Passed | npm/CI install path, Prisma Client 6.19.2 |
| Backend build | Passed | `npm run build` |
| Backend lint | Passed | `npm run lint`, no errors or warnings |
| Backend full suite | Passed | `npm test`: 26 files / 171 tests, including 15 new real PostgreSQL regression cases |
| Agent context | Passed | `./scripts/validate-agent-context.sh` |
| UI/E2E and complete G1/G2 acceptance | Not run / incomplete | No claim of full command, allocation, monetary, all-writer or production acceptance |

Tests used an isolated PostgreSQL 15 container/database at localhost:5544, migrations and synthetic fixtures. The latest sales slice resolves eligible batch debits/allocations for both sale writers; other authority, refund, command and money requirements remain. Consult the current ROADMAP and #37 rather than treating historical closed findings below as release acceptance.

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

### 2026-06-14 Verification Refresh

| Command | Result | Classification | Evidence |
| --- | --- | --- | --- |
| `cd systems/enterprise-admin/backend && pnpm run db:generate` | Pass | Backend Prisma generation verified locally | Prisma Client v6.19.3 generated successfully after Docker Desktop / repo Postgres were available. |
| `cd systems/enterprise-admin/backend && pnpm run build` | Pass | Backend TypeScript build verified | `tsc` completed with exit 0. |
| `cd systems/enterprise-admin/backend && pnpm run test` | Pass | Backend DB-backed tests verified locally | 23 files / 151 tests passed after `docker compose up -d postgres`, `pnpm prisma migrate deploy`, and `pnpm run db:seed`. |
| `cd systems/enterprise-admin/pos-ui && pnpm run test:e2e:install` | Pass | Playwright browser availability verified locally | `playwright install chromium` completed with exit 0. |
| `cd systems/enterprise-admin/pos-ui && pnpm run test:e2e` | Pass | POS E2E verified locally | 6 Playwright tests passed with backend and POS dev servers running against seeded Postgres. |
| `cd systems/enterprise-admin/backend && pnpm run lint` | Pass with warnings | Maintenance debt now scoped by module | 0 errors, 12 warnings, all `@typescript-eslint/no-explicit-any`; unused warning debt was removed and the remaining inventory was converted into `ROADMAP.md` MAINT-02 through MAINT-04. |

### 2026-06-21 Maintenance Refresh

| Command | Result | Classification | Evidence |
| --- | --- | --- | --- |
| `cd systems/enterprise-admin/backend && pnpm run lint` | Pass | Backend lint clean | ESLint completed with 0 errors and 0 warnings. |
| `cd systems/enterprise-admin/backend && rg -n "@typescript-eslint/no-explicit-any|\bany\b|as any|: any|<any>" src` | Pass | Explicit-`any` cleanup verified | Search found only prose uses of "any" in accounting provider comments, not TypeScript `any` types or casts. |

---

## P0 Findings — Release Blockers

### No confirmed P0 product regression found in this audit

The admin UI and POS UI production builds passed. Backend unit-style tests that do not require generated Prisma client or database access passed in the local audit. No verified security incident, data corruption path, or broken user-facing flow was confirmed from command output.

The backend build and non-DB test surface are verified. The remaining backend gap is DB-backed integration verification, which depends on local PostgreSQL availability.

---

## P1 Findings — Near-Term Engineering Risks

### P1-1: DB-backed backend tests still require a running local PostgreSQL

**Evidence:** On 2026-06-05, `pnpm run db:generate` and `pnpm run build` both passed after workspace dependency parity was restored. `pnpm run test` then advanced to 24 passing files / 137 passing tests, but `api.integration.test.ts` failed because PostgreSQL was not reachable at `127.0.0.1:5433`. Attempting `docker compose ps` failed because the local Docker daemon was not running.

**2026-06-14 status:** Closed for the current local runner. Prisma generation, backend build, and DB-backed tests passed after Docker Desktop / repo Postgres were available.

**2026-06-14 status:** Closed for the current local runner. Prisma generation, backend build, and DB-backed tests passed after Docker Desktop / repo Postgres were available.

**Likely owner area:** Backend / CI / dependency management.

**Classification:** Environment readiness gap. Backend build health is no longer blocked by Prisma generation in the current workspace, but DB-backed tests still require the ADR-007 local PostgreSQL workflow (`docker compose up -d postgres`) plus seeded data.

**2026-06-05 follow-up:** Start Docker locally, run `docker compose up -d postgres`, then run migrations/seed before rerunning the full backend test suite.

### P1-2: Backend warning-level type debt is cleared

**Evidence:** `pnpm run lint` passed with 0 warnings on 2026-06-05 after typed Prisma inputs replaced the remaining explicit `any` casts and unused parameters/imports were removed. `pnpm run build` also passed after Prisma Client was generated.

**2026-06-14 status:** Closed for the current local runner. A clean Prisma-generated backend build passed.

**2026-06-14 status:** Closed for the current local runner. A clean Prisma-generated backend build passed.

**Likely owner area:** Backend.

**Classification:** Resolved.

**Recommended follow-up:** Keep lint at 0 warnings; avoid broad type suppressions.

### P1-3: POS E2E verification depends on undeclared Playwright browser installation

**Evidence:** `pnpm run test:e2e` discovered 6 tests but failed before executing assertions because the Chromium headless shell was missing.

**Likely owner area:** POS UI / CI / developer environment.

**Classification:** Documented environment gap.

**2026-06-02 follow-up:** POS now exposes `pnpm run test:e2e:install` for Chromium installation, and the Playwright config plus test standards document that E2E still requires a running backend and seeded POS data before it becomes a default PR gate. In this cloud environment, Chromium download still returns 403 from the Playwright CDN, so runners need allowlisting or a pre-populated browser cache.

**2026-06-14 status:** Closed for the current local runner. `pnpm run test:e2e:install` and `pnpm run test:e2e` passed after the POS E2E harness was aligned with seeded staff code `A001`, isolated open-shift state between tests, and seed data created product batches for POS checkout stock.

---

## P2 Findings — Maintenance and Observability Improvements

### P2-1: Backend dependency install parity should stay explicit

**Evidence:** The current workspace recovered Prisma and frontend native package availability by running `pnpm install --force`, after an earlier install had ignored build scripts and left optional/native packages incomplete.

**Likely owner area:** Workspace / CI / developer environment.

**Classification:** Environment reproducibility risk.

**Recommended follow-up:** Keep dependency install guidance explicit for fresh agents and CI workers: run `pnpm install`, then `backend pnpm run db:generate`; DB-backed tests additionally require Docker/PostgreSQL per ADR-007.

### P2-2: Backend explicit-`any` cleanup is closed

**Evidence:** On 2026-06-14, backend ESLint reported 0 errors and 12 warnings, all `@typescript-eslint/no-explicit-any`.

**2026-06-14 status:** Triaged. Backend ESLint now reports 0 errors and 12 warnings, all explicit `any`. Remaining ownership is tracked in `ROADMAP.md` MAINT-02 through MAINT-04.

**2026-06-21 status:** Closed. Backend ESLint now reports 0 errors and 0 warnings, and a targeted explicit-`any` search found no remaining TypeScript `any` types or casts in `src/`.

**Likely owner area:** Backend.

**Classification:** Resolved.

**Recommended follow-up:** Keep lint at 0 warnings; avoid reintroducing broad `any` types or casts.

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
2. Backend lint explicit-`any` cleanup has been closed in `ROADMAP.md` MAINT-02 through MAINT-04.
3. Shared UI library extraction is not active work; ADR-012 keeps `packages/ui/` deferred until cross-app primitive reuse is proven.
