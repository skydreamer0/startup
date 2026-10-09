<!--
Pull Request Template — PharmaSaaS / enterprise-admin
See: systems/enterprise-admin/infrastructure/standards/git_workflow.md
-->

## Summary
<!-- Why is this change needed? What does it do? 1–3 sentences. -->

Fixes # (issue)

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Refactor / technical debt
- [ ] Breaking change
- [ ] Docs only

## Test Plan
<!-- How did you verify this change? Mark all that apply and add details. -->
- [ ] Unit / integration tests added or updated
- [ ] Backend: `npm --prefix backend test` passes (from `systems/enterprise-admin`)
- [ ] Admin UI: `pnpm --filter admin-ui run test` passes
- [ ] POS UI: `pnpm --filter pos-ui run test` passes
- [ ] Manual smoke test of affected UI screens
- [ ] N/A — documentation-only, with no executable behavior change (explain below)

Source head / execution commit and CI run links:

Steps to reproduce / verify:
1. ...

Coverage limits / FAIL / BLOCKED / NOT RUN (including browser, native DB, and devices):
- ...

## Required Checklist
<!--
Authors must account for every item before declaring the PR ready. Tick a box
only after checking it; for a conditional item outside the change scope, write
N/A and explain why. Missing tools or blocked/unrun verification are not N/A.
Reviewers must block readiness for unmet applicable requirements. Draft review
can begin earlier, with outstanding gates stated explicitly.
-->
- [ ] **Lint, Format & Types**: affected packages pass their configured checks; commands and results are recorded (backend npm; frontend pnpm). POS has no lint script: record its build/type-check separately
- [ ] **CI Pass**: all current pipeline jobs and applicable security checks pass for this PR head; required checks are still satisfied (see `systems/enterprise-admin/infrastructure/standards/test_pyramid.md`)
- [ ] **Conventional Commits**: Each commit follows `type(scope): message`
- [ ] **No `as any`**: Type assertions limited to `lib/prisma.ts` Prisma Extension
- [ ] **Tenant safety** (backend service changes): Any new service method calls `requireTenantId()`
- [ ] **Error handling** (controller changes): Controllers use `next(err)`; no ad-hoc `res.status(500)`
- [ ] **ROADMAP updated** (if applicable) — completed acceptance scope checked off in `systems/enterprise-admin/ROADMAP.md`; remaining gates stay explicit
- [ ] **ADR added** (if architectural change) — new file under `systems/enterprise-admin/infrastructure/adr/`
- [ ] **Architecture docs** (schema / contract changes): `systems/enterprise-admin/infrastructure/` updated
- [ ] **AI context freshness** (workflow / routing / source-of-truth changes): updated `AGENTS.md`, `CONTEXT-MAP.md`, system `CONTEXT.md`, `docs/agents/navigation.md`, or standards when workflow / routing / source-of-truth changed
- [ ] **No fake data** (production UI): UI reads from real API endpoints (no hardcoded percentages); isolated synthetic test fixtures are identified as such

## Reviewer Focus
<!-- Highlight files / risks you want extra eyes on. -->

## Screenshots / Video (UI changes only)
<!-- Attach before/after screenshots or a short clip. -->
