# 33c_系統錯誤碼與回傳格式規範

> **本文件為強制性規範（Normative）。** 所有 Controller 必須遵守第 1 節的唯一正確寫法；違反者視為 Bug，需在 Code Review 時退回修正。

---

## 1. Controller 錯誤處理：唯一正確寫法

### 核心原則

所有 Controller method 必須：

1. 接受三個參數：`req: Request, res: Response, next: NextFunction`
2. 使用 `try/catch` 包裹整個 method 主體
3. 在 `catch` 區塊只做一件事：`next(err)`，將錯誤交給 Global Error Handler

```typescript
// ✅ 正確範例（以 PosController 為準）
static async checkout(req: Request, res: Response, next: NextFunction) {
    try {
        const order = await CheckoutService.checkout(req.body);
        res.status(201).json({ success: true, data: order });
    } catch (err) { next(err); }
}
```

### 嚴格禁止的行為

**禁止在 Controller 的 `catch` 區塊自行組裝 error response。**

以下三種寫法均為錯誤，必須退回修正：

```typescript
// ❌ 禁止：自己呼叫 res.status(500).json(...)
} catch (error) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: '...' } });
}

// ❌ 禁止：遺漏 next 參數，無法傳遞錯誤
static async getKpis(req: Request, res: Response) { ... }

// ❌ 禁止：catch 後 console.error 但不呼叫 next(err)
} catch (error) {
    console.error('[Controller] Error:', error);
    // 錯誤被吞掉，回傳空白或錯誤格式
}
```

### 為什麼？

- **統一 response 格式**：Global Error Handler（`errorMiddleware`）是唯一有權寫 error response 的地方，確保所有錯誤回傳格式一致。
- **AppError 無法正確映射**：自行處理時，`AppError` 的 `statusCode`（如 404、409）會被覆蓋成固定的 500，前端無法分辨錯誤類型。
- **production 遮罩失效**：Global Error Handler 在 `NODE_ENV=production` 時會自動遮罩 500 的 stack trace；自行處理則把原始錯誤訊息外洩給客戶端。
- **可觀測性下降**：`console.error` 的格式與 global handler 不一致，日誌難以統一分析。

---

## 2. AppError 用法

### 何時使用 `throw new AppError`

當業務邏輯偵測到預期錯誤（即「這是合法的 bad case，不是系統崩潰」）時，一律 `throw new AppError`，讓 Global Error Handler 處理 response。

**適用場景：**

| 場景 | 範例 |
|------|------|
| 必填欄位缺失 | `throw new AppError(400, 'employeeCode is required')` |
| 資源不存在 | `throw new AppError(404, '找不到此商品')` |
| 資料衝突 | `throw new AppError(409, '員工編號已存在')` |
| 認證失敗 | `throw new AppError(401, '找不到員工或帳號已停用')` |
| 權限不足 | `throw new AppError(403, '無權限執行此操作')` |
| 輸入格式無效 | `throw new AppError(422, '日期格式不正確')` |

### 建構子簽名

```typescript
new AppError(statusCode: number, message: string, errorCode?: string)
```

- `statusCode`：HTTP 狀態碼，決定 response 的 HTTP status
- `message`：可讀錯誤訊息（production 下 500 錯誤會遮罩，其餘照送）
- `errorCode`（可選）：明確指定錯誤代碼；若省略，由 `inferCode()` 依 statusCode 自動推導

### statusCode 選擇規則

| statusCode | 使用時機 |
|-----------|---------|
| `400` | 參數錯誤、格式不符、業務邏輯前置檢查失敗 |
| `401` | 未提供認證資訊，或 Token 無效/過期 |
| `403` | 已認證但無操作權限（RBAC 阻擋） |
| `404` | 資源不存在（按 ID 查詢無結果） |
| `409` | 資料衝突（唯一鍵重複、狀態不允許此操作） |
| `422` | Schema 驗證失敗（Zod/Joi 等） |
| `429` | 超過 Rate Limit |
| `500` | **不應主動 throw**；未預期的系統錯誤自然拋出即可 |

### 自訂 errorCode 範例

```typescript
// 省略 errorCode → 自動推導為 'NOT_FOUND'
throw new AppError(404, '找不到此訂單');

// 明確指定 errorCode 給前端抓取
throw new AppError(409, '班次尚未結束', 'SHIFT_NOT_CLOSED');
throw new AppError(400, '庫存不足', 'INSUFFICIENT_STOCK');
```

---

## 3. 成功 / 失敗 Response 格式（JSend 變體）

所有 API 皆遵循此格式，詳見 `api_spec.md` 第 2 節。

### 成功（2xx）

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
  }
}
```

- `data`：必填，回傳的資源本體（物件或陣列）
- `meta`：可選，僅分頁列表類 API 需帶入

**常用 HTTP status 對應：**

| 操作類型 | HTTP Status |
|---------|------------|
| GET 查詢成功 | `200 OK` |
| POST 新增成功 | `201 Created` |
| PUT/PATCH 更新成功 | `200 OK` |
| DELETE 刪除成功 | `200 OK`（帶 `data: null`）或 `204 No Content` |

### 失敗（4xx / 5xx）

```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "找不到此商品"
  }
}
```

- `error.code`：機器可讀的錯誤代碼，前端用來切換錯誤訊息或行為
- `error.message`：人類可讀說明；500 在 production 環境固定回傳 `"Internal server error"`

> **注意**：`error.code` 的值由 Global Error Handler 決定，不允許 Controller 自行組裝 error response 來覆蓋此值。

---

## 4. Error Code 列表

下表為系統目前使用的標準錯誤代碼，由 `AppError.inferCode()` 自動推導或明確指定。

### 標準推導代碼（由 statusCode 自動產生）

| errorCode | HTTP Status | 說明 |
|-----------|------------|------|
| `BAD_REQUEST` | 400 | 參數錯誤或業務邏輯前置檢查失敗 |
| `UNAUTHORIZED` | 401 | 未認證或認證失效 |
| `FORBIDDEN` | 403 | 無操作權限 |
| `NOT_FOUND` | 404 | 資源不存在 |
| `CONFLICT` | 409 | 資料衝突 |
| `VALIDATION_FAILED` | 422 | Schema 驗證失敗 |
| `RATE_LIMIT` | 429 | 超過 Rate Limit |
| `INTERNAL_ERROR` | 500 | 未預期的系統錯誤 |

### 自訂業務代碼（需明確傳入第三參數）

| errorCode | HTTP Status | 使用情境 |
|-----------|------------|---------|
| `INSUFFICIENT_STOCK` | 400 | 結帳時庫存不足 |
| `SHIFT_NOT_CLOSED` | 409 | 班次尚未結束，不可執行此操作 |

> 新增自訂代碼時，需同步更新此表並在 PR 描述中說明用途。

---

## 5. 反面教材：AnalyticsController 的錯誤寫法

`analytics.controller.ts` 是目前系統中錯誤處理的**反面教材**，所有 method 均有以下問題，需在後續技術債修正。

### 問題一：method 簽名缺少 `next` 參數

```typescript
// ❌ analytics.controller.ts 的錯誤寫法
static async getKpis(req: Request, res: Response) {
    //                              ^^^ 缺少 NextFunction
```

沒有 `next`，就無法把錯誤交給 Global Error Handler，導致所有錯誤只能在 method 內部處理。

### 問題二：自行組裝 error response，硬編碼 status 500

```typescript
// ❌ 繞過 Global Error Handler，自己寫 response
} catch (error) {
    console.error('[AnalyticsController] getKpis Error:', error);
    res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to calculate KPIs' }
    });
}
```

**此寫法造成的具體問題：**

1. **AppError 被吞掉**：若 `AnalyticsService` 內部 throw `new AppError(404, '...')`，這裡會把它變成 500，前端無法得知真實錯誤類型。
2. **production 遮罩失效**：固定的字串訊息不受 `NODE_ENV` 控制，但若 `message` 改為直接印出 `error.message`，則 stack trace 會外洩。
3. **errorCode 格式不一致**：`'INTERNAL_SERVER_ERROR'` 與系統標準的 `'INTERNAL_ERROR'` 不同，前端需要維護兩套判斷。
4. **日誌格式雜亂**：每個 method 有各自的 `console.error` 前綴（`[AnalyticsController] getKpis Error:`），無法統一分析。

### 正確修法

```typescript
// ✅ 修正後的寫法
import { Request, Response, NextFunction } from 'express';

static async getKpis(req: Request, res: Response, next: NextFunction) {
    try {
        const period = req.query.period as string;
        // ... 業務邏輯
        res.json({ success: true, data: kpis });
    } catch (err) { next(err); }
}
```

所有修正只需要兩步：
1. 在 method 簽名加入 `next: NextFunction`
2. 將 `catch` 區塊改為 `next(err)`，刪除自行組裝的 response 程式碼

---

## 附錄：Global Error Handler 實作位置

- **`AppError` 定義**：`backend/src/lib/errors.ts`
- **Global Error Handler**：`backend/src/middleware/error.middleware.ts`
- **正確範例（Controller）**：`backend/src/modules/pos/pos.controller.ts`
- **錯誤範例（待修正）**：`backend/src/modules/analytics/analytics.controller.ts`
