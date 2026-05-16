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
npm install
npm run dev            # http://localhost:3000

# 3. 前端
cd ../admin-ui
npm install
npm run dev            # http://localhost:5173
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
    └── plans/archive/  已完成的實作計畫（封存）
```

## 測試

```bash
# 後端
cd backend && npm test

# 前端
cd admin-ui && npx vitest run
```
