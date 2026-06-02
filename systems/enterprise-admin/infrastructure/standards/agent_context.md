# Agent Context Standard

## 1. Purpose

Agent context files reduce repeated source crawling. They give agents a stable, git-controlled way to understand where to start, which source-of-truth document to trust, and when context must be updated before a change is finished.

## 2. Start-of-work rule

Agents must read the repository context before broad source inspection:

1. `AGENTS.md`
2. `CONTEXT-MAP.md`
3. `systems/enterprise-admin/CONTEXT.md`
4. `docs/agents/navigation.md`
5. Task-specific source-of-truth documents
6. Nearest relevant source files

## 3. End-of-work rule

Before finishing, agents must run `git diff --name-only` and decide whether changed files require a context update.

Update context in the same commit when a change alters:

- module boundaries or responsibilities;
- workflow start/end rules;
- source-of-truth locations;
- API contract meaning;
- data-model meaning;
- architecture constraints;
- test strategy or review requirements.

Context updates are usually not required for trivial copy changes, isolated bug fixes, or tests that do not alter product behavior or workflow.

## 4. Git-controlled freshness

Run this command after context-related edits:

```bash
./scripts/validate-agent-context.sh
```

The workspace package exposes the same check for local and CI workflows:

```bash
cd systems/enterprise-admin && pnpm run agent:context
```

The validation script checks that required agent context files exist, are tracked by git, link to the expected workflow, context, standards, and PR checklist files, and that CI is wired to run the validation.

## 5. Context size budget

Context files should stay short and navigational:

| File type | Target |
| --------- | ------ |
| Root instructions | Start/end workflow and source-of-truth rules only |
| Context map | Repository routing and source-of-truth table only |
| System context | Domain language, module map, and system-specific rules |
| Navigation | Task routes and minimal read sets |
| Module capsule | Purpose, directory map, common task routes, and tests |

Do not copy long source summaries into context files. Link to the source-of-truth document instead.

## 6. Review checklist

Reviewers should ask:

1. Can a future agent handle a similar task without broad source crawling?
2. Did this PR change a source-of-truth location, module boundary, or workflow?
3. If yes, did the same PR update the relevant context file?
4. Does `./scripts/validate-agent-context.sh` pass?
