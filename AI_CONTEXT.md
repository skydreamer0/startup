# 🤖 AI Development Context (Project Memory)

**IMPORTANT**: ALWAYS read this before suggesting code or refactors.

## 1. Core Principles (The "Soul")
- **Standard**: Aligned with Big Tech / Tier-1 Enterprise patterns.
- **Documentation**: Design-First. Updates to code MUST be reflected in the respective subsystem's `infrastructure/` (e.g., `systems/enterprise-admin/infrastructure/`).
- **Naming**: 
  - Database & API: Strictly `snake_case`.
  - Frontend: `PascalCase` for Components, `camelCase` for variables/functions.

## 2. Tech Stack & Constraints
- **Primary DB**: PostgreSQL (v15+).
- **Auth**: Stateless JWT (Bearer).
- **Architecture**: Clean, modular, and organized relative to the specific subsystem.
- **Infrastructure Path**: `systems/enterprise-admin/infrastructure/` (Reference this for enterprise-admin standards).

## 3. Engineering Workflow
- **Conventional Commits**: `<type>(scope): <message>` (e.g., `feat(ui): ...`).
- **PR Rules**: No PR without a description and linked task.
- **ADR Policy**: Major technical shifts require a new ADR in the subsystem's `infrastructure/adr/`.

## 4. Subsystem Quick Links (Enterprise Admin System)
- [Main Blueprint](systems/enterprise-admin/infrastructure/system_architecture.md)
- [API Spec](systems/enterprise-admin/infrastructure/api/api_spec.md)
- [DB Schema](systems/enterprise-admin/infrastructure/backend/database_schema.md)
- [Git Rules](systems/enterprise-admin/infrastructure/standards/git_workflow.md)

## 5. Excluded Territories (AI Ignore Rules)
- **Do NOT read, search, or modify** any files in `node_modules`, `dist`, `build`, or any paths listed in `.aiignore` at the root.
- **Why**: Searching these folders wastes context window and causes timeout errors. Rely on `package.json` for dependency insights instead.

---
**AI Instructions**: Be concise, professional, and strictly follow the established `infrastructure` guidelines of the specific system. Do not suggest "quick hacks" that bypass these standards.
