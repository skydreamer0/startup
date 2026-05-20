# PharmaSaaS — Claude Code Context

## 專案結構
這是一個 monorepo。目前唯一的系統是 `systems/enterprise-admin/`。

## 你現在在做什麼
查看 `systems/enterprise-admin/ROADMAP.md` 了解目前進度和下一步。

## 重要規則
- Commits 用 Conventional Commits: `feat(scope): message`
- DB/API 命名用 snake_case；前端 Component 用 PascalCase
- 重大架構決策需新增 ADR：`systems/enterprise-admin/infrastructure/adr/`
- 金額目前用 Float，計劃在 Arch-Fix Phase 5 遷移到 Decimal（參考 ARCHITECTURE_HEALTH.md）
- **錯誤處理**：所有 Controller 錯誤必須用 `next(err)` 傳給 global error handler，禁止自己 try/catch + res.status(500)
- **資料獲取**：admin-ui 資料獲取必須用 TanStack Query，禁止 `useState + useEffect + api.xxx().then()`
- **型別安全**：禁止 `as any`（唯一例外：`lib/prisma.ts` 內部的 Prisma Extension，其他地方一律不得使用）
- **多租戶安全**：每次新增 Service 都必須呼叫 `requireTenantId()`（analytics.service.ts 是反面教材）
- **假數據禁令**：禁止在 UI 放 hardcoded 假數據（如 "+12.5%"），必須從 API 取得真實數據

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
- 開發標準：`systems/enterprise-admin/infrastructure/standards/`（含 code_style_pr、test_pyramid、observability）
- 錯誤處理規範：`systems/enterprise-admin/infrastructure/api/error_handling.md`
- 後端設定規範：`systems/enterprise-admin/infrastructure/backend/backend_config.md`
- RBAC 規範：`systems/enterprise-admin/infrastructure/backend/rbac_middleware.md`
- 架構健康報告：`systems/enterprise-admin/ARCHITECTURE_HEALTH.md`

## Agent skills

### Issue tracker

Issues live in GitHub Issues (`skydreamer0/startup`). See `docs/agents/issue-tracker.md`.

### Triage labels

Using the five canonical default label strings. See `docs/agents/triage-labels.md`.

### Domain docs

Multi-context layout — `CONTEXT-MAP.md` at root points to `systems/enterprise-admin/CONTEXT.md` with ADRs at `systems/enterprise-admin/infrastructure/adr/`. See `docs/agents/domain.md`.
