# Agent Instructions

These instructions apply to the whole repository.

## Start-of-work read order

Before opening broad source trees or making changes, read the smallest context set in this order:

1. `CONTEXT-MAP.md`
2. `systems/enterprise-admin/CONTEXT.md`
3. `docs/agents/navigation.md`
4. `systems/enterprise-admin/infrastructure/standards/git_workflow.md`
5. The relevant module `MODULE.md` selected by `docs/agents/navigation.md`

Then choose the task route from `docs/agents/navigation.md` and open only the relevant source files.

## Token budget rule

Do not crawl source files broadly before selecting a task route. Prefer context routers, source-of-truth documents, and the nearest source files over full-directory inspection.

## Source-of-truth rules

- Feature progress: `systems/enterprise-admin/ROADMAP.md`
- Architecture constraints: `systems/enterprise-admin/infrastructure/adr/`
- API contract: `systems/enterprise-admin/infrastructure/api/api_spec.md`
- Database model: `systems/enterprise-admin/backend/prisma/schema.prisma`
- Engineering workflow: `systems/enterprise-admin/infrastructure/standards/`

## Encoding policy

This repository contains Traditional Chinese documentation. Treat all text files as UTF-8.

When reading or writing files that may contain Chinese text:

- Prefer UTF-8 aware tools and APIs.
- Do not use PowerShell redirection operators `>` or `>>` to rewrite Chinese text files.
- Do not use `Out-File` or `Set-Content` without explicitly specifying UTF-8.
- Prefer PowerShell 7 `pwsh` over Windows PowerShell when it is available.
- Do not rely on terminal display alone to decide whether Chinese content is valid; terminal output can be mojibake even when the file is correct.
- Verify Chinese file content with an explicit UTF-8 read path or a UTF-8 aware editor.

Recommended explicit UTF-8 read/write pattern when scripting is required:

```python
from pathlib import Path

text = Path(file).read_text(encoding="utf-8")
Path(file).write_text(text, encoding="utf-8")
```

## End-of-work context update loop

Before finishing work:

1. Run `git diff --name-only` and review the changed areas.
2. Update the relevant context file in the same change if module boundaries, workflows, source-of-truth locations, API contracts, data-model meaning, or architecture constraints changed.
3. Run `./scripts/validate-agent-context.sh` after context-related edits, or `cd systems/enterprise-admin && pnpm run agent:context`.
4. Commit using the Conventional Commit format from `systems/enterprise-admin/infrastructure/standards/git_workflow.md`.

Context updates are usually not required for trivial copy changes, isolated bug fixes, or test-only additions that do not change behavior or workflow.
