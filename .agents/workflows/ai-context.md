---
description: Load the smallest repository-relative project context for the task
---

Run from the repository root; do not use a developer-specific absolute path.

1. Read `AGENTS.md`, then `CONTEXT-MAP.md`.
2. Read `systems/enterprise-admin/CONTEXT.md` and `docs/agents/navigation.md`.
3. Read `systems/enterprise-admin/infrastructure/standards/git_workflow.md`.
   Then select the task/journey route and read the relevant module `MODULE.md`
   and applicable ADR/API contract. Do not crawl the entire source or standards tree first.
4. For status, use `systems/enterprise-admin/ROADMAP.md` and verify the exact
   current PR/head plus its evidence. Requirements/AC stay with #31/#37 and
   subsequent confirmed decisions. An old plan or Draft label is not current status.
5. For UI, follow the navigation link to the existing design MASTER and pharmacy
   touch-review skill. For dispatch, use `.agents/skills/triage/AGENT-BRIEF.md`;
   record file ownership and evidence without treating the brief as new permission.
6. Before finishing, inspect `git diff --name-only`, update the affected existing
   context when its meaning changes, and run `./scripts/validate-agent-context.sh`.

The active infrastructure is `systems/enterprise-admin/infrastructure/`.
There is no required root `AI_CONTEXT.md` or root `infrastructure/` directory.
Do not claim readiness until the selected task's constraints and evidence are clear.
