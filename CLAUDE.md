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
