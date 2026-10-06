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

### 3.7 銷售批次追溯（2026-10-06 / ADR-014）

既有路徑與 RBAC 維持，以下是新增的回應欄位及過帳約束：

| 路徑 | 契約 |
| ---- | ---- |
| `POST /pos/checkout`、`POST /orders` | 同一 transaction 扣商品與合格批次，並保存出庫 movement / allocation。沒有合格批次回 `400`，任何寫入失敗全部回滾。 |
| `GET /pos/orders/:orderId`、`GET /orders/:id` | `items[].batchAllocations[]` 提供實扣 `batchId`、`quantity`、`movementId`、`expiryDateAtSale`、`createdAt`，及 `batch: { id, batchNumber, expiryDate }`。舊單空陣列表示尚無可追溯批次。 |
| `GET /product-batches/:id` | 新增 `saleAllocations[]`（最近 100 筆，含 `order: { id, orderNumber, createdAt }`）及 `_count.saleAllocations`；超過 100 筆時明確由 count 辨識截斷。跨租戶資源回 `404`。 |
| `POST /product-batches`、`PATCH /product-batches/:id` | 可接受 `status: RELEASED / QUARANTINE / BLOCKED`，沿用 `manage:inventory`。新增未指定狀態時預設 `QUARANTINE`；遷移舊批次同樣待確認。 |
| `GET /product-batches?expiringSoon=true` | 有剩餘數量且台北日期落在未來 30 天內的批次（含已逾期，供處理），排除零庫存；不等於可售庫存清單。 |
| `DELETE /product-batches/:id` | 有剩餘數量或曾被 sale allocation 引用時回 `400`，保留零庫存出庫歷史。 |

門店採 `Asia/Taipei` 日曆日期；**到期當天即不可出庫**。只有 `RELEASED`、正數庫存且效期日期晚於今天的批次可被 FEFO 選用。扣庫時再次驗證狀態、效期與數量。效期仍要求完整 ISO datetime；未知或僅年月不會推定成任意日期。

這個批次切片沒有提供退款後實體回補、完整庫存共用權威、唯一單號或精確金額承諾；命令恢復另見 §3.11。完整 #29/#30 驗收持續追蹤。

### 3.8 退款登記與實體退回分離（2026-10-06 / ADR-015）

`POST /pos/orders/:orderId/refund` 沿用 `manage:pos`，接受 UUID orderId 及選填 `reason`（trim 後最多 1000 字元）。僅完成狀態的訂單可登記退款，回傳資料庫更新後的訂單與明細；保留原折扣備註，追加 `[退款]` 原因。

此操作**不增加商品／批次庫存，不新增 IN movement，不改動出庫 allocation**。只登記全額退款狀態，不代表執行支付平台退款或已收到實體商品。已退款回 `400`；兩請求同時讀到 completed 後競爭更新，只允許一個成功，另一個回 `409`。跨租戶回 `404`。

實體退回需另行追查原批次、驗收、隔離及確認可退數量；目前尚未提供這個過帳 API，不可用退款登記替代收貨。

### 3.9 商品 Excel 覆核匯入（2026-10-06 / ADR-016）

兩端點沿用 starter plan 與 `create:products`，multipart `file` 上限 10 MB：

- `POST /excel/import/products/preview`：回 `created / updated / errors / warnings`，另帶 `fileHash`、`normalizedRevision`、`expiresAt`（Unix milliseconds）及 `previewToken`。預覽有效 15 分鐘，綁定門店、原檔案位元組與解析版本。
- `POST /excel/import/products/confirm`：必須帶同一 `file` 與 `previewToken`。在任何資料寫入前驗證；缺少／無效憑證回 `400`，別門店回 `403`，換檔、解析版本變更或預覽過期回 `409`，需重新預覽。舊客戶端直接 confirm 將被拒絕。

這是**商品資料匯入**：更新名稱、描述、價格與安全庫存；既有 `stockQuantity` 不變，新商品初始庫存為 0。舊檔的庫存欄位不會過帳，preview／confirm 都提供清楚 warnings；收貨與開帳需另一個庫存操作，不會補造批次。

既有逐列錯誤回報保留；預覽的新增／更新數量是當時資料庫的估計。此憑證不是一次性的庫存命令，也未提供 durable result recovery；重試商品資料更新不會增加實體庫存。

### 3.10 批次初次進貨與禁止直接改量（2026-10-06 / ADR-017）

- `POST /product-batches` 使用 `create:products`。接受既有 productId、batchNumber、完整 ISO expiryDate、正整數 quantity（上限 2147483647）、正成本 costPrice、選填 status。同一 transaction 鎖定並增加商品總量、建立批次、寫 IN movement；預設 QUARANTINE。RELEASED 在取得鎖後再次檢查到期當日規則。重複批號回 `409`，庫存不再增加；不是追加同批第二次到貨或 command 結果查詢。
- `GET /product-batches` 與 `GET /product-batches/:id` 使用 `read:products`。明細增加 `receiptMovements`，含實收 quantity、batchId、costPriceAtReceipt；舊 movement 無已知批次時保持 null。
- `PATCH /product-batches/:id` 使用 `update:products`，可改既有 metadata／status，quantity 欄位回 `400`。`DELETE` 同權限，剩餘量或任何出庫／進貨引用回 `400`。
- `POST /inventory/products` 使用 `create:products`，flat metadata body，新商品 stockQuantity 必為 0（可省略或明確傳 0）；其他值回 `400`。`PUT /inventory/products/:id` 使用 `update:products`，任何 stockQuantity 欄位回 `400`。UI 顯示帳量但不提供數量編輯。
- `POST /inventory/products/import/csv` 仍跳過既有 SKU；新 SKU 從 0 開始，回 warnings 說明庫存欄位未匯入。

商品總量包括隔離／到期實體庫存，不能當可售承諾。此切片未提供實體退回、multi-bin、調整反向過帳、完整 immutable ledger／rebuild 或正式開帳對帳；父 issue 保持開啟。

### 3.11 POS 結帳命令與結果恢復（Draft / ADR-018）

- `POST /pos/checkout` 必須提供首次提交前產生的 UUID `commandId`；既有 body 業務欄位不變。HTTP 與直接 service 呼叫採相同 Zod defaults，ID 正規化小寫，hash 只含明列業務欄位，不含 commandId、adminPin 或其他認證資訊；明細及付款列保留順序。這是必要 client/server 契約升級，不支援無 key 的舊客戶端結帳。
- 唯一範圍為當前 tenant + `POS_CHECKOUT` + commandId。相同 key／相同正規化 payload 回 `201` 和原始 order JSON（含 items/payments），即使班別已關閉、價格／庫存已改或訂單已退款；不從目前訂單狀態重建結果。相同 key／不同 payload 回 `409 COMMAND_PAYLOAD_CONFLICT`，不新增業務寫入。
- `GET /pos/checkout-commands/:commandId` 沿用 auth + `manage:pos`。回 `{ success: true, data: { commandId, status: "SUCCEEDED", payloadHash: "<正規化 SHA-256>", result: <原 order JSON> } }`；不存在、已 rollback 或尚未提交時回 `200`、`{ commandId, status: "UNKNOWN" }`。UNKNOWN 不代表一定未成交，只能查詢或重送同一 key／原意圖，不能換 key。其他 tenant 的 key 不洩漏結果。UI 比對 frozen payload 的 version-1 hash，吻合才確認；hash 不符保留 conflict 證據。
- PENDING claim、商品／批次扣庫、訂單／付款紀錄、movement／allocation 與 SUCCEEDED/result 同一 transaction。任何階段失敗全部 rollback；未成功的 claim 不永久綁定 key，等待者可接手。普通付款也保存一筆 payment record；沒有新增金流 provider 扣款。
- `GET /pos/checkout-context` 同樣要求 auth + `manage:pos`，回當前 `{ tenantId, userId }`。UI 用此穩定身分隔離 browser 意圖，不能用輪替 token 作紀錄 key。
- UI 首次 POST 前必須成功保存 frozen payload／commandId；unknown 保留草稿與持續可見的恢復入口，refresh 後恢復為 unknown。409 保留證據。確認成功才清對應意圖；不得保存 PIN 或 token 到意圖紀錄。
- 此片不承諾不同 command 的唯一單號、business date、精確金額、歷史成本或退款對帳；不完成 #30/#29/#31/#37 或 G1/G2/G4，也沒有正式部署。

## 4. API 開發防呆規範 (Best Practices)
1. **輸入過濾 (Input Sanitization)**: 所有外部輸入 `body`, `query`, `params` 皆須經 Schema Validator (如 Zod, Class-Validator) 的過濾，防止 SQL Injection 與 XSS。
2. **分頁參數 (Pagination)**: `GET` 列表類型 API 強制支援 `?page=1&limit=20` 或 `cursor`，並限制 最大 `limit` (避免撈取整表拖垮 DB)。
3. **軟刪除判斷**: `GET` List 時預設過濾掉 `deleted_at IS NOT NULL` 的資料。