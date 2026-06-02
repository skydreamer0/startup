# Context Map

This monorepo has one active system. Use this file as the repository-level context router before opening source files.

## Agent read order

1. `AGENTS.md`
2. `CONTEXT-MAP.md`
3. The active system context listed below
4. `docs/agents/navigation.md`
5. Task-specific source-of-truth documents
6. Nearest relevant source files only

## Active systems

| System | Purpose | CONTEXT.md | ADRs |
| ------ | ------- | ---------- | ---- |
| enterprise-admin | PharmaSaaS enterprise admin, backend API, and POS surfaces | `systems/enterprise-admin/CONTEXT.md` | `systems/enterprise-admin/infrastructure/adr/` |

## Source-of-truth map

| Need | Read |
| ---- | ---- |
| Feature status and roadmap progress | `systems/enterprise-admin/ROADMAP.md` |
| Architecture decisions and constraints | `systems/enterprise-admin/infrastructure/adr/` |
| API contract | `systems/enterprise-admin/infrastructure/api/api_spec.md` |
| Database schema and model names | `systems/enterprise-admin/backend/prisma/schema.prisma` |
| Engineering standards | `systems/enterprise-admin/infrastructure/standards/` |
| Task-specific read sets | `docs/agents/navigation.md` |
| Module-level task context | `systems/enterprise-admin/<module>/MODULE.md` |

## Freshness rule

Before finishing a change, inspect `git diff --name-only`. If the change alters module boundaries, workflows, source-of-truth locations, API contracts, data-model meaning, or architecture constraints, update the relevant context document in the same commit.
