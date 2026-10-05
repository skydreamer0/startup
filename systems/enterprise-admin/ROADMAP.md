# Enterprise Admin Roadmap

> This is the live engineering roadmap for `systems/enterprise-admin`.
> Completed historical phase detail lives in git history, not in working-tree archive files.

## Current Status

The earlier product and architecture phases are complete. New single-pharmacy reliability and workflow requirements are active below; historical completion does not mean these issues or production acceptance gates are complete.

Use this file as the active status source of truth. Use ADRs, standards, health reports, and git history for historical evidence.

## Active Backlog

### Single-Pharmacy Reliability And Delivery

The engineering entry point is [#37](https://github.com/skydreamer0/startup/issues/37). It retains the complete acceptance criteria and consolidated receipt, outflow, evidence/OCR, printing, and deployment work from #32–#36. Consolidation is not completion.

- [ ] **PHARM-29**: [#29 — inventory authority and batch traceability](https://github.com/skydreamer0/startup/issues/29). Common posting, eligible FEFO, durable allocations, refund/physical-return separation, reconciliation, and all-writer cutover remain pending.
- [ ] **PHARM-30**: [#30 — reliable checkout commands](https://github.com/skydreamer0/startup/issues/30). Durable command identity/result recovery, unique order numbers, exact money, and the complete PostgreSQL G1 gate remain pending.
  - First 29A/30A slice: POS and general-order product demand is aggregated and debited with tenant-scoped balance predicates in their existing transaction. POS duplicate lines share updated batch availability. See ADR-013 and `backend/src/__tests__/stock-contention.integration.test.ts`.
  - 2026-10-06 evidence: real PostgreSQL regressions reproduced 5 failures before the fix. After the fix, all 15 new DB regression cases and the full backend suite passed (26 files / 171 tests); backend Prisma generation, build, lint, and agent-context validation passed. UI E2E and the full G1/G2 gates were not run/completed by this slice.
  - This slice does not add a schema or API contract version, persist allocations, exclude expired batches, reconcile general-order batches, or complete command/money/adjustment/import acceptance. Keep #29/#30 open.
- [ ] **PHARM-31**: [#31 — batch/POS operation and frontend freshness](https://github.com/skydreamer0/startup/issues/31). Permission/error states, paginated product contracts, modal interaction, exact scans, and stock refresh remain pending.
- [ ] **PHARM-36**: Production fail-fast, DB readiness, backup/restore and final-host verification remain P0 prerequisites, tracked in the consolidated [#37 deployment backlog](https://github.com/skydreamer0/startup/issues/37) with the full original #36 criteria preserved.

Only record passed/failed/not-run evidence for the implemented slice. A passing CI or partial fix does not complete G0–G7 or close its parent issue.

### Verification And Environment Parity

- [x] **VERIFY-01**: Re-run backend Prisma generation, backend build, and DB-backed tests in an environment that can fetch or provide Prisma engines.
  - Source: `ARCHITECTURE_HEALTH.md` P1-1 / P1-2.
  - Suggested command path: `cd systems/enterprise-admin/backend && pnpm run db:generate && pnpm run build && pnpm run test`.
  - Completion evidence: 2026-06-14 local rerun passed `pnpm run db:generate`, `pnpm run build`, and `pnpm run test` after starting the repo Postgres container, applying migrations, and seeding the DB.

- [x] **VERIFY-02**: Make POS Playwright E2E browser availability deterministic for local/cloud runners.
  - Source: `ARCHITECTURE_HEALTH.md` P1-3 and `infrastructure/standards/test_pyramid.md`.
  - Suggested command path: `cd systems/enterprise-admin/pos-ui && pnpm run test:e2e:install && pnpm run test:e2e`.
  - Completion evidence: 2026-06-14 local rerun passed `pnpm run test:e2e:install` and `pnpm run test:e2e` with backend and POS dev servers running against seeded Postgres. Seed data now includes POS staff code `A001` and product batches aligned with POS checkout stock.

### Maintenance

- [x] **MAINT-01**: Triage backend ESLint warning-level type debt by module.
  - Source: `ARCHITECTURE_HEALTH.md` P2-1.
  - Completion evidence: 2026-06-14 backend lint warning inventory was reduced from 17 to 12 by removing unused warning debt; remaining explicit-`any` warnings were converted into scoped cleanup items below.

- [x] **MAINT-02**: Replace JWT/auth explicit `any` usage with typed JWT payload and request-body shapes.
  - Source: `pnpm run lint` warnings in `backend/src/lib/jwt.ts` and `backend/src/modules/auth/auth.controller.ts`.
  - Completion evidence: 2026-06-21 local rerun found no explicit-`any` lint warnings in the auth/JWT files, and backend `pnpm run lint` passed cleanly.

- [x] **MAINT-03**: Replace expenses/reporting explicit `any` usage with Prisma-derived or local DTO result types.
  - Source: `pnpm run lint` warnings in `backend/src/modules/expenses/**`, `backend/src/modules/reports/reports.controller.ts`, and `backend/src/modules/reports/sales-ranking.service.ts`.
  - Completion evidence: 2026-06-21 local rerun found no explicit-`any` lint warnings in expenses/reporting files, and backend `pnpm run lint` passed cleanly.

- [x] **MAINT-04**: Replace users service explicit `any` payloads with typed Prisma update/create inputs.
  - Source: `pnpm run lint` warnings in `backend/src/modules/users/users.service.ts`.
  - Completion evidence: 2026-06-21 local rerun found no explicit-`any` lint warnings in users service, and backend `pnpm run lint` passed cleanly.

## Deferred Decisions

- **Shared UI package**: Do not create `packages/ui/` yet. ADR-012 keeps shared UI extraction deferred until at least three primitives are genuinely reused by both `admin-ui` and `pos-ui` with the same semantic API.
- **Real accounting SDK integration**: QuickBooks/Xero live OAuth and SDK work remains deferred by ADR-009. Current INT-03 status is adapter scaffold + mock provider.
- **TLS/certbot production wiring**: Deployment scaffolding is present, but final TLS setup waits for host and DNS decisions per ADR-011 and `infrastructure/standards/production_runbook.md`.
- **Electronic invoice integration**: POS electronic invoice API remains indefinitely deferred from Phase 9.

## Completed History

Detailed completed execution plans are not kept in the active working tree. If historical implementation detail is needed, use git history around the commit that completed the work instead of reopening deleted plan files.

- `ARCHITECTURE_HEALTH.md` — current architecture health snapshot and verification gaps.
- `infrastructure/adr/` — durable architecture decisions.

## Update Rules

1. Add only active, decision-relevant work to **Active Backlog**.
2. Remove completed execution plans from the working tree unless they are promoted into a durable ADR, standard, or source-of-truth context file.
3. Keep completed implementation detail in git history instead of expanding this file into a historical transcript.
4. Update this file in the same PR when feature status changes.
5. Run `./scripts/validate-agent-context.sh` after context-related edits.
