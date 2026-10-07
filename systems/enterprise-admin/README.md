# Enterprise Admin System

藥局 SaaS 企業後台，包含 RBAC、CRM、庫存、訂單、財務報表、數據分析。

## 目前進度

已完成既定產品與架構階段；目前只保留活 backlog 與延後決策。詳見 [ROADMAP.md](ROADMAP.md)。

## 本地開發

```bash
# 前置條件：Docker Desktop 執行中，Node.js 22（至少 22.12）
npm install --global npm@11.21.0 pnpm@10.34.6
pnpm install --frozen-lockfile

# 1. 啟動 PostgreSQL
docker-compose up -d postgres

# 2. 後端
cd backend
npm ci
npm run dev            # http://localhost:3000

# 3. 前端
cd ../admin-ui
pnpm run dev           # http://localhost:5173
```

預設帳號由 seed 資料建立，請參考 `backend/prisma/seed.ts`。

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
    └── standards/      工程標準與操作流程
```

## 測試

```bash
# 後端
cd backend && npm test

# 前端
cd admin-ui && pnpm test
```
