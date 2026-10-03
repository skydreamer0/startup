# PharmaSaaS

**藥局營運管理平台，整合企業後台與獨立 POS。**

PharmaSaaS 將會員、商品庫存、銷售訂單與營運報表整合於同一套 API，供管理人員與門市收銀人員使用。專案採 TypeScript monorepo，包含兩個 React 應用程式、Express 後端與共用型別，並具備多租戶、角色權限及操作稽核機制。

[功能概覽](#功能概覽) · [快速開始](#快速開始) · [專案結構](#專案結構) · [文件](#文件)

## 功能概覽

| 領域 | 目前實作 |
| --- | --- |
| **企業後台** | 營運儀表板、使用者與角色管理、RBAC 權限、操作稽核、租戶方案存取控制 |
| **會員 CRM** | 會員資料、標籤、互動紀錄、購買紀錄與客群分析 |
| **商品與庫存** | 商品、分類、供應商、庫存異動、批號與效期管理，以及 FEFO 批次扣庫 |
| **門市 POS** | 員工登入、商品查找、購物車、掛單、折扣、結帳與拆分付款紀錄、退貨、收據及顧客顯示畫面 |
| **營運與報表** | 訂單、費用、班次與日結，毛利、現金流、銷售排行及商品／CRM 分析 |
| **資料與訊息整合** | Excel／CSV 匯入匯出、LINE 訊息推播與分眾發送；會計同步提供 adapter 與 mock provider |

### 專案狀態

依 [Roadmap](systems/enterprise-admin/ROADMAP.md)，既定產品與架構階段已完成；正式部署與外部整合仍有以下界線：

- QuickBooks／Xero 的正式 OAuth 與 SDK 串接尚未完成
- TLS／憑證設定須待部署主機與 DNS 確定；電子發票串接仍延後
- POS 已有離線佇列基礎，但結帳流程尚未接上離線入列，不應視為可離線收銀
- 拆分付款為交易紀錄功能，不代表已串接刷卡或 LINE Pay 金流

## 專案結構

目前啟用的系統集中於 `systems/enterprise-admin`。Admin UI 與 POS UI 各自建置、共用後端 API；POS 已有獨立應用程式。

```text
startup/
├── docs/                            # 專案文件與導覽
├── scripts/                         # 儲存庫檢查工具
└── systems/enterprise-admin/         # pnpm workspace
    ├── admin-ui/                    # 企業管理後台
    ├── pos-ui/                      # 門市 POS
    ├── backend/                     # Express API、Prisma schema 與 migrations
    ├── packages/types/              # @pharmasaas/types 共用型別
    ├── infrastructure/              # ADR、API 規格與工程標準
    ├── nginx/                       # 反向代理與 TLS 範本
    └── docker-compose.yml           # PostgreSQL 與容器部署骨架
```

| 層級 | 技術 |
| --- | --- |
| 前端 | React 19、Vite 6、TypeScript、Tailwind CSS 4、TanStack Query；POS 使用 Zustand |
| 後端 | Express 5、Prisma 6、Zod、JWT、Argon2 |
| 資料庫 | PostgreSQL 15 |
| 測試與交付 | Vitest、Testing Library、Supertest、Playwright、GitHub Actions、Docker Compose、Nginx |

## 快速開始

### 1. 準備環境

需要 Node.js 20+、pnpm 10、Docker Compose，以及此儲存庫的存取權限。以下指令使用 Bash；Windows 可使用 Git Bash 或 WSL。

```bash
git clone https://github.com/skydreamer0/startup.git
cd startup/systems/enterprise-admin
pnpm install --frozen-lockfile
docker compose up -d postgres
```

### 2. 設定後端環境變數

建立 `backend/.env`，替換以下佔位符。資料庫帳號、密碼須與 [Compose 的 postgres 設定](systems/enterprise-admin/docker-compose.yml) 一致；本機連線埠為 **5433**。

```dotenv
DATABASE_URL="postgresql://<user>:<password>@localhost:5433/enterprise_admin"
JWT_ACCESS_SECRET="<replace-with-a-random-secret-at-least-32-characters>"
JWT_REFRESH_SECRET="<replace-with-a-different-random-secret-at-least-32-characters>"
NODE_ENV=development
PORT=3000
CORS_ORIGIN=http://localhost:5173
```

兩組 JWT secret 應分別產生。可各執行一次以下指令，將輸出填入對應欄位：

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

完整設定以 [`backend/src/config/env.ts`](systems/enterprise-admin/backend/src/config/env.ts) 為準。LINE 憑證為選填；未設定時不啟用 LINE 整合。兩個前端的開發伺服器皆已將 `/api` 代理至後端。

### 3. 初始化本機資料庫

以下指令仍從 `systems/enterprise-admin` 執行。請使用可重建的本機開發資料庫，並先確認 PostgreSQL 已就緒。

```bash
pnpm --filter startup-backend run db:generate
pnpm --filter startup-backend run db:migrate
pnpm --filter startup-backend run db:seed
```

開發用帳號與 POS 員工代碼由 [`backend/prisma/seed.ts`](systems/enterprise-admin/backend/prisma/seed.ts) 建立。Seed 僅供開發及測試，請勿將範例帳號、密碼或資料直接用於正式環境；`.env` 不應提交至 Git。

### 4. 啟動服務

開啟三個終端機，皆切換至 `systems/enterprise-admin`，分別執行：

```bash
pnpm --filter startup-backend run dev  # API       http://localhost:3000
pnpm --filter admin-ui run dev         # 管理後台  http://localhost:5173
pnpm --filter pos-ui run dev           # 門市 POS  http://localhost:5174
```

API 基底路徑為 `/api/v1/admin`，健康檢查位於 `http://localhost:3000/health`。正式環境的遷移、備份與部署流程請見 [Production Runbook](systems/enterprise-admin/infrastructure/standards/production_runbook.md)；目前 Compose 含開發用設定，部署前須完成憑證、機密與資料庫網路設定。

## 開發與驗證

以下指令從 `systems/enterprise-admin` 執行：

| 工作 | 指令 |
| --- | --- |
| 建置各應用程式 | `pnpm run build` |
| 執行套件測試 | `pnpm run test` |
| 執行現有 lint 檢查 | `pnpm run lint` |
| 檢查共用型別 | `pnpm --filter @pharmasaas/types run typecheck` |
| 安裝 POS E2E 瀏覽器 | `pnpm --filter pos-ui run test:e2e:install` |
| 執行 POS E2E | `pnpm --filter pos-ui run test:e2e` |

後端整合測試需要已初始化的 PostgreSQL。POS E2E 另需已安裝的 Chromium，以及運行中的後端與 POS 開發伺服器。詳細範圍見 [測試策略](systems/enterprise-admin/infrastructure/standards/test_pyramid.md) 與 [CI 設定](.github/workflows/ci.yml)。

## 文件

| 文件 | 用途 |
| --- | --- |
| [Roadmap](systems/enterprise-admin/ROADMAP.md) | 目前進度、待辦與延後決策 |
| [系統導覽](systems/enterprise-admin/CONTEXT.md) | 系統邊界與各模組入口 |
| [架構決策 ADR](systems/enterprise-admin/infrastructure/adr/) | 多租戶、獨立 POS、會計 adapter 與部署決策 |
| [API 規格](systems/enterprise-admin/infrastructure/api/api_spec.md) | REST API 契約 |
| [Prisma Schema](systems/enterprise-admin/backend/prisma/schema.prisma) | 資料模型與關聯 |
| [Production Runbook](systems/enterprise-admin/infrastructure/standards/production_runbook.md) | 部署、遷移、回復、備份與維運 |
| [工程標準](systems/enterprise-admin/infrastructure/standards/) | 程式風格、測試、Git 與審查流程 |

## 參與開發

開始前閱讀 [AGENTS.md](AGENTS.md) 與 [Git 工作流程](systems/enterprise-admin/infrastructure/standards/git_workflow.md)。採用短週期分支與 Conventional Commits；功能變動須同步更新 Roadmap，架構變動須補充 ADR。提交 PR 時請遵循 [PR 範本](.github/pull_request_template.md)，並清楚列出驗證結果與未完成項目。
