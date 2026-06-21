# Enterprise Admin Roadmap

> This is the live engineering roadmap for `systems/enterprise-admin`.
> Completed historical phase detail lives in git history, not in working-tree archive files.

## Current Status

`enterprise-admin` is feature-complete through the last planned product and architecture phases. The admin UI, POS UI, backend, deployment scaffolding, agent context routing, and POS-led frontend convergence work are all treated as completed unless a new roadmap item below says otherwise.

Use this file as the active status source of truth. Use ADRs, standards, health reports, and git history for historical evidence.

## Active Backlog

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

- [ ] **MAINT-02**: Replace JWT/auth explicit `any` usage with typed JWT payload and request-body shapes.
  - Source: `pnpm run lint` warnings in `backend/src/lib/jwt.ts` and `backend/src/modules/auth/auth.controller.ts`.
  - Completion evidence: auth/JWT files no longer emit `@typescript-eslint/no-explicit-any` warnings and auth tests/build still pass.

- [ ] **MAINT-03**: Replace expenses/reporting explicit `any` usage with Prisma-derived or local DTO result types.
  - Source: `pnpm run lint` warnings in `backend/src/modules/expenses/**`, `backend/src/modules/reports/reports.controller.ts`, and `backend/src/modules/reports/sales-ranking.service.ts`.
  - Completion evidence: expenses/reporting files no longer emit `@typescript-eslint/no-explicit-any` warnings and reporting/expense tests or backend build still pass.

- [ ] **MAINT-04**: Replace users service explicit `any` payloads with typed Prisma update/create inputs.
  - Source: `pnpm run lint` warnings in `backend/src/modules/users/users.service.ts`.
  - Completion evidence: users service no longer emits `@typescript-eslint/no-explicit-any` warnings and user integration tests/build still pass.

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
