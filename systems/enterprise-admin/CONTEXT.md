# enterprise-admin Context

## Product summary

`enterprise-admin` is the active PharmaSaaS system. It contains the back-office admin web app, the Express + Prisma backend API, shared enterprise infrastructure, and POS-facing surfaces.

## Domain language

- `tenant` means the isolated customer workspace.
- `POS` means the point-of-sale app in `pos-ui/`.
- `admin-ui` means the back-office web app in `admin-ui/`.
- `backend` means the API service in `backend/`.
- `ADR` means an architecture decision record under `infrastructure/adr/`.

## Module map

| Area | Path | Purpose |
| ---- | ---- | ------- |
| Admin UI | `admin-ui/` | React back-office interface for enterprise operators. Start with `admin-ui/MODULE.md`. |
| Backend | `backend/` | Express API, Prisma persistence, auth, and domain modules. Start with `backend/MODULE.md`. |
| POS UI | `pos-ui/` | Point-of-sale user interface and workflows. Start with `pos-ui/MODULE.md`. |
| Shared types | `packages/types/` | Workspace-level shared TypeScript types. Start with `packages/types/MODULE.md`. |
| Infrastructure | `infrastructure/` | Standards, ADRs, API specs, deployment, and architecture docs. |

## Important sources

| Question | Source of truth |
| -------- | --------------- |
| What is complete or planned? | `ROADMAP.md` |
| What technical debt or design notes exist? | `ARCHITECTURE_HEALTH.md` |
| Which architecture constraints apply? | `infrastructure/adr/` |
| What API contract should code follow? | `infrastructure/api/api_spec.md` |
| What database models exist? | `backend/prisma/schema.prisma` |
| Which workflow and review rules apply? | `infrastructure/standards/` |
| Which package manager and lockfile apply? | `infrastructure/standards/dependency_management.md`: standalone backend npm, frontend/shared pnpm workspace |

## Reading rules

- Read `ROADMAP.md` first when checking feature status or progress.
- Read ADRs before changing shared architecture or repo-wide conventions.
- Read `docs/agents/navigation.md` before opening broad source trees.
- Read the relevant module `MODULE.md` before opening module source files.
- Prefer nearest source files after selecting a task route.

## End-of-work context rules

Update this file, `CONTEXT-MAP.md`, `docs/agents/navigation.md`, a standard, or an ADR in the same commit when a change alters:

- module boundaries or responsibilities;
- workflow start/end rules;
- source-of-truth locations;
- API contract meaning;
- data-model meaning;
- architecture constraints.

Run `./scripts/validate-agent-context.sh` after context-related edits.
