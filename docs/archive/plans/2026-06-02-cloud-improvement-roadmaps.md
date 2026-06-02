# Cloud Improvement Roadmaps

Date: 2026-06-02
Status: Archived after Phase 13 execution
Scope: New post-Arch-Fix improvement work for `systems/enterprise-admin`

> **Completion note (2026-06-02):** Phase 13 CLOUD-01 through CLOUD-04 are complete in `systems/enterprise-admin/ROADMAP.md`. Roadmap D completed by ADR-012, which documents that `packages/ui/` is deferred until cross-app primitive reuse is proven. The detailed task checklists below remain as the original cloud-worker execution template.

> **For cloud agentic workers:** Cloud workers may not have access to local Codex skill metadata. Treat the skill list below as required operating instructions. If a named skill is unavailable, follow the fallback workflow written beside it.

---

## Required Skills For Cloud Execution

Use these skills before starting any implementation:

| Skill | When to use | Fallback if unavailable |
| --- | --- | --- |
| `superpowers:using-git-worktrees` | Before implementation work starts. Create an isolated branch/worktree for the chosen roadmap. | Create a short-lived branch from current `main`/default branch. Do not work directly on `main` unless explicitly approved. |
| `superpowers:subagent-driven-development` | Preferred for roadmaps with independent tasks, especially audits or UI redesign slices. | Use `superpowers:executing-plans` style: execute one task at a time with checklist tracking and review checkpoints. |
| `superpowers:executing-plans` | Use when implementing this plan inline in one session. | Read the whole roadmap, create a todo list, execute tasks exactly, stop on blockers, verify before moving on. |
| `superpowers:test-driven-development` | Use for bug fixes, new behavioral tests, API changes, shared type changes, or UI logic changes. | Write the failing test first, run it to confirm failure, implement the minimum fix, rerun the focused test, then run the relevant regression suite. |
| `superpowers:verification-before-completion` | Use before claiming any task is done, before committing, before opening a PR. | Run the exact verification commands listed for the task and report the command plus result. No success claim without fresh command output. |
| `superpowers:finishing-a-development-branch` | Use after all tasks in a chosen roadmap are complete. | Run final verification, inspect `git diff --name-only`, update context/ROADMAP if needed, commit with Conventional Commit format, then prepare PR/merge options. |
| `frontend-design` | Required only for Roadmap C / Admin-UI visual redesign. | Follow the existing frontend guidance in `AGENTS.md`; inspect current admin-ui patterns and POS design tokens before changing UI. |
| `diagnose` | Use when a verification command fails or behavior is broken. | Reproduce, minimize, hypothesize, instrument, fix, and add a regression test before declaring the issue fixed. |

Do not assume these skills exist in the cloud runtime. Copy this table into the worker prompt if needed.

---

## Mandatory Start-Of-Work Read Order

Before opening broad source trees, read:

1. `AGENTS.md`
2. `CONTEXT-MAP.md`
3. `systems/enterprise-admin/CONTEXT.md`
4. `docs/agents/navigation.md`
5. `systems/enterprise-admin/infrastructure/standards/git_workflow.md`
6. The `MODULE.md` for the selected area:
   - backend work: `systems/enterprise-admin/backend/MODULE.md`
   - admin-ui work: `systems/enterprise-admin/admin-ui/MODULE.md`
   - pos-ui work: `systems/enterprise-admin/pos-ui/MODULE.md`
   - shared types work: `systems/enterprise-admin/packages/types/MODULE.md`

Then open only the source files listed by the selected roadmap.

---

## Roadmap A: Fresh Architecture And Test Health Audit

**Goal:** Replace the now-closed 2026-05-17 architecture health snapshot with a fresh, evidence-based view of current risks.

**Why first:** The previous Arch-Fix roadmap is complete. Before launching more feature work, the team needs a new radar map of build health, test health, production risks, and stale documentation.

**Recommended skills:**
- Required: `diagnose`, `superpowers:verification-before-completion`
- Recommended: `superpowers:subagent-driven-development`
- Optional: `improve-codebase-architecture`

**Files to inspect first:**
- `systems/enterprise-admin/ARCHITECTURE_HEALTH.md`
- `systems/enterprise-admin/ROADMAP.md`
- `systems/enterprise-admin/package.json`
- `systems/enterprise-admin/backend/package.json`
- `systems/enterprise-admin/admin-ui/package.json`
- `systems/enterprise-admin/pos-ui/package.json`
- `.github/workflows/ci.yml`

**Do not start by reading every source file.** Run package scripts and inspect only files related to failures or high-risk findings.

### Tasks

- [ ] **A1: Create an audit branch**
  - Branch name: `docs/fresh-architecture-health-audit`
  - Commit scope: `docs(arch)`

- [ ] **A2: Run context validation**
  - Command: `./scripts/validate-agent-context.sh`
  - Expected: exit 0.
  - If it fails, fix context wiring before continuing.

- [ ] **A3: Inventory available verification commands**
  - Read package scripts from root/system/backend/admin-ui/pos-ui package files.
  - Record only commands that exist locally in the repo.

- [ ] **A4: Run focused verification**
  - Minimum commands to try, if dependencies are installed:
    - `cd systems/enterprise-admin && pnpm run agent:context`
    - backend test/build commands from `backend/package.json`
    - admin-ui test/build commands from `admin-ui/package.json`
    - pos-ui test/build commands from `pos-ui/package.json`
  - If dependencies are missing, report that as an environment gap instead of inventing results.

- [ ] **A5: Investigate failures with diagnosis discipline**
  - For each failed command, identify:
    - command
    - failure type
    - likely owner area
    - whether it is regression, stale test, environment issue, or real product bug
  - Do not fix broad failures inside this audit unless the fix is trivial and isolated.

- [ ] **A6: Rewrite `ARCHITECTURE_HEALTH.md` as current state**
  - Preserve a short note that the 2026-05-17 Arch-Fix roadmap is closed.
  - Add a new dated section: `2026-06-02 Current Health Snapshot`.
  - Include P0/P1/P2 findings with evidence.
  - Include "No issue found" sections when a category was checked and clean.

- [ ] **A7: Update ROADMAP only if new actionable phases are created**
  - If the audit finds concrete follow-up work, add a new roadmap phase or cross-cutting concern.
  - If no new work is needed, do not add noise.

- [ ] **A8: Verify and commit**
  - Run: `./scripts/validate-agent-context.sh`
  - Run any focused checks affected by document/script edits.
  - Commit: `docs(arch): refresh architecture health audit`

**Definition of done:**
- `ARCHITECTURE_HEALTH.md` no longer reads like a stale active TODO list.
- Every new finding has evidence from commands, files, or concrete code inspection.
- Follow-up work is either added to `ROADMAP.md` or explicitly deferred.

---

## Roadmap B: Production Readiness Hardening

**Goal:** Turn Phase 11 deployment scaffolding into a clearer production operating model.

**Recommended skills:**
- Required: `superpowers:test-driven-development` for any code/script changes, `superpowers:verification-before-completion`
- Recommended: `diagnose`

**Files to inspect first:**
- `systems/enterprise-admin/ROADMAP.md`
- `systems/enterprise-admin/infrastructure/adr/adr_011_production_deployment.md`
- `docker-compose.yml`
- `Makefile`
- `.env.production.example`
- `.github/workflows/ci.yml`
- `systems/enterprise-admin/infrastructure/standards/observability.md`
- `systems/enterprise-admin/infrastructure/standards/slo_error_budget.md`

### Tasks

- [ ] **B1: Create an operations branch**
  - Branch name: `docs/production-readiness-hardening`
  - Commit scope: `docs(arch)` or `chore(repo)` depending on changes.

- [ ] **B2: Audit deployment docs and scripts**
  - Confirm `make prod`, `make migrate`, service healthchecks, and nginx routes are documented.
  - Identify missing operator runbooks.

- [ ] **B3: Add production runbook docs**
  - Suggested file: `systems/enterprise-admin/infrastructure/standards/production_runbook.md`
  - Cover:
    - environment variables and secret ownership
    - migration procedure
    - rollback procedure
    - backup/restore expectations
    - healthcheck interpretation
    - first-response steps for failed deploy

- [ ] **B4: Add monitoring checklist**
  - Either extend `observability.md` or link from the new runbook.
  - Cover error monitoring, audit logs, rate limit alerts, and service health.

- [ ] **B5: Update standards index and context if needed**
  - Update `systems/enterprise-admin/infrastructure/standards/README.md`.
  - Update `CONTEXT.md` or navigation only if source-of-truth locations change.

- [ ] **B6: Verify and commit**
  - Run: `./scripts/validate-agent-context.sh`
  - If scripts changed, run the affected script command.
  - Commit: `docs(arch): add production readiness runbook`

**Definition of done:**
- A cloud/on-call engineer can deploy, check health, migrate, and rollback using repo docs.
- No production process relies only on conversation history.

---

## Roadmap C: Admin-UI Visual Redesign

**Goal:** Execute Phase 12 by bringing admin-ui visual quality closer to the POS UI without disrupting data workflows.

**Recommended skills:**
- Required: `frontend-design`, `superpowers:test-driven-development`, `superpowers:verification-before-completion`
- Recommended: `superpowers:subagent-driven-development`

**Files to inspect first:**
- `systems/enterprise-admin/admin-ui/MODULE.md`
- `systems/enterprise-admin/admin-ui/src/index.css`
- `systems/enterprise-admin/admin-ui/src/layouts/AdminLayout.tsx`
- `systems/enterprise-admin/admin-ui/src/pages/DashboardPage.tsx`
- `systems/enterprise-admin/admin-ui/src/pages/UserListPage.tsx`
- `systems/enterprise-admin/admin-ui/src/pages/RoleListPage.tsx`
- report pages under `systems/enterprise-admin/admin-ui/src/pages/`
- POS token reference: `systems/enterprise-admin/pos-ui/src/index.css`

**Design constraints:**
- Admin UI should be quiet, dense, operational, and easy to scan.
- Do not turn admin screens into a marketing landing page.
- Keep cards at 8px radius or less unless existing tokens require otherwise.
- Use existing data hooks/API clients. This roadmap is primarily visual and component-system work.

### Tasks

- [ ] **C1: Create a UI branch**
  - Branch name: `feat/admin-ui-visual-redesign`
  - Commit scope: `feat(admin-ui)` or `style(admin-ui)`.

- [ ] **C2: Baseline screenshots**
  - Start dev server using existing admin-ui command.
  - Capture dashboard, users, roles, margin report, cashflow report, and sales ranking.
  - If browser tooling is unavailable, record that visual QA is blocked and continue with code/test verification.

- [ ] **C3: Implement ADM-UI-01 design tokens**
  - Add admin-ui token layer in `admin-ui/src/index.css`.
  - Keep compatibility aliases for existing classes.
  - Prefer neutral operational palette with restrained brand accent.

- [ ] **C4: Redesign shell and shared primitives**
  - Update `AdminLayout.tsx` only if layout polish is needed.
  - Standardize buttons, inputs, tables, badges, and panels through CSS classes before extracting components.

- [ ] **C5: Redesign Dashboard, Users, Roles**
  - Keep data flow unchanged.
  - Improve hierarchy, spacing, table legibility, empty/loading/error states.
  - Add/adjust component tests only where behavior or rendered semantics change.

- [ ] **C6: Redesign report pages**
  - Margin, CashFlow, SalesRanking pages should share chart/table treatment.
  - Do not change API contracts.

- [ ] **C7: Evaluate `packages/ui` extraction**
  - Only create `packages/ui/` if at least three shared primitives are genuinely reused across admin-ui and pos-ui.
  - If extraction is premature, leave ADM-UI-04 partially planned and document why.

- [ ] **C8: Verify and update ROADMAP**
  - Run admin-ui lint/test/build commands from package scripts.
  - Run visual browser checks if available.
  - Update Phase 12 checkboxes only for completed slices.
  - Run: `./scripts/validate-agent-context.sh`
  - Commit in small slices, for example:
    - `style(admin-ui): add admin design tokens`
    - `style(admin-ui): refresh core admin screens`
    - `style(admin-ui): unify report page visuals`

**Definition of done:**
- Phase 12 items are updated truthfully.
- Admin screens remain operational and dense.
- No API/data behavior changes are introduced accidentally.

---

## Roadmap D: Shared UI Library Decision

**Goal:** Decide whether `packages/ui/` should exist now, and if yes, introduce it narrowly.

**Recommended skills:**
- Required: `superpowers:brainstorming` if the component API is unclear, `superpowers:test-driven-development`, `superpowers:verification-before-completion`
- Recommended: `design-an-interface` if available, because component API shape benefits from alternatives.

**Files to inspect first:**
- `systems/enterprise-admin/packages/types/MODULE.md`
- `systems/enterprise-admin/package.json`
- `systems/enterprise-admin/pnpm-workspace.yaml` if present
- admin-ui and pos-ui button/badge/card/table implementations

### Tasks

- [ ] **D1: Create a shared-ui decision branch**
  - Branch name: `refactor/shared-ui-primitives`
  - Commit scope: `refactor(admin-ui)` or `refactor(repo)`.

- [ ] **D2: Count real duplication**
  - Identify repeated Button, Badge, Card, Table, Modal, or EmptyState patterns.
  - Do not extract based on imagined future use.

- [ ] **D3: Write decision note**
  - If extraction is not justified, document the threshold and stop.
  - If justified, write a small ADR or plan note describing component boundaries.

- [ ] **D4: Extract the smallest viable primitive set**
  - Start with at most Button, Badge, Card.
  - Keep styling compatible with both admin-ui and pos-ui tokens.
  - Avoid extracting page-specific table logic on the first pass.

- [ ] **D5: Add tests/build wiring**
  - Add package scripts only if the workspace already supports them.
  - Verify both consuming apps still build.

- [ ] **D6: Update context and ROADMAP**
  - Update `systems/enterprise-admin/CONTEXT.md` and `docs/agents/navigation.md` only if a new shared package boundary is created.
  - Update Phase 12 ADM-UI-04 only if the package exists and is consumed.

**Definition of done:**
- The repo either has a justified minimal shared UI package, or a documented decision not to extract yet.

---

## Recommended Execution Order

1. **Roadmap A: Fresh Architecture And Test Health Audit**
   - Gives the cloud worker objective evidence before changing product code.
2. **Roadmap B: Production Readiness Hardening**
   - Low-risk documentation/ops work that supports Phase 11.
3. **Roadmap C: Admin-UI Visual Redesign**
   - Main user-visible improvement after health is known.
4. **Roadmap D: Shared UI Library Decision**
   - Run during or after Roadmap C; do not extract components before real admin-ui redesign pressure appears.

---

## End-Of-Work Checklist For Every Cloud Worker

- [ ] Run `git diff --name-only`.
- [ ] Update the relevant context file if module boundaries, workflows, source-of-truth locations, API contracts, data-model meaning, or architecture constraints changed.
- [ ] Run `./scripts/validate-agent-context.sh`.
- [ ] Run focused tests/builds for touched areas.
- [ ] Update `systems/enterprise-admin/ROADMAP.md` only for work genuinely completed.
- [ ] Commit with Conventional Commit format from `systems/enterprise-admin/infrastructure/standards/git_workflow.md`.
- [ ] If the plan is fully done, move it to `docs/archive/plans/` in the same commit that marks it complete.

