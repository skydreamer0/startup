# 33a_RESTful API Spec (Enterprise Standard)

## 1. 架構與協定規範 (Protocol & Standards)
本系統主要以 RESTful 為主，對外提供結構化 JSON API。
- **Base URL**: `/api/v1/admin`
- **Content-Type**: `application/json`
- **認證機制 (Authentication)**: 
  - 核心採用 `Bearer Token` (JWT)。
  - Header 帶入: `Authorization: Bearer <Access_Token>`
- **CORS 策略**: 僅允許特定的 Admin 前端網域存取 (Whitelist)。

## 2. 標準回應格式 (Standard Response Format)
為降低溝通成本，所有 API 無論成功與否，皆遵循以下結構 (`JSend` 變體)：
### Success (2xx)
```json
{
  "success": true,
  "data": {
    "id": "123e4567-e89b-12d3...",
    "key": "value"
  },
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 100
  } // Paging info (Optional)
}
```

### Error (4xx, 5xx)
HTTP Status Code 需精確映射錯誤類別：
- `400 Bad Request`: 參數校驗失敗
- `401 Unauthorized`: 未登入或 Token 過期
- `403 Forbidden`: 登入但權限不足 (RBAC阻擋)
- `404 Not Found`: 資源不存在
- `429 Too Many Requests`: 觸發 Rate Limit
- `500 Internal Server Error`: 伺服器崩潰 (需遮罩 Stack Trace)

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_FAILED", // 具體錯誤代碼給前端抓取
    "message": "Invalid email format.",
    "details": [ /* Validation array from Joi/Zod */ ] 
  }
}
```

---

## 3. 核心 API 綱要 (Core Endpoints)

### 3.1 身份認證 (Auth)
負責無狀態的登入與 Token 派發。
| Method | Endpoint        | Description                                       | Auth Required |
| ------ | --------------- | ------------------------------------------------- | ------------- |
| `POST` | `/auth/login`   | Email/Password 取回 Access + Refresh Token        | No            |
| `POST` | `/auth/refresh` | 用 Refresh Token 換新的 Access Token              | No            |
| `POST` | `/auth/logout`  | 登出 (Blacklist Token 或清除 Session)             | Yes           |
| `GET`  | `/auth/me`      | 取得當前使用者 Profile 與權限清單 (`permissions`) | Yes           |

### 3.2 使用者管理 (User Management)
資源名稱: `users`
| Method   | Endpoint     | Description                               | Required Permission |
| -------- | ------------ | ----------------------------------------- | ------------------- |
| `GET`    | `/users`     | 獲取使用者列表 (支援分頁、搜尋、狀態過濾) | `users:read`        |
| `GET`    | `/users/:id` | 獲取單一使用者詳細資訊                    | `users:read`        |
| `POST`   | `/users`     | 新增管理員                                | `users:create`      |
| `PUT`    | `/users/:id` | 更新使用者資料                            | `users:update`      |
| `DELETE` | `/users/:id` | 停用/軟刪除使用者                         | `users:delete`      |

### 3.3 角色與權限分配 (Roles & Permissions)
資源名稱: `roles`, `permissions`
| Method | Endpoint                 | Description                      | Required Permission |
| ------ | ------------------------ | -------------------------------- | ------------------- |
| `GET`  | `/roles`                 | 取得所有角色清單                 | `roles:read`        |
| `POST` | `/roles`                 | 創建新自定義角色                 | `roles:create`      |
| `GET`  | `/permissions`           | 取得系統所有定義好的權限節點清單 | `roles:read`        |
| `PUT`  | `/roles/:id/permissions` | 分配/覆蓋該角色下的權限清單      | `roles:update`      |

### 3.4 稽核日誌 (Audit Logs)
資源名稱: `audit_logs`
| Method | Endpoint      | Description                               | Required Permission |
| ------ | ------------- | ----------------------------------------- | ------------------- |
| `GET`  | `/audit-logs` | 查詢全站操作紀錄 (依賴 `created_at` 區間) | `audit_logs:read`   |

### 3.5 客戶管理 (CRM)
資源名稱: `customers`, `interactions`
| Method | Endpoint                        | Description                        | Required Permission |
| ------ | ------------------------------- | ---------------------------------- | ------------------- |
| `GET`  | `/crm/customers`                | 客戶列表 (支援 `?type=new/repeat`) | `customers:read`    |
| `GET`  | `/crm/customers/:id`            | 客戶詳情與互動時間軸               | `customers:read`    |
| `POST` | `/crm/customers`                | 建立新客戶                         | `customers:create`  |
| `PUT`  | `/crm/customers/:id`            | 更新客戶屬性                       | `customers:update`  |
| `POST` | `/crm/customers/:id/interactions` | 新增手動互動紀錄                 | `interactions:write`|

### 3.6 供應鏈與庫存 (Inventory & Suppliers)
資源名稱: `products`, `suppliers`
| Method | Endpoint                        | Description                                  | Required Permission |
| ------ | ------------------------------- | -------------------------------------------- | ------------------- |
| `GET`  | `/inventory/products`           | 庫存列表 (支援 `?lowStock=true`)             | `products:read`     |
| `POST` | `/inventory/products`           | 新增 SKU (包含安全庫存與成本價)              | `products:create`   |
| `PUT`  | `/inventory/products/:id`       | 變更商品內容                                 | `products:update`   |
| `GET`  | `/inventory/suppliers`          | 供應商列表                                   | `suppliers:read`    |
| `POST` | `/inventory/suppliers`          | 新增供應商                                   | `suppliers:create`  |
| `PUT`  | `/inventory/suppliers/:id`      | 更新供應商評比與狀態                         | `suppliers:update`  |

## 4. API 開發防呆規範 (Best Practices)
1. **輸入過濾 (Input Sanitization)**: 所有外部輸入 `body`, `query`, `params` 皆須經 Schema Validator (如 Zod, Class-Validator) 的過濾，防止 SQL Injection 與 XSS。
2. **分頁參數 (Pagination)**: `GET` 列表類型 API 強制支援 `?page=1&limit=20` 或 `cursor`，並限制 最大 `limit` (避免撈取整表拖垮 DB)。
3. **軟刪除判斷**: `GET` List 時預設過濾掉 `deleted_at IS NOT NULL` 的資料。
