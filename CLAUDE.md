# Startup Codex Context

This repo is a GitHub-hosted monorepo centered on `systems/enterprise-admin/`.

## Conventions

- Use Conventional Commits: `feat(scope): message`
- Keep DB/API names in `snake_case`
- Keep React components in `PascalCase`
- Read ADRs from `systems/enterprise-admin/infrastructure/adr/`
- Preserve UTF-8 for all text files. For Chinese documentation, avoid PowerShell `>`, `>>`, `Out-File`, or `Set-Content` unless UTF-8 is explicit, and do not rely on terminal output alone to judge whether content is valid.

## Agent skills

### Issue tracker

Issues live in GitHub Issues on `skydreamer0/startup`. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the five canonical labels exactly as mapped in `docs/agents/triage-labels.md`.

### Domain docs

This repo uses a multi-context layout with `CONTEXT-MAP.md` at the root pointing to `systems/enterprise-admin/CONTEXT.md`. See `docs/agents/domain.md`.

## Repo map

- Backend: `systems/enterprise-admin/backend/`
- Admin UI: `systems/enterprise-admin/admin-ui/`
- POS UI: `systems/enterprise-admin/pos-ui/`
- Shared packages: `systems/enterprise-admin/packages/`
- Roadmap: `systems/enterprise-admin/ROADMAP.md`
- Architecture health: `systems/enterprise-admin/ARCHITECTURE_HEALTH.md`
