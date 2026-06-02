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
- [ ] `npm test` passes locally (backend)
- [ ] Manual smoke test of affected UI screens
- [ ] N/A — docs / config only

Steps to reproduce / verify:
1. ...

## Required Checklist
<!--
Authors MUST tick every box before requesting review. Reviewers MUST block
the PR if any are unticked.
-->
- [ ] **Lint & Format**: `npm run lint` is green locally
- [ ] **CI Pass**: GitHub Actions pipeline is green
- [ ] **Conventional Commits**: Each commit follows `type(scope): message`
- [ ] **No `as any`**: Type assertions limited to `lib/prisma.ts` Prisma Extension
- [ ] **Tenant safety**: Any new service method calls `requireTenantId()`
- [ ] **Error handling**: Controllers use `next(err)`; no ad-hoc `res.status(500)`
- [ ] **ROADMAP updated** (if applicable) — items checked off in `systems/enterprise-admin/ROADMAP.md`
- [ ] **ADR added** (if architectural change) — new file under `systems/enterprise-admin/infrastructure/adr/`
- [ ] **Architecture docs**: `infrastructure/` updated for schema / contract changes
- [ ] **AI context freshness**: updated `AGENTS.md`, `CONTEXT-MAP.md`, system `CONTEXT.md`, `docs/agents/navigation.md`, or standards when workflow / routing / source-of-truth changed
- [ ] **No fake data**: UI reads from real API endpoints (no hardcoded percentages)

## Reviewer Focus
<!-- Highlight files / risks you want extra eyes on. -->

## Screenshots / Video (UI changes only)
<!-- Attach before/after screenshots or a short clip. -->
