# RBAC 權限與 Middleware 實作規範

## RBAC 運作流程

```
HTTP Request
    │
    ▼
setTenantContext          → 建立 AsyncLocalStorage 租戶上下文
    │
    ▼
authMiddleware            → 驗證 Authorization: Bearer <token>
    │  verifyAccessToken(token)                  // 驗簽名與過期時間
    │  prisma.user.findUnique(...)               // 載入 user 狀態
    │  user.userRoles → role.rolePermissions     // 展開所有角色的所有權限
    │  req.user = { userId, email, permissions } // 掛載到 req
    │  permissions 格式：["read:users", "create:orders", ...]
    │
    ▼
requirePermission('action:resource')  ← RBAC 守衛
    │  檢查 req.user.permissions.includes(permission)
    │  ✅ 通過 → next()
    │  ❌ 失敗 → 403 { code: 'FORBIDDEN', message: 'Missing required permission: ...' }
    │
    ▼
validate(...)             → Zod 驗證請求格式
    │
    ▼
controller handler        → 業務邏輯
```

### 關鍵實作細節

- **權限去重**：`authMiddleware` 使用 `new Set(permissions)` 去重，避免使用者同時擁有多個角色時重複計算。
- **permissions 在 JWT 驗證時即時從 DB 載入**，不存在 JWT payload 中，確保權限異動立即生效（無需等待 token 過期）。
- `requirePermission` 為 **curried function**，回傳 Express middleware，可直接放在路由定義中間件鏈中。

### 路由使用範例

```typescript
// 單一 permission
router.get('/', authMiddleware, requirePermission('read:users'), controller.list);

// 整個 router 共用同一 permission（在 router.use 層級設定）
router.use(authMiddleware);
router.use(requirePermission('read:analytics'));
```

---

## Permission 命名規則

格式：`action:resource`（全小寫，resource 使用 snake_case）

### action 前綴語義

| action | 語義 | 適用場景 |
|--------|------|----------|
| `read` | 唯讀查詢 | GET 列表、GET 詳情 |
| `create` | 新建資源 | POST |
| `update` | 修改資源 | PUT / PATCH |
| `delete` | 刪除或停用 | DELETE / soft-delete |
| `manage` | 完整控制（含寫入操作） | 複雜業務流程（結帳、班次管理等） |

### 現有 Permission 完整清單

以下清單與 `prisma/seed.ts` 的 `PERMISSIONS` 陣列同步：

| Permission | 說明 |
|-----------|------|
| `read:users` | 查看使用者列表與詳情 |
| `create:users` | 新增使用者 |
| `update:users` | 修改使用者資料 |
| `delete:users` | 停用 / 刪除使用者 |
| `read:roles` | 查看角色與權限設定 |
| `create:roles` | 新增角色 |
| `update:roles` | 修改角色權限 |
| `delete:roles` | 刪除自訂角色 |
| `read:audit_logs` | 查看稽核日誌 |
| `read:crm` | 查看客戶與互動記錄 |
| `manage:crm` | 管理客戶資料（新增、編輯、互動） |
| `read:products` | 查看商品與庫存 |
| `create:products` | 新增商品 / SKU |
| `update:products` | 修改商品資訊 |
| `read:suppliers` | 查看供應商 |
| `create:suppliers` | 新增供應商 |
| `update:suppliers` | 修改供應商資訊 |
| `read:dashboard` | 查看營運 KPI 儀表板 |
| `read:orders` | 查看訂單列表與詳情 |
| `create:orders` | 建立新訂單 |
| `update:orders` | 更新訂單狀態與付款 |
| `read:analytics` | 查看 KPI 分析指標 |
| `manage:analytics` | 管理 KPI 設定 |
| `read:reports` | 查看財務與銷售報表 |
| `manage:reports` | 管理報表設定 |
| `read:shifts` | 查看班次記錄 |
| `manage:shifts` | 開班 / 關班管理 |
| `read:inventory` | 查看庫存 |
| `manage:inventory` | 管理庫存（調撥、盤點） |
| `read:product_batches` | 查看商品批次 |
| `manage:product_batches` | 管理商品批次 |
| `read:daily_settlements` | 查看每日結算 |
| `manage:daily_settlements` | 確認每日結算 |
| `manage:pos` | POS 結帳與 POS 操作管理 |

---

## 多租戶隔離機制

### Prisma 自動注入 tenantId

`src/lib/prisma.ts` 中的 `prisma` 是透過 `$extends` 包裝的 Prisma Client，**攔截所有 DB 操作**，從 `AsyncLocalStorage` 讀取 `tenantId` 並自動注入：

| 操作類型 | 注入位置 |
|---------|---------|
| `findUnique`, `findMany`, `findFirst`, `count`, `aggregate`, `groupBy` | `args.where.tenantId = tenantId` |
| `create`, `createMany` | `args.data.tenantId = tenantId`（或 data 陣列每個元素） |
| `update`, `updateMany`, `upsert`, `delete`, `deleteMany` | `args.where.tenantId = tenantId` |

### MappedModels（受多租戶隔離的 Model 列表）

只有以下 Model 會觸發 tenantId 自動注入，其餘 Model（如 `Tenant`, `Permission`, `RolePermission` 等）不受影響：

```typescript
const MappedModels = [
    'User',
    'Role',
    'AuditLog',
    'Customer',
    'Tag',
    'Interaction',
    'Supplier',
    'ProductCategory',
    'Product',
    'Order',
    'InventoryTransaction',
    'Expense',
] as const;
```

**新增 Model 時**：若該 Model 含有 `tenantId` 欄位，必須同步將其加入 `MappedModels`，否則資料隔離失效。

### Service 層必須呼叫 `requireTenantId()`

在任何需要明確取得 `tenantId` 的 Service 方法中（例如需要傳入原始 `tenantId` 參數的場景），必須使用：

```typescript
import { requireTenantId } from '../../lib/tenant.context';

const tenantId = requireTenantId(); // 若上下文不存在，直接拋出錯誤，不會靜默失敗
```

**正確用途**：手動組 raw query、建立 DB 記錄時需要明確傳入 `tenantId`（但 Prisma ORM 操作通常不需要，因為已自動注入）。

目前已使用 `requireTenantId()` 的 Service 包括：
- `modules/crm/crm.service.ts`
- `modules/roles/roles.service.ts`
- `modules/shifts/shifts.service.ts`
- `modules/pos/checkout.service.ts`
- `modules/pos/receipt.service.ts`
- `modules/product-batches/product-batches.service.ts`
- `modules/daily-settlements/daily-settlements.service.ts`

---

## 新增 Permission 的完整步驟

新功能需要一個新的 permission 時，**必須按照以下步驟全部完成**，缺一不可：

### 步驟 1：更新 Prisma Schema（若需要新 Model）

若此 permission 對應全新的資源且有新的 DB Model，在 `prisma/schema.prisma` 新增 Model 並執行：

```bash
npx prisma migrate dev --name add_<resource>_model
```

### 步驟 2：在 seed.ts 的 PERMISSIONS 陣列新增

開啟 `prisma/seed.ts`，在 `PERMISSIONS` 陣列對應分類下新增：

```typescript
// My New Feature（Phase X）
{ action: 'read',   resource: 'my_feature', description: '查看 XXX' },
{ action: 'manage', resource: 'my_feature', description: '管理 XXX' },
```

命名規則：
- `resource` 使用 **snake_case**（例如 `product_batches`，非 `productBatches`）
- `action` 從 `read` / `create` / `update` / `delete` / `manage` 擇一
- `description` 用英文，說明權限允許的操作

### 步驟 3：確認 SUPER_ADMIN 自動獲得新 permission

`seed.ts` 的步驟 3 會將 `createdPermissions` 中**所有** permission 指派給 `SUPER_ADMIN` 角色，因此只要正確加入 `PERMISSIONS` 陣列即可，**不需要手動指派給 SUPER_ADMIN**。

### 步驟 4：重新執行 seed

```bash
npx ts-node prisma/seed.ts
# 或透過 npm script：
npm run db:seed
```

### 步驟 5：在路由中套用新 permission

```typescript
router.get('/', authMiddleware, requirePermission('read:my_feature'), controller.list);
router.post('/', authMiddleware, requirePermission('manage:my_feature'), controller.create);
```

### 步驟 6：若新 Model 含 tenantId，更新 MappedModels

開啟 `src/lib/prisma.ts`，在 `MappedModels` 陣列新增新 Model 名稱（PascalCase，對應 Prisma Model 名稱）。

---

## 常見錯誤對照

| 錯誤訊息 | 原因 | 解法 |
|---------|------|------|
| `401 UNAUTHORIZED: Missing or invalid authorization header` | 請求未帶 `Authorization: Bearer <token>` | 前端補上 header |
| `401 TOKEN_INVALID: Invalid or expired token` | JWT 已過期或簽名錯誤 | 重新登入取得新 token |
| `403 FORBIDDEN: Missing required permission: xxx:yyy` | 使用者角色缺少對應 permission | 在後台為角色指派正確 permission，或確認路由中的 permission 字串是否拼錯 |
| `[Security] Missing tenant context for operation X on Y` | Service 在沒有 tenant context 的情況下執行 DB 操作 | 確認操作是否在 `tenantContext.run()` 內，通常是 `setTenantContext` 沒有正確掛載 |
| `Tenant context missing. Ensure the operation is wrapped in tenantContext.run()` | 直接呼叫 `requireTenantId()` 但不在 request context 內 | 不要在 seed、cron、非 HTTP 上下文中呼叫需要 tenant context 的 service 方法 |
