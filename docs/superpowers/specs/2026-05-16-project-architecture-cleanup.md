# Project Architecture Cleanup Design Spec

> **Status:** Approved  
> **Priority:** High (blocks Phase 8)  
> **Approach:** Option B — Archive + New Structure (with C-compatibility)

---

## Goal

Reduce AI context noise, establish a navigable project structure, and write documentation that reflects the real system — all without moving production code.

## Architecture

The monorepo root acts as the workspace boundary. All deployable systems live under `systems/`. Business documents live under `business/`. Completed work lives under `docs/archive/` and is excluded from AI context via `.aiignore` and `CLAUDE.md`.

Future Option C upgrade path: add `systems/pos/`, `packages/shared/`, `tools/` without touching existing paths.

---

## Target Directory Structure

```
startup/                                         (monorepo root)
├── CLAUDE.md                                    [NEW] Claude Code context
├── README.md                                    [REWRITE] Architecture overview
├── .aiignore                                    [ENHANCE] Exclude archive + business
├── .gitignore
├── .github/
│
├── systems/
│   └── enterprise-admin/
│       ├── README.md                            [NEW] System entry point
│       ├── ROADMAP.md                           [KEEP] Live roadmap
│       ├── admin-ui/                            [UNTOUCHED]
│       ├── backend/                             [UNTOUCHED]
│       └── infrastructure/
│           ├── adr/                             [KEEP]
│           ├── api/                             [KEEP]
│           ├── backend/                         [KEEP]
│           ├── frontend/                        [KEEP]
│           ├── devops/                          [KEEP]
│           ├── standards/                       [KEEP]
│           └── plans/
│               └── archive/                     [NEW] Move completed plans here
│
├── docs/
│   ├── architecture.md                          [NEW] High-level system diagram
│   ├── research/                                [KEEP]
│   └── archive/
│       └── plans/                              [MOVE] docs/superpowers/plans/ → here
│
├── business/
│   └── templates/                              [MOVE] startup_template_pack/ → here
│
└── (future: packages/, tools/)
```

---

## Files to Create

### `CLAUDE.md` (root)

```markdown
# PharmaSaaS — Claude Code Context

## 專案結構
這是一個 monorepo。目前唯一的系統是 `systems/enterprise-admin/`。

## 你現在在做什麼
查看 `systems/enterprise-admin/ROADMAP.md` 了解目前進度和下一步。

## 重要規則
- Commits 用 Conventional Commits: `feat(scope): message`
- DB/API 命名用 snake_case；前端 Component 用 PascalCase
- 重大架構決策需新增 ADR：`systems/enterprise-admin/infrastructure/adr/`
- 金額目前用 Float（Phase 8 前不改）

## 請勿讀取以下目錄（省 token）
- `business/` — 商業模板，與程式碼無關
- `docs/archive/` — 已完成的計畫，歷史參考
- `systems/enterprise-admin/infrastructure/plans/archive/` — 同上

## 快速導航
- 後端：`systems/enterprise-admin/backend/`
- 前端：`systems/enterprise-admin/admin-ui/`
- Schema：`systems/enterprise-admin/backend/prisma/schema.prisma`
- API 規格：`systems/enterprise-admin/infrastructure/api/api_spec.md`
- ADR：`systems/enterprise-admin/infrastructure/adr/`
```

### `README.md` (root, rewrite)

Content: Architecture overview with system diagram, tech stack table, quick start commands, document index table, contribution rules. See approved design above.

### `systems/enterprise-admin/README.md` (new)

Content: System-level entry point. What this system does, how to run it locally, links to ROADMAP, ADRs, API spec.

### `docs/architecture.md` (new)

Content: One-page architecture diagram (ASCII or Mermaid), system boundaries, data flow between frontend/backend/DB, future systems placeholder.

---

## Files to Move

| From | To | Reason |
|---|---|---|
| `startup_template_pack/` | `business/templates/` | Not code; exclude from AI |
| `docs/superpowers/plans/2026-05-16-phase-6.3-design-system.md` | `docs/archive/plans/` | Completed work |
| `systems/enterprise-admin/infrastructure/plans/20260302_pharmacy_management_features_design.md` | `systems/enterprise-admin/infrastructure/plans/archive/` | Completed work |
| `systems/enterprise-admin/infrastructure/plans/20260304_phase7_analytics_plan.md` | `systems/enterprise-admin/infrastructure/plans/archive/` | Completed work |
| `systems/enterprise-admin/infrastructure/plans/20260514_design_system_pos_roadmap.md` | `systems/enterprise-admin/infrastructure/plans/archive/` | Completed work |

---

## Files to Delete

| File | Reason |
|---|---|
| `implementation_plan.md.resolved` | Stale resolved plan, no value |
| `AI_CONTEXT.md` | Replaced by `CLAUDE.md` |

---

## `.aiignore` Additions

```
# Business documents (not code)
business/

# Completed plans archive
docs/archive/
systems/enterprise-admin/infrastructure/plans/archive/

# Startup business templates (legacy location during migration)
startup_template_pack/

# Superpowers tooling artifacts
docs/superpowers/
.agents/
```

---

## Success Criteria

1. `CLAUDE.md` exists at root and Claude Code reads it instead of `AI_CONTEXT.md`
2. AI does not read `business/`, `docs/archive/`, or `infrastructure/plans/archive/`
3. All completed plan files are in archive directories
4. Root `README.md` has architecture overview a new team member can follow in 5 minutes
5. No production code paths changed
6. `git status` is clean after all moves/deletes

---

## Out of Scope

- Moving or renaming any code files (`admin-ui/`, `backend/`, `prisma/`)
- Updating content of existing ADR or infrastructure docs
- CI/CD changes
- Option C additions (`packages/`, `tools/`)
