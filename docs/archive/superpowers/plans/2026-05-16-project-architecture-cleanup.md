# Project Architecture Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce AI context noise, establish a navigable monorepo structure, and produce a README + CLAUDE.md that new contributors (human or AI) can follow in 5 minutes.

**Architecture:** All changes are documentation and directory moves only — no production code paths change. `systems/enterprise-admin/admin-ui/` and `backend/` are untouched. Completed plan files are archived under `docs/archive/` and `infrastructure/plans/archive/` and excluded from AI context via `.aiignore` and `CLAUDE.md`.

**Tech Stack:** Git (mv + rm), Markdown, `.aiignore` glob syntax.

**Spec:** `docs/superpowers/specs/2026-05-16-project-architecture-cleanup.md`

---

## File Map

| Action | Path |
|---|---|
| Create | `CLAUDE.md` |
| Rewrite | `README.md` |
| Create | `systems/enterprise-admin/README.md` |
| Create | `docs/architecture.md` |
| Modify | `.aiignore` |
| Move | `startup_template_pack/` → `business/templates/` |
| Move | `docs/superpowers/plans/2026-05-16-phase-6.3-design-system.md` → `docs/archive/plans/` |
| Move | `systems/enterprise-admin/infrastructure/plans/20260302_*.md` → `systems/enterprise-admin/infrastructure/plans/archive/` |
| Move | `systems/enterprise-admin/infrastructure/plans/20260304_*.md` → `systems/enterprise-admin/infrastructure/plans/archive/` |
| Move | `systems/enterprise-admin/infrastructure/plans/20260514_*.md` → `systems/enterprise-admin/infrastructure/plans/archive/` |
| Delete | `implementation_plan.md.resolved` |
| Delete | `AI_CONTEXT.md` |

---

## Task 1: Create CLAUDE.md

**Files:**
- Create: `CLAUDE.md` (repo root)

- [ ] **Step 1: Write CLAUDE.md**

Create the file at the repo root with this exact content:

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

- [ ] **Step 2: Verify file exists**

```bash
cat CLAUDE.md | head -5
```

Expected: First line is `# PharmaSaaS — Claude Code Context`

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude): add CLAUDE.md as Claude Code native context file"
```

---

## Task 2: Rewrite README.md

**Files:**
- Modify: `README.md` (repo root — full rewrite)

- [ ] **Step 1: Rewrite README.md**

Replace the entire content with:

```markdown
# PharmaSaaS

藥局 SaaS 管理平台 — 企業後台 + POS 系統（建置中）。

## 系統架構

```
startup/                          (monorepo root)
└── systems/
    └── enterprise-admin/         Phase 1–7 完成
        ├── admin-ui/             React 19 前端
        └── backend/              Express + Prisma 後端
```

未來擴充：`systems/pos/`（Phase 9）、`packages/shared/`（跨系統共用 lib）。

## 技術棧

| 層級 | 技術 |
|---|---|
| 前端 | React 19, Vite, TanStack Query, Recharts |
| 後端 | Express 5, Prisma ORM, JWT (RS256) |
| 資料庫 | PostgreSQL 15 |
| 測試 | Vitest |
| CI/CD | GitHub Actions |
| 容器 | Docker Compose (本地開發) |

## 快速啟動

```bash
# 1. 啟動資料庫
cd systems/enterprise-admin
docker-compose up -d postgres

# 2. 後端（Port 3000）
cd backend
npm install && npm run dev

# 3. 前端（Port 5173）
cd ../admin-ui
npm install && npm run dev
```

預設帳號：`admin@pharmasaas.dev` / `password123`（seed 資料）

## 文件索引

| 文件 | 說明 |
|---|---|
| [ROADMAP](systems/enterprise-admin/ROADMAP.md) | 開發路線圖與目前進度 |
| [架構總覽](docs/architecture.md) | 系統邊界與資料流 |
| [ADR](systems/enterprise-admin/infrastructure/adr/) | 架構決策記錄 |
| [API Spec](systems/enterprise-admin/infrastructure/api/api_spec.md) | REST API 規格 |
| [DB Schema](systems/enterprise-admin/backend/prisma/schema.prisma) | Prisma Schema |

## 貢獻規範

- Branch 命名：`feat/<topic>`、`fix/<topic>`
- Commit：Conventional Commits — `feat(scope): message`
- 重大決策需新增 ADR（參考 `infrastructure/adr/README.md`）
- PR 必須附說明與關聯任務
```

- [ ] **Step 2: Verify**

```bash
head -3 README.md
```

Expected: `# PharmaSaaS`

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs(readme): rewrite root README with architecture overview and quick start"
```

---

## Task 3: Create systems/enterprise-admin/README.md

**Files:**
- Create: `systems/enterprise-admin/README.md`

- [ ] **Step 1: Write system README**

```markdown
# Enterprise Admin System

藥局 SaaS 企業後台，包含 RBAC、CRM、庫存、訂單、財務報表、數據分析。

## 目前進度

Phase 1–7.6 完成。詳見 [ROADMAP.md](ROADMAP.md)。

## 本地開發

```bash
# 前置條件：Docker Desktop 執行中，Node.js 20+

# 1. 啟動 PostgreSQL
docker-compose up -d postgres

# 2. 後端
cd backend
cp .env.example .env   # 若尚未建立
npm install
npm run db:push        # 套用 schema
npm run db:seed        # 植入測試資料
npm run dev            # http://localhost:3000

# 3. 前端
cd ../admin-ui
npm install
npm run dev            # http://localhost:5173
```

## 目錄結構

```
enterprise-admin/
├── admin-ui/           React 19 前端
│   └── src/
│       ├── pages/      各功能頁面
│       ├── hooks/      React hooks (useAuth 等)
│       ├── api/        API 呼叫層
│       └── components/ 共用元件
├── backend/            Express 後端
│   └── src/
│       ├── modules/    功能模組 (crm, inventory, analytics…)
│       ├── lib/        共用工具 (prisma, errors, tenant)
│       └── middleware/ 中介層 (auth, rbac, audit)
└── infrastructure/
    ├── adr/            架構決策記錄
    ├── api/            API 規格文件
    └── plans/archive/  已完成的實作計畫（封存）
```

## 測試

```bash
# 後端
cd backend && npm test

# 前端
cd admin-ui && npx vitest run
```
```

- [ ] **Step 2: Verify**

```bash
head -3 systems/enterprise-admin/README.md
```

Expected: `# Enterprise Admin System`

- [ ] **Step 3: Commit**

```bash
git add systems/enterprise-admin/README.md
git commit -m "docs(enterprise-admin): add system-level README with dev setup and structure"
```

---

## Task 4: Create docs/architecture.md

**Files:**
- Create: `docs/architecture.md`

- [ ] **Step 1: Write architecture doc**

```markdown
# System Architecture

## Overview

PharmaSaaS is a single-tenant-first, multi-tenant-ready SaaS for pharmacy operations.
Current deployment: one system (`enterprise-admin`). Future: add `pos` system in Phase 9.

## System Boundaries

```
┌─────────────────────────────────────────────────────────┐
│                      Browser                            │
│                                                         │
│  ┌──────────────────┐        ┌──────────────────────┐  │
│  │   Admin UI        │        │   POS UI (Phase 9)   │  │
│  │  React 19 + Vite  │        │   React 19 + Vite    │  │
│  │  Port 5173        │        │   Port 5174          │  │
│  └────────┬─────────┘        └──────────┬───────────┘  │
└───────────┼──────────────────────────────┼──────────────┘
            │ REST / JWT                   │ REST / JWT
            ▼                              ▼
┌─────────────────────────────────────────────────────────┐
│                   Backend API (Express 5)                │
│                        Port 3000                        │
│                                                         │
│   Auth  │  RBAC  │  CRM  │  Inventory  │  Analytics    │
│         │        │       │             │               │
└─────────────────────────┬───────────────────────────────┘
                          │ Prisma ORM
                          ▼
                 ┌────────────────┐
                 │  PostgreSQL 15 │
                 │    Port 5433   │
                 └────────────────┘
```

## Data Flow: API Request

```
Client → JWT validation (auth.middleware)
       → Tenant injection (tenant.middleware)
       → Permission check (rbac.middleware)
       → Route handler (module controller)
       → Service layer (business logic)
       → Prisma (auto-scoped to tenant)
       → PostgreSQL
```

## Multi-Tenancy

Row-level isolation via Prisma extension (`lib/prisma.ts`).
Every query automatically filters by `tenantId` from the request context.
No data leaks between tenants by construction.

## Key Design Decisions

See `systems/enterprise-admin/infrastructure/adr/` for full ADR list.

| Decision | ADR | Choice |
|---|---|---|
| Database | ADR-001 | PostgreSQL |
| Auth | ADR-002 | Stateless JWT |
| Backend framework | ADR-003 | Express 5 |
| Multi-tenancy | ADR-006 | Row-level via Prisma extension |

## Future Systems (Planned)

| System | Phase | Status |
|---|---|---|
| `systems/pos/` | Phase 9 | Not started |
| `packages/shared/` | Phase C | When 2+ systems share code |
```

- [ ] **Step 2: Verify**

```bash
head -3 docs/architecture.md
```

Expected: `# System Architecture`

- [ ] **Step 3: Commit**

```bash
git add docs/architecture.md
git commit -m "docs(arch): add system architecture overview with boundary diagram and data flow"
```

---

## Task 5: Enhance .aiignore

**Files:**
- Modify: `.aiignore`

- [ ] **Step 1: Append exclusions to .aiignore**

Open `.aiignore` and append these lines at the end:

```
# Business documents (not code — AI should not read)
business/
startup_template_pack/

# Completed plans archive (historical reference only)
docs/archive/
systems/enterprise-admin/infrastructure/plans/archive/

# Superpowers tooling artifacts
docs/superpowers/
.agents/
```

- [ ] **Step 2: Verify the file contains the new entries**

```bash
tail -15 .aiignore
```

Expected: Shows the business/, docs/archive/, and systems/.../archive/ lines.

- [ ] **Step 3: Commit**

```bash
git add .aiignore
git commit -m "chore(aiignore): exclude business templates, archived plans, and superpowers artifacts"
```

---

## Task 6: Archive completed plan files

**Files:**
- Create dirs: `docs/archive/plans/` and `systems/enterprise-admin/infrastructure/plans/archive/`
- Move: 4 plan files into archive locations

- [ ] **Step 1: Create archive directories**

```bash
mkdir -p docs/archive/plans
mkdir -p systems/enterprise-admin/infrastructure/plans/archive
```

- [ ] **Step 2: Move superpowers plan to docs/archive**

```bash
git mv docs/superpowers/plans/2026-05-16-phase-6.3-design-system.md \
       docs/archive/plans/2026-05-16-phase-6.3-design-system.md
```

- [ ] **Step 3: Move infrastructure plan files to archive**

```bash
git mv "systems/enterprise-admin/infrastructure/plans/20260302_pharmacy_management_features_design.md" \
       "systems/enterprise-admin/infrastructure/plans/archive/20260302_pharmacy_management_features_design.md"

git mv "systems/enterprise-admin/infrastructure/plans/20260304_phase7_analytics_plan.md" \
       "systems/enterprise-admin/infrastructure/plans/archive/20260304_phase7_analytics_plan.md"

git mv "systems/enterprise-admin/infrastructure/plans/20260514_design_system_pos_roadmap.md" \
       "systems/enterprise-admin/infrastructure/plans/archive/20260514_design_system_pos_roadmap.md"
```

- [ ] **Step 4: Verify moves**

```bash
ls docs/archive/plans/
ls systems/enterprise-admin/infrastructure/plans/archive/
ls systems/enterprise-admin/infrastructure/plans/
```

Expected:
- `docs/archive/plans/` contains the Phase 6.3 plan
- `infrastructure/plans/archive/` contains 3 files
- `infrastructure/plans/` is now empty (no files, only the archive/ subdir)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(archive): move completed plan files to archive directories"
```

---

## Task 7: Move startup_template_pack to business/templates

**Files:**
- Create: `business/templates/` (directory)
- Move: `startup_template_pack/` → `business/templates/`

- [ ] **Step 1: Create business directory and move**

```bash
mkdir -p business
git mv startup_template_pack business/templates
```

- [ ] **Step 2: Verify**

```bash
ls business/templates/ | head -5
ls startup_template_pack 2>/dev/null && echo "ERROR: old dir still exists" || echo "OK: old dir gone"
```

Expected: Files listed under `business/templates/`, "OK: old dir gone"

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore(structure): move startup_template_pack to business/templates"
```

---

## Task 8: Delete stale root files

**Files:**
- Delete: `implementation_plan.md.resolved`
- Delete: `AI_CONTEXT.md`

- [ ] **Step 1: Delete stale files**

```bash
git rm implementation_plan.md.resolved
git rm AI_CONTEXT.md
```

- [ ] **Step 2: Verify**

```bash
ls implementation_plan.md.resolved 2>/dev/null && echo "ERROR: still exists" || echo "OK: deleted"
ls AI_CONTEXT.md 2>/dev/null && echo "ERROR: still exists" || echo "OK: deleted"
```

Expected: Both show "OK: deleted"

- [ ] **Step 3: Commit**

```bash
git commit -m "chore(cleanup): remove stale implementation_plan.md.resolved and AI_CONTEXT.md (replaced by CLAUDE.md)"
```

---

## Task 9: Update ROADMAP and final verification

**Files:**
- Modify: `systems/enterprise-admin/ROADMAP.md`

- [ ] **Step 1: Add architecture cleanup phase to ROADMAP**

In `systems/enterprise-admin/ROADMAP.md`, after the Phase 7.6 section and before Phase 8, insert:

```markdown
## Phase 7.7: Project Architecture Cleanup (架構整頓)
**目標：降低 AI 上下文噪音，建立可導航的 monorepo 結構，讓人與 AI 都能快速定向。**

- [x] **ARCH-01**: 建立 `CLAUDE.md` — Claude Code 原生上下文，替換過期的 `AI_CONTEXT.md`。
- [x] **ARCH-02**: 重寫根目錄 `README.md` — 含架構總覽、技術棧、快速啟動、文件索引。
- [x] **ARCH-03**: 建立 `systems/enterprise-admin/README.md` — 系統層入口說明。
- [x] **ARCH-04**: 建立 `docs/architecture.md` — 系統邊界圖、資料流、ADR 索引。
- [x] **ARCH-05**: 強化 `.aiignore` — 排除 `business/`、`docs/archive/`、`plans/archive/`。
- [x] **ARCH-06**: 封存已完成的計畫檔案至 `docs/archive/` 和 `infrastructure/plans/archive/`。
- [x] **ARCH-07**: 搬移 `startup_template_pack/` → `business/templates/`（商業文件獨立管理）。
- [x] **ARCH-08**: 刪除根目錄殘骸（`implementation_plan.md.resolved`、`AI_CONTEXT.md`）。

---
```

- [ ] **Step 2: Final structure verification**

```bash
# Verify key new files exist
test -f CLAUDE.md && echo "✓ CLAUDE.md" || echo "✗ CLAUDE.md MISSING"
test -f docs/architecture.md && echo "✓ docs/architecture.md" || echo "✗ MISSING"
test -f systems/enterprise-admin/README.md && echo "✓ system README" || echo "✗ MISSING"

# Verify stale files gone
test -f AI_CONTEXT.md && echo "✗ AI_CONTEXT.md still exists" || echo "✓ AI_CONTEXT.md deleted"
test -f implementation_plan.md.resolved && echo "✗ still exists" || echo "✓ deleted"

# Verify archives populated
ls docs/archive/plans/ && echo "✓ docs archive has files"
ls systems/enterprise-admin/infrastructure/plans/archive/ && echo "✓ infra archive has files"

# Verify business dir
ls business/templates/ | head -3 && echo "✓ business/templates populated"

# Git status should be clean
git status --short
```

Expected: All checks pass, `git status` shows no untracked noise.

- [ ] **Step 3: Commit ROADMAP**

```bash
git add systems/enterprise-admin/ROADMAP.md
git commit -m "docs(roadmap): add Phase 7.7 architecture cleanup as completed"
```

- [ ] **Step 4: Push**

```bash
git push
```

---

## Self-Review

**Spec coverage:**
- ✅ ARCH-01: Task 1 (CLAUDE.md)
- ✅ ARCH-02: Task 2 (README.md rewrite)
- ✅ ARCH-03: Task 3 (enterprise-admin README)
- ✅ ARCH-04: Task 4 (architecture.md)
- ✅ ARCH-05: Task 5 (.aiignore)
- ✅ ARCH-06: Task 6 (archive plans)
- ✅ ARCH-07: Task 7 (startup_template_pack move)
- ✅ ARCH-08: Task 8 (delete stale files)
- ✅ ROADMAP update: Task 9

**Placeholder scan:** No TBD, no TODO, all file contents are complete.

**No code changed:** Zero `.ts`, `.tsx`, `.css`, `.prisma` files touched.
