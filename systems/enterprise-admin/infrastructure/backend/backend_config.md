# 後端框架與伺服器配置規範

## 技術棧

| 層次 | 技術 | 版本要求 |
|------|------|----------|
| 執行環境 | Node.js | ≥ 20 LTS |
| Web 框架 | Express | 4.x |
| 語言 | TypeScript | strict mode |
| ORM | Prisma | 5.x |
| 資料庫 | PostgreSQL | 15+ |
| 驗證 | Zod | schema-first |
| 安全 | Helmet + CORS | 隨 Express 一起初始化 |

架構模式：**Monolith with module boundaries**（單體應用，但以模組邊界隔離關切點）。

---

## 中介層執行順序

所有 `/api/v1/admin/*` 路由共享以下中介層堆疊，**順序不可調換**：

```
helmet / cors / express.json          ← 全域安全與解析
        ↓
setTenantContext                      ← 建立 AsyncLocalStorage 租戶上下文
        ↓
authMiddleware                        ← 驗證 JWT、載入 user + permissions
        ↓
requirePermission('action:resource')  ← RBAC 權限守衛
        ↓
validate({ body / query / params })   ← Zod schema 驗證請求內容
        ↓
controller handler                    ← 實際業務邏輯
        ↓
errorMiddleware                       ← 全域錯誤捕捉（app 層級，非路由層級）
```

### 為什麼這個順序至關重要

1. **`setTenantContext` 必須最先執行（在 auth 之前）**
   `setTenantContext` 使用 `AsyncLocalStorage` 將 `tenantId` 注入到當前非同步執行上下文。Prisma 的 singleton `prisma`（非 `basePrisma`）在每次 DB 操作時自動從此上下文讀取 `tenantId` 並注入 `where` 條件。若 tenant context 未建立就執行 DB 查詢，Prisma extension 會直接拋出 `[Security] Missing tenant context` 錯誤。

2. **`authMiddleware` 必須在 RBAC 之前執行**
   RBAC 中介層讀取 `req.user.permissions`，此欄位由 `authMiddleware` 在驗證 JWT 後從資料庫載入並掛載。若跳過 auth 直接執行 RBAC，`req.user` 為 `undefined`，將回傳 `401`。

3. **`validate` 必須在 handler 之前執行**
   Zod 驗證確保 controller 收到的資料已通過型別與格式檢查，controller 不需要再做防禦性驗證。

4. **`errorMiddleware` 在 app 層級、最後掛載**
   捕捉所有中介層與 handler 未處理的例外，統一回傳結構化錯誤格式。

---

## 環境變數清單

環境變數透過 `src/config/env.ts` 以 Zod schema 驗證，**啟動時若缺少必填變數，程式直接 `process.exit(1)`**。

| 變數名稱 | 必填 | 預設值 | 說明 |
|---------|------|--------|------|
| `DATABASE_URL` | 是 | — | PostgreSQL 連線字串 |
| `JWT_ACCESS_SECRET` | 是（≥32字元）| — | Access Token 簽名密鑰 |
| `JWT_REFRESH_SECRET` | 是（≥32字元）| — | Refresh Token 簽名密鑰 |
| `JWT_ACCESS_EXPIRES_IN` | 否 | `15m` | Access Token 有效期 |
| `JWT_REFRESH_EXPIRES_IN` | 否 | `7d` | Refresh Token 有效期 |
| `PORT` | 否 | `3000` | 伺服器監聽埠 |
| `NODE_ENV` | 否 | `development` | 環境：`development` / `test` / `production` |
| `CORS_ORIGIN` | 否 | `http://localhost:5173` | 允許的前端 origin |

新增環境變數時，**必須同步更新 `src/config/env.ts` 的 Zod schema**，禁止直接讀取 `process.env.XXX`（繞過驗證）。

---

## 新增模組的標準結構

每個業務模組位於 `src/modules/<module-name>/`，包含以下四個固定檔案：

```
src/modules/my-feature/
├── my-feature.routes.ts      # Express Router 定義，組合中介層與 controller
├── my-feature.controller.ts  # HTTP 層：解析請求、呼叫 service、回傳回應
├── my-feature.service.ts     # 業務邏輯層：DB 操作、計算、呼叫外部服務
└── my-feature.schema.ts      # Zod schemas：request body / query / params 驗證
```

### routes.ts 標準模板

```typescript
import { Router } from 'express';
import { MyFeatureController } from './my-feature.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import { createMyFeatureSchema } from './my-feature.schema';

const router = Router();
const controller = new MyFeatureController();

router.use(authMiddleware);

router.get(
    '/',
    requirePermission('read:my_feature'),
    controller.list.bind(controller),
);

router.post(
    '/',
    requirePermission('create:my_feature'),
    validate({ body: createMyFeatureSchema }),
    controller.create.bind(controller),
);

export default router;
```

### controller.ts 標準模板

```typescript
import { Request, Response } from 'express';
import { MyFeatureService } from './my-feature.service';

export class MyFeatureController {
    async list(req: Request, res: Response) {
        const data = await MyFeatureService.list();
        res.json({ success: true, data });
    }
}
```

### 完成後

在 `src/app.ts` 補上 import 與掛載：

```typescript
import myFeatureRoutes from './modules/my-feature/my-feature.routes';
// ...
apiRouter.use('/my-feature', myFeatureRoutes);
```

---

## 禁止行為

### 禁止直接 `new PrismaClient()`

**錯誤寫法（禁止）：**

```typescript
// ❌ 不可直接 new PrismaClient()，會繞過 tenantId 自動注入
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
```

**正確寫法：**

```typescript
// ✅ 永遠從 lib/prisma 匯入 singleton
import { prisma } from '../../lib/prisma';
```

**原因：** `src/lib/prisma.ts` 中的 `prisma` 是透過 `$extends` 包裝的 Prisma Client，會在每次操作時自動從 `AsyncLocalStorage` 讀取 `tenantId` 並注入查詢條件，確保多租戶資料隔離。直接 `new PrismaClient()` 會完全繞過這層安全機制，導致跨租戶資料洩漏。

若需要在不帶租戶上下文的場景下操作資料庫（例如：seed 腳本、tenant 查詢本身），才可使用 `basePrisma`，且必須在 code review 時明確標注原因。

---

## 現有模組清單

以下模組已在 `app.ts` 掛載於 `/api/v1/admin/` 下：

| 路徑 | 模組目錄 |
|------|---------|
| `/auth` | `modules/auth/` |
| `/users` | `modules/users/` |
| `/roles` | `modules/roles/` |
| `/audit-logs` | `modules/audit-logs/` |
| `/crm` | `modules/crm/` |
| `/inventory` | `modules/inventory/` |
| `/dashboard` | `modules/dashboard/` |
| `/orders` | `modules/orders/` |
| `/analytics` | `modules/analytics/` |
| `/expenses` | `modules/expenses/` |
| `/reports` | `modules/reports/` |
| `/shifts` | `modules/shifts/` |
| `/product-batches` | `modules/product-batches/` |
| `/daily-settlements` | `modules/daily-settlements/` |
| `/pos` | `modules/pos/` |
