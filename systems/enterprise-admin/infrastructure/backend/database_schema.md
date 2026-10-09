# 32b_Database Schema Definition

Current batch audit persistence is defined by Prisma `ProductBatchChange`, ADR-020/021
and migration `20261009120000_product_batch_changes`. It is append-only, has no
updated/deleted fields, and restricts tenant/product/batch/actor parent identity
changes or deletion. Its JSONB snapshots and INITIAL_RELEASE nonexistence contract
are documented in `../api/batch_field_audit.md`. No existing stock/history is backfilled.

## 1. 概覽與選型 (Overview & Tech Stack)
- **Primary Database**: PostgreSQL 15+ (符合企業級關聯式查詢與事務 ACID 需求)
- **Cache / Session Store**: Redis 7+ (用於 Token Whitelist/Blacklist、Session 緩存、熱點報表數據)
- **ORM / Query Builder**: Prisma ORM 或 TypeORM (推薦 Prisma以獲得完整 Type-Safety)
- **命名規範**: 
  - Table / Entity: `snake_case` (小寫單數或複數依團隊規範，此處採小寫複數如 `users`)
  - Column: `snake_case` 
  - Primary Key: `id` (使用 `UUIDv4` 或 `ULID` 以防猜測與分散式擴展)

## 2. 核心共同欄位設計 (Common Fields)
所有業務資料表皆須包含以下審計(Audit)欄位，實作 Soft Delete：
- `created_at` (TIMESTAMP WITH TIME ZONE, DEFAULT NOW())
- `updated_at` (TIMESTAMP WITH TIME ZONE, DEFAULT NOW() ON UPDATE)
- `deleted_at` (TIMESTAMP WITH TIME ZONE, NULLABLE) - 用於軟刪除
- `created_by` (UUID, FK to `users.id`)
- `updated_by` (UUID, FK to `users.id`)

## 3. 核心領域模型 (Core Domains)

### 3.1 身份與權限驗證 (IAM & RBAC)

**Table: `users` (後台管理員/使用者)**
| Column Name             | Type         | Constraints                | Description                                         |
| ----------------------- | ------------ | -------------------------- | --------------------------------------------------- |
| `id`                    | UUID         | PK                         | 唯一識別碼                                          |
| `email`                 | VARCHAR(255) | UNIQUE, NOT NULL           | 登入帳號/信箱                                       |
| `password_hash`         | VARCHAR(255) | NOT NULL                   | 雜湊後密碼 (Argon2 / bcrypt)                        |
| `full_name`             | VARCHAR(100) | NOT NULL                   | 顯示名稱                                            |
| `status`                | VARCHAR(20)  | NOT NULL, DEFAULT 'active' | 狀態: `active`, `suspended`, `pending_verification` |
| `last_login_at`         | TIMESTAMPTZ  | NULL                       | 最後登入時間                                        |
| `failed_login_attempts` | INT          | DEFAULT 0                  | 登入失敗次數 (防暴力破解)                           |
| `totp_secret`           | VARCHAR      | NULL                       | 2FA (MFA) 密鑰，企業級標配                          |

**Table: `roles` (角色)**
| Column Name   | Type         | Constraints      | Description                                   |
| ------------- | ------------ | ---------------- | --------------------------------------------- |
| `id`          | UUID         | PK               |                                               |
| `name`        | VARCHAR(50)  | UNIQUE, NOT NULL | 角色代號 (如 `SUPER_ADMIN`, `CONTENT_EDITOR`) |
| `description` | VARCHAR(255) | NULL             | 角色說明                                      |
| `is_system`   | BOOLEAN      | DEFAULT FALSE    | 系統內建角色，不可刪除                        |

**Table: `permissions` (權限節點)**
定義到極細顆粒度 (Fine-grained)，對應 API Route 或 UI Component。
| Column Name   | Type         | Constraints | Description                                        |
| ------------- | ------------ | ----------- | -------------------------------------------------- |
| `id`          | UUID         | PK          |                                                    |
| `action`      | VARCHAR(50)  | NOT NULL    | 動作類型 (如 `read`, `write`, `delete`, `approve`) |
| `resource`    | VARCHAR(50)  | NOT NULL    | 資源名稱 (如 `users`, `products`, `orders`)        |
| `description` | VARCHAR(255) | NULL        | 描述 (如 "Create new products")                    |
*(需有 UNIQUE CONSTRAINT: `action` + `resource`)*

**Table: `role_permissions` (M:N 關聯)**
| Column Name     | Type | Constraints                | Description |
| --------------- | ---- | -------------------------- | ----------- |
| `role_id`       | UUID | PK, FK to `roles.id`       |             |
| `permission_id` | UUID | PK, FK to `permissions.id` |             |

**Table: `user_roles` (M:N 關聯)**
支援單一帳號多重角色。
| Column Name | Type | Constraints          | Description |
| ----------- | ---- | -------------------- | ----------- |
| `user_id`   | UUID | PK, FK to `users.id` |             |
| `role_id`   | UUID | PK, FK to `roles.id` |             |

---

### 3.2 系統安全與審計 (Security & Auditing)

**Table: `audit_logs` (操作日誌)**
用於法規遵循(Compliance)與行為追蹤，寫入後不可改(Immutable)。高流量可考慮拋入 Elasticsearch 或 MongoDB。
| Column Name     | Type        | Constraints                | Description                        |
| --------------- | ----------- | -------------------------- | ---------------------------------- |
| `id`            | UUID        | PK                         |                                    |
| `user_id`       | UUID        | FK to `users.id`, NULLABLE | 觸發者 (若為系統自動觸發則為 NULL) |
| `action`        | VARCHAR(50) | NOT NULL                   | 動作 (如 `UPDATE_USER_ROLE`)       |
| `resource_type` | VARCHAR(50) | NOT NULL                   | 變更的資源類型 (如 `users` Table)  |
| `resource_id`   | UUID        | NOT NULL                   | 被變更的紀錄 ID                    |
| `old_value`     | JSONB       | NULL                       | 變更前資料                         |
| `new_value`     | JSONB       | NULL                       | 變更後資料                         |
| `ip_address`    | INET        | NULL                       | 來源 IP                            |
| `user_agent`    | VARCHAR     | NULL                       | 瀏覽器或 Client 資訊               |
| `created_at`    | TIMESTAMPTZ | DEFAULT NOW()              | 不允許 update/delete               |

## 4. 索引策略 (Indexing Strategy)
- **Primary / Foreign Keys**: 資料庫通常自動建立，確認關聯查詢效能。
- **Unique Indexes**: `users.email`, `roles.name`, `permissions(action, resource)`。
- **搜尋索引 (B-Tree)**: `audit_logs.created_at`, `audit_logs.user_id` (確保後台查詢日誌效能)。
- **複合索引 (Composite)**: 若有常見過濾條件，例如 `users(status, created_at)`。

## 5. 擴充建議
1. 若支援多租戶 (Multi-tenant B2B 架構)，所有主要資源表皆須加入 `tenant_id` 欄位並建立 Row-Level Security (RLS)。
2. 若涉及複雜組織架構，可導入 `departments` 或 `groups` 表，建立 User -> Group -> Role 的層級繼承授權模組。

## 6. 銷售批次過帳切片（2026-10-06 / ADR-014）

實際 schema 以 `backend/prisma/schema.prisma` 為準；migration 為 `20261006090000_sale_batch_allocations`。

- `product_batches.status` 是 `BatchStockStatus`：`RELEASED`、`QUARANTINE`、`BLOCKED`。既有／未指定批次預設隔離；數量原值保留，需確認後明確釋出。
- `sale_batch_allocations` 保存 tenant、order、order item、product、batch、OUT movement、正整數 quantity、出庫時 expiry snapshot 與 created_at。複合外鍵防止跨租戶、跨商品或錯誤訂單明細連結；一個明細對同一批次只能分攤一次。
- allocation 引用的批次／訂單／明細／movement 採 delete restrict。批次數量歸零仍保留來源追溯；目前不開放 allocation 更正／刪除 API。
- POS 與一般訂單在同一 transaction 寫入商品與批次扣量、訂單、movement 和 allocation。`Product.stockQuantity` 仍代表總實體 projection，包含不可售批次，不是 released availability。
- 舊單不 backfill 不明來源。空 allocation 是「未能追溯」，不可補造 lot。完整 immutable reversal、multi-bin、全 writer 一致性與重建仍在 #29。
- `backend/prisma/diagnostics/preflight-sales-stock.sql` 是只讀的商品／批次差異報表，兼容前後 schema。差異須盤點確認，不能用任意批次補平。
