<div align="center">

# 💊 PharmaSaaS

**從一家藥局出發的營運工作台**

整合門市 POS、商品庫存、會員與營運報表，  
先把單店日常工作做好，再保留未來擴充的空間。

![React](https://img.shields.io/badge/React-19-61dafb?style=flat-square&logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?style=flat-square&logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-4169e1?style=flat-square&logo=postgresql&logoColor=white)
![Status](https://img.shields.io/badge/status-in%20development-f59e0b?style=flat-square)

[功能概覽](#-功能概覽) · [快速開始](#-快速開始) · [架構](#-架構) · [目前進度](#-目前進度) · [文件](#-文件)

</div>

---

## ✨ 為什麼做這個

收銀、收貨、查效期、找商品，都是同一間藥局每天會遇到的事。PharmaSaaS 以這些工作為中心，讓門市與後台共用資料，逐步減少重複建檔與人工對帳。

- 🧾 **門市接上後台**：POS 與管理介面各自專注操作情境，共用訂單、會員與庫存 API
- 📦 **從商品看到批次**：以商品、批號、效期與異動紀錄為基礎，往可追溯的收貨與出庫流程前進
- 🏪 **先服務一家店**：以店內共用主機為部署方向，保留既有權限與多租戶基礎，逐步評估擴充

## 🧩 功能概覽

下列功能已有程式實作；庫存與交易正確性、設備相容性及實店使用流程仍待驗收。

| 工作 | 現有功能 |
|---|---|
| 🛒 **門市收銀** | 員工登入、商品查找、購物車、掛單、折扣、結帳、拆分付款紀錄、退貨與收據 |
| 📦 **商品庫存** | 商品、分類、供應商、庫存異動、批號與效期、批次扣庫 |
| 👥 **會員經營** | 會員資料、標籤、互動與購買紀錄、客群分析、LINE 推播與分眾發送 |
| 📊 **日常營運** | 儀表板、訂單、費用、班次、日結、毛利、現金流及銷售排行 |
| 🔐 **管理基礎** | 使用者與角色、RBAC 權限、操作稽核、租戶方案存取控制、Excel／CSV 匯入匯出 |

<details>
<summary>整合範圍與目前限制</summary>

- LINE 整合需設定對應憑證；會計同步目前為 adapter 與 mock provider，QuickBooks／Xero 正式串接尚未完成
- 拆分付款是交易紀錄功能，尚不代表已串接刷卡或 LINE Pay 金流
- 已有離線佇列基礎，但結帳尚未接上離線入列，不能用作離線收銀
- TLS／憑證與正式環境設定仍待完成；電子發票串接延後

</details>

## 🗺️ 目前進度

**功能基礎已建立，實店驗收尚未完成。** 接下來的重點是資料可靠、收貨順手，以及店內每天都能穩定使用。最新範圍與驗收門檻見 [單店藥局整備追蹤 #37](https://github.com/skydreamer0/startup/issues/37)。

| 順序 | 下一步 |
|---|---|
| **先修正** | 庫存一致性、批次追溯、結帳重送與併發扣庫、金額對帳，以及掃碼查找與庫存更新 |
| **優先補上** | 有條碼／無條碼收貨、照片與單據 OCR 建檔草稿；保留原圖，由人工確認商品、批號與效期 |
| **接完整流程** | 庫位、部分收貨、調貨與處方出庫、待辦工作區；外盒 QR 與標籤列印依規格及真機驗證推進 |
| **落地到店內** | 專用主機＋Docker Compose、單一操作入口、啟動就緒檢查，以及資料庫與影像成套備份還原 |

以上均為待實作或待驗收項目。OCR／本地 AI 與處方照片辨識尚未啟用；處方流程須有藥師覆核。Mac mini 為候選主機，得力標籤機相容性及外盒 QR 規格仍待確認。

## 🏗️ 架構

兩個操作介面，共用一套 API 與資料庫；目前維持模組化單體架構。

```text
門市 POS   pos-ui   ─┐
                    ├── Express API ── Prisma ── PostgreSQL
管理後台   admin-ui ─┘   backend
```

前端使用 **React 19／Vite 6**，後端使用 **Express 5／Prisma 6**。程式集中於 `systems/enterprise-admin`；前端及 `packages/types` 由 pnpm workspace 管理，Backend 保留獨立 npm 安裝邊界。[查看依賴管理規則](systems/enterprise-admin/infrastructure/standards/dependency_management.md)

## 🚀 快速開始

需要 **Node.js 22（至少 22.12）、npm 11.21.0、pnpm 10.34.6、Docker Compose**，以及此儲存庫的存取權限。目前使用開發環境啟動流程，完整設定與指令如下。

<details>
<summary><strong>展開本機設定與啟動步驟</strong></summary>

以下指令使用 Bash；Windows 可使用 Git Bash 或 WSL。

**1. 取得專案與啟動資料庫**

```bash
git clone https://github.com/skydreamer0/startup.git
cd startup/systems/enterprise-admin
npm install --global npm@11.21.0 pnpm@10.34.6
npm --prefix backend ci
pnpm install --frozen-lockfile
docker compose up -d postgres
```

**2. 設定後端環境變數**

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

**3. 初始化本機資料庫**

以下指令仍從 `systems/enterprise-admin` 執行。請使用可重建的本機開發資料庫，並先確認 PostgreSQL 已就緒。

```bash
npm --prefix backend run db:generate
npm --prefix backend run db:migrate
npm --prefix backend run db:seed
```

開發用帳號與 POS 員工代碼由 [`backend/prisma/seed.ts`](systems/enterprise-admin/backend/prisma/seed.ts) 建立。Seed 僅供開發及測試，請勿將範例帳號、密碼或資料直接用於正式環境；`.env` 不應提交至 Git。

**4. 啟動服務**

開啟三個終端機，皆切換至 `systems/enterprise-admin`，分別執行：

```bash
npm --prefix backend run dev          # API       http://localhost:3000
pnpm --filter admin-ui run dev         # 管理後台  http://localhost:5173
pnpm --filter pos-ui run dev           # 門市 POS  http://localhost:5174
```

API 基底路徑為 `/api/v1/admin`，健康檢查位於 `http://localhost:3000/health`。正式環境的遷移、備份與部署流程請見 [Production Runbook](systems/enterprise-admin/infrastructure/standards/production_runbook.md)；目前 Compose 含開發用設定，部署前須完成憑證、機密與資料庫網路設定。


</details>

<details>
<summary>建置、測試與驗證指令</summary>

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


</details>

## 📚 文件

| 想了解什麼 | 從這裡開始 |
|---|---|
| **現在要做什麼** | [單店整備與驗收 #37](https://github.com/skydreamer0/startup/issues/37) · [既有工程 Roadmap](systems/enterprise-admin/ROADMAP.md) |
| **程式在哪裡** | [系統與模組導覽](systems/enterprise-admin/CONTEXT.md) · [架構決策 ADR](systems/enterprise-admin/infrastructure/adr/) |
| **資料如何串接** | [API 規格](systems/enterprise-admin/infrastructure/api/api_spec.md) · [Prisma Schema](systems/enterprise-admin/backend/prisma/schema.prisma) |
| **如何部署與維護** | [Production Runbook](systems/enterprise-admin/infrastructure/standards/production_runbook.md) |
| **如何參與開發** | [AGENTS.md](AGENTS.md) · [Git 工作流程](systems/enterprise-admin/infrastructure/standards/git_workflow.md) · [PR 範本](.github/pull_request_template.md) |

功能與驗收進度以目前追蹤議題為準；既有 Roadmap 的歷史完成紀錄不代表實店已驗收。
