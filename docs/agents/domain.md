# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

This is a **multi-context monorepo**. `CONTEXT-MAP.md` at the repo root points to the per-system context files.

## Before exploring, read these

- **`CONTEXT-MAP.md`** at the repo root — maps each system to its `CONTEXT.md`
- **`systems/enterprise-admin/CONTEXT.md`** — domain language for the enterprise-admin system
- **`systems/enterprise-admin/infrastructure/adr/`** — architectural decisions for this system

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The producer skill (`/grill-with-docs`) creates them lazily when terms or decisions actually get resolved.

## File structure

```
/
├── CONTEXT-MAP.md
└── systems/
    └── enterprise-admin/
        ├── CONTEXT.md                       ← domain language for enterprise-admin
        └── infrastructure/
            └── adr/                         ← architectural decisions (ADRs)
                ├── adr_001_*.md
                └── ...
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `systems/enterprise-admin/CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/grill-with-docs`).

## Flag ADR conflicts

If your output contradicts an existing ADR under `systems/enterprise-admin/infrastructure/adr/`, surface it explicitly rather than silently overriding:

> _Contradicts ADR-007 (postgresql-migration) — but worth reopening because…_
