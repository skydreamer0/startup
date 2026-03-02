# ADR-007: 開發環境全面遷移至 PostgreSQL

| 項目 | 內容 |
|---|---|
| **狀態** | ✅ Accepted |
| **日期** | 2026-03-02 |
| **關聯** | ADR-001 (Relational Database Choice), Phase 5.5 DEBT-13 |

## Context

專案初期為加速開發，使用 SQLite 作為開發與測試資料庫（`file:./dev.db`），但架構文件（`system_architecture.md`）與 ADR-001 均指定 PostgreSQL 為生產環境主資料庫。此落差導致：

1. **行為不一致**：SQLite 不支援 `ENUM`、有限的 `ALTER TABLE`、不同的 `JSONB` 行為。
2. **CI 覆蓋不足**：CI 測試在 SQLite 上通過，不代表 PostgreSQL 上也能通過。
3. **Prisma Migration 不可攜**：SQLite migration 無法直接套用至 PostgreSQL。

## Decision

- Prisma `datasource.provider` 從 `sqlite` 改為 `postgresql`。
- 開發環境使用 `docker-compose.yml` 中的 PostgreSQL 15 容器。
- CI 使用 GitHub Actions 的 PostgreSQL Service Container。
- 刪除所有 SQLite migration 和 `.db` 檔案，重新建立 PostgreSQL migration。

## Consequences

### 正面
- Dev/CI/Prod 100% 一致，可使用 `@db.Text`、`@db.JsonB`、`ENUM` 等 PG 功能。
- Migration 可直接套用至 Staging/Production。

### 負面
- 開發者需在本機安裝 Docker 以啟動 PostgreSQL。
- 需執行 `docker compose up -d postgres` 後才能開發。

## 開發者須知

```bash
# 啟動本機 PostgreSQL
cd systems/enterprise-admin
docker compose up -d postgres

# 建立 Migration
cd backend
npx prisma migrate dev --name init

# Seed
npm run db:seed
```
