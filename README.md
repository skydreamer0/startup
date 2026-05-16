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
