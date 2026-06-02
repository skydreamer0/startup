# Agent Navigation

Use this file to choose the smallest useful read set before opening source files.

## Default route

Read:

1. `AGENTS.md`
2. `CONTEXT-MAP.md`
3. `systems/enterprise-admin/CONTEXT.md`
4. This file
5. The task-specific route below

Avoid broad source crawling until the route is selected.

## Task routes

| Task type | Read first | Then read | Avoid |
| --------- | ---------- | --------- | ----- |
| Feature status / roadmap | `systems/enterprise-admin/ROADMAP.md` | Referenced plan docs only if needed | Inferring progress from source files alone |
| Shared architecture | `systems/enterprise-admin/infrastructure/adr/`, `docs/architecture.md` | Relevant standards and source files | Changing architecture before reading ADRs |
| Backend API | `systems/enterprise-admin/backend/MODULE.md`, then `systems/enterprise-admin/infrastructure/api/api_spec.md` | Nearest backend route, service, repository, and tests | Reading every backend module |
| Database / Prisma | `systems/enterprise-admin/backend/MODULE.md`, then `systems/enterprise-admin/backend/prisma/schema.prisma` | Relevant migrations, seed files, services, tests | Changing model meaning without context updates |
| Admin UI | `systems/enterprise-admin/admin-ui/MODULE.md` | Nearest screen, component, hook, API client, and tests | Reading backend unless API behavior is involved |
| POS UI | `systems/enterprise-admin/pos-ui/MODULE.md` | Nearest POS screen, component, state, test, and API call | Reading admin UI unless shared behavior is involved |
| Shared types | `systems/enterprise-admin/packages/types/MODULE.md` | Relevant type source and consumers | Duplicating types in app-specific modules |
| Standards / workflow | `systems/enterprise-admin/infrastructure/standards/README.md` | Specific standard file and PR template | Updating workflow without updating agent context |
| Tests | Nearest package.json and nearest test files | Test pyramid standard if scope is broad | Running unrelated full suites before localizing failure |

## End-of-work route

Before finishing:

1. Run `git diff --name-only`.
2. Decide whether changed files affect context freshness.
3. Update context files if the change affects module boundaries, workflows, source-of-truth locations, API contracts, data-model meaning, or architecture constraints.
4. Run `./scripts/validate-agent-context.sh`.
5. Commit with the repository Conventional Commit format.

## Context freshness examples

| Change | Context update needed? |
| ------ | ---------------------- |
| Add a new backend module | Yes: system context and navigation/module docs |
| Move API source-of-truth location | Yes: context map, system context, and navigation |
| Add a route matching existing API patterns | Usually no, unless API contract docs changed |
| Rename a Prisma model | Yes: schema docs/context that explain model meaning |
| Fix an isolated UI bug | Usually no |
| Change PR or branch workflow | Yes: standards, `AGENTS.md`, and PR template if applicable |
