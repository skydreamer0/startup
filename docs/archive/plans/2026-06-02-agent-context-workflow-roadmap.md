# Agent Context Workflow Roadmap

Date: 2026-06-02
Status: Phase 1-5 implemented
Scope: AI-first workflow, context freshness, and git-controlled validation

## Problem

Agents currently spend too many tokens rediscovering repository structure by opening source files before they know which files are relevant. The repository already has context entry points, but they do not yet enforce a start-of-work read order, an end-of-work context update loop, or validation that the context files remain available and linked correctly.

## Goals

1. Make agents read a small context set before opening broad source trees.
2. Make agents update the relevant context files before finishing work when their changes alter module boundaries, workflows, source-of-truth locations, API contracts, data-model meaning, or architecture constraints.
3. Add a git-controlled validation command that checks required context files are present, tracked, and internally linked.
4. Keep the context concise enough that it saves tokens instead of becoming another large document set.

## Non-goals

- Do not summarize every source file.
- Do not replace ADRs, API specs, Prisma schema, or ROADMAP.
- Do not force context updates for trivial copy changes or isolated bug fixes that do not change behavior, boundaries, or workflows.

## Implementation plan

### Phase 1 — Start-of-work context routing

- Add a root `AGENTS.md` that tells agents what to read first.
- Expand `CONTEXT-MAP.md` from a system table into the repository-level context router.
- Expand `systems/enterprise-admin/CONTEXT.md` into the system-level context capsule.
- Add `docs/agents/navigation.md` to map task types to the smallest useful read set.

### Phase 2 — End-of-work context update loop

- Add an Agent Context Standard under `systems/enterprise-admin/infrastructure/standards/`.
- Define which changes require context updates.
- Add an AI Context Impact section to the PR template.
- Require agents to inspect `git diff --name-only` before finishing and update context when relevant.

### Phase 3 — Git-controlled validation

- Add `scripts/validate-agent-context.sh`.
- Check required context files exist.
- Check required context files are tracked by git.
- Check key cross-document links resolve.
- Check the PR template and standards index include the AI context workflow.

### Phase 4 — Module capsules

- Add module-level `MODULE.md` files for `backend`, `admin-ui`, and `pos-ui` once the foundation is accepted.
- Keep each capsule short and task-oriented.
- Consider generated indexes only after the hand-written context workflow is stable.

### Phase 5 — CI and script enforcement

- Add an `agent:context` workspace script that runs the validator from the repo root.
- Add a CI job that runs the validator on pull requests and pushes.
- Make the validator check that CI and the package script stay wired.

## Acceptance criteria

- A new agent can identify the required start-of-work read order without scanning source code.
- A finishing agent has an explicit checklist for when to update context files.
- A reviewer can run one validation command to verify required context files and links are present.
- PRs include an AI context freshness checklist.


## Implementation notes

### 2026-06-02 — Module capsules added

Phase 4 was implemented by adding concise `MODULE.md` capsules for:

- `systems/enterprise-admin/backend/MODULE.md`
- `systems/enterprise-admin/admin-ui/MODULE.md`
- `systems/enterprise-admin/pos-ui/MODULE.md`
- `systems/enterprise-admin/packages/types/MODULE.md`

The navigation guide now routes module-specific tasks through these capsules before source files, and the validation script checks that the capsules are tracked by git and contain required sections.


### 2026-06-02 — CI validation wired

Phase 5 was implemented by adding:

- `agent:context` to `systems/enterprise-admin/package.json`;
- an `Agent Context Validation` job to `.github/workflows/ci.yml`;
- validator checks that require the CI job and package script to remain present.
