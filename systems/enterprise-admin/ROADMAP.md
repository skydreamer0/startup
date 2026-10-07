# Enterprise Admin Roadmap

> This is the live engineering roadmap for `systems/enterprise-admin`.
> Completed historical phase detail lives in git history, not in working-tree archive files.

## Current Status

The earlier product and architecture phases are complete. New single-pharmacy reliability and workflow requirements are active below; historical completion does not mean these issues or production acceptance gates are complete.

Use this file as the active status source of truth. Use ADRs, standards, health reports, and git history for historical evidence.

## Active Backlog

### Single-Pharmacy Reliability And Delivery

The engineering entry point is [#37](https://github.com/skydreamer0/startup/issues/37). It retains the complete acceptance criteria and consolidated receipt, outflow, evidence/OCR, printing, and deployment work from #32–#36. Consolidation is not completion.

- [ ] **PHARM-29**: [#29 — inventory authority and batch traceability](https://github.com/skydreamer0/startup/issues/29). Sale allocations, refund-only registration, reviewed metadata import and initial batch receipts have verified slices. Physical returns, bins, reversal/rebuild, reconciliation and full acceptance remain pending.
  - [x] Second 29A slice: POS and general orders share caller-owned transaction posting for product/batch debits, OUT movements and durable lot allocations. Order/batch detail exposes both trace directions; referenced zero-stock lots cannot be deleted. See ADR-014 and migration `20261006090000_sale_batch_allocations`.
  - Confirmed store policy: Asia/Taipei calendar date; expiry day is unusable. Released positive stock alone qualifies. Existing 30-day advance-warning horizon is retained with store-date boundaries; actionable frontend reminders remain #31 work.
  - 2026-10-06 evidence: full backend 26 files / 187 tests passed, including 31 real PostgreSQL stock cases (16 added in this slice); Prisma generation, build, lint and agent-context validation passed. Synthetic old-schema upgrade preserved product 9 / batch 4, quarantined the old lot, and created zero historical allocations. Preflight reports the discrepancy rather than fixing it silently.
  - Activation constraint: migration defaults old/unreviewed batches to quarantine; review/reconciliation is required before production use. No production migration, real-store G2, physical-return/bin/reversal or all-writer acceptance was performed.
  - [x] Third 29A slice: money-only refund registration no longer adds physical stock or creates IN movements. Conditional tenant-scoped status transition prevents two concurrent refunds; original discount reason is preserved. POS confirmation/toasts/reports describe refund registration (ADR-015).
  - 2026-10-06 refund evidence: 4 failures reproduced before correction; after correction full backend 26 files / 194 tests passed, including 38 real PostgreSQL stock/refund cases. POS unit suite 23 files / 135 tests and production build passed; Chromium E2E 6/6 passed, including checkout → receipt → refund with unchanged API stock. Physical-return receipt/quarantine/partial quantities/retry and financial command/provider execution remain pending.
  - [x] Fourth 29A slice: product Excel confirm is bound to a signed tenant/file-hash/normalized-revision preview. Master-data import preserves existing stock and starts new SKUs at zero; file changes and rejected confirmations require preview again (ADR-016).
  - 2026-10-06 import evidence: backend 27 files / 203 tests passed, including 9 new real PostgreSQL import cases and a sale committed between preview/confirm. Admin UI 6 files / 18 tests, lint and build passed. Actual Chromium admin upload → preview → confirm kept API stock 2 instead of importing file quantity 999. Product/batch editor authority, receipts, physical returns, bins/reversals and real-store G2 remain incomplete.
  - [x] Fifth 29A slice: initial batch receipt atomically increments product projection, creates the lot and records a linked IN movement with original cost. Product/batch quantity edits are rejected; CSV master-data import creates at zero. Batch routes use product catalogue permissions; the receipt form consumes product pages, submits a complete date and shows errors/inspection state (ADR-017).
  - 2026-10-06 receipt evidence: 8 failures reproduced before correction; backend 28 files / 218 tests and Admin UI 7 files / 21 tests passed, with 15 new real PostgreSQL receipt/API cases. Build/lint/Prisma generation passed; schema diff found no drift. Actual Chromium metadata create → receipt → trace → edit showed product 3 / lot 3 / IN 3 and zero page errors. After a real API process restart, receipt provenance and prior order↔lot sale trace remained readable. Synthetic legacy 9 / 4 stays unchanged with no invented receipt links. Production activation and physical-return/bin/reversal/rebuild acceptance remain pending.
- [ ] **PHARM-30**: [#30 — reliable checkout commands](https://github.com/skydreamer0/startup/issues/30). Durable command identity/result recovery, unique order numbers, exact money, and the complete PostgreSQL G1 gate remain pending.
  - Merged bounded command slice (ADR-018 / [PR #44](https://github.com/skydreamer0/startup/pull/44), master `12c415d` at 2026-10-06 13:19 UTC): tenant/kind/commandId claim, payload conflict and immutable original-result lookup share the sale transaction. POS persists a frozen identity/intent before POST, preserves unknown/conflict across refresh and checks the saved payload hash before confirming recovery. Known conflict cannot be downgraded or automatically confirmed by failed/successful queries. Backend 29 files / 239 tests; POS 25 files / 151 tests; synthetic recovery Chromium 8/8 and local synthetic-seeded real API flow 6/6 passed. Command-process crash/restart, rollback injection, RBAC, legacy upgrade evidence and raw UI execution logs are in `infrastructure/verification/checkout-command/README.md`. This does not close #30 or change production gates.
  - [Draft HTTP recovery follow-up #45](https://github.com/skydreamer0/startup/pull/45): real Chromium → committed checkout with lost response → owned API SIGKILL/new PID → same DB → refresh → GET or identical command/payload POST passed 2/2. Each independent synthetic fixture keeps one order/payment/OUT movement/allocation/command and product/lot 5→3; original order ID/number/JSON and frozen draft recovery match. Evidence, owned process/environment records, screenshots and raw logs are in `infrastructure/verification/checkout-command/http-restart/README.md`; latest CI and independent review remain tracked in the follow-up Draft. No application behavior, #29 inventory acceptance or production gate was changed; before-commit HTTP kill and broader #30/#31/#37 requirements remain pending.
  - First 29A/30A slice: POS and general-order product demand is aggregated and debited with tenant-scoped balance predicates in their existing transaction. POS duplicate lines share updated batch availability. See ADR-013 and `backend/src/__tests__/stock-contention.integration.test.ts`.
  - 2026-10-06 evidence: real PostgreSQL regressions reproduced 5 failures before the fix. After the fix, all 15 new DB regression cases and the full backend suite passed (26 files / 171 tests); backend Prisma generation, build, lint, and agent-context validation passed. UI E2E and the full G1/G2 gates were not run/completed by this slice.
  - The first slice did not change schema/contracts or batch authority; the second #29 slice above adds those sales-specific pieces. Command/money/adjustment/import acceptance is still incomplete. Keep #29/#30 open.
- [ ] **PHARM-31**: [#31 — batch/POS operation and frontend freshness](https://github.com/skydreamer0/startup/issues/31). Batch receipt permission/error/product-page/date issues are covered by the fifth #29 slice. Broader modal/touch operation, POS pagination/exact scans/freshness and actionable reports remain pending.
  - Draft #50A supplier envelope slice (2026-10-07): the existing Supplier[] response is typed/unwrapped once, then consumed directly by product options and supplier rows. Initial synthetic wire-fixture RED: 2 failed / 1 passed; error/visible-selection RED: 2 failed / 3 passed. Initial correction is focused 5/5 with TypeScript/Vite build and admin lint passed; successful-empty, 500/offline/refetch coverage and full admin checks are still pending at this checkpoint. Evidence: `infrastructure/verification/admin-suppliers/README.md`. Product pagination/#50B, backend wire contract, #53 scanner code, browser/real HTTP and broad #50/#31/G0 acceptance are unchanged/pending; no gate or parent checkbox is completed.
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
