# 🤖 AI Development Context (Project Memory)

**IMPORTANT**: ALWAYS read this before suggesting code or refactors.

## 1. Core Principles (The "Soul")
- **Standard**: Aligned with Big Tech / Tier-1 Enterprise patterns.
- **Documentation**: Design-First. Updates to code MUST be reflected in `infrastructure/` (DB Schema, API Spec, ADRs).
- **Naming**: 
  - Database & API: Strictly `snake_case`.
  - Frontend: `PascalCase` for Components, `camelCase` for variables/functions.

## 2. Tech Stack & Constraints
- **Primary DB**: PostgreSQL (v15+).
- **Auth**: Stateless JWT (Bearer).
- **Architecture**: Clean, modular, and organized within `infrastructure/`.
- **Infrastructure Path**: `/infrastructure/` (Reference this for all standards).

## 3. Engineering Workflow
- **Conventional Commits**: `<type>(scope): <message>` (e.g., `feat(ui): ...`).
- **PR Rules**: No PR without a description and linked task.
- **ADR Policy**: Major technical shifts require a new ADR in `infrastructure/adr/`.

## 4. Quick Links
- [Main Blueprint](infrastructure/system_architecture.md)
- [API Spec](infrastructure/api/api_spec.md)
- [DB Schema](infrastructure/backend/database_schema.md)
- [Git Rules](infrastructure/standards/git_workflow.md)

---
**AI Instructions**: Be concise, professional, and strictly follow the established `infrastructure` guidelines. Do not suggest "quick hacks" that bypass these standards.
