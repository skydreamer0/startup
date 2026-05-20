# Post-Phase-9 Roadmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成 Phase 9 之後的三條平行工作線：SAAS-03 Plan Gating 收尾、INT-02 CSV 匯入匯出、C-04 Analytics 模組拆分。

**Architecture:** Track A/B/C 互相獨立，可由三個 worktree 平行推進；Phase 10 電子發票 blocked 等 Phase 9 PR #5 merge 後才啟動。所有 Track 遵循 TDD（先寫測試，再寫實作），使用 Vitest + Prisma mock 模式。

**Tech Stack:** Node.js / Express / Prisma / PostgreSQL（後端）；React / TanStack Query / Tailwind（前端）；Vitest（測試）；csv-parse + csv-stringify（CSV 處理）

---

## ⚠️ Blocked: Phase 10 電子發票

**前置條件：** Phase 9 PR #5 必須先 merge 到 master。

確認 merge 後才開始 Phase 10，不在此計畫範圍內。

---

## Track A — SAAS-03: Plan Gating 收尾

> **可立即執行，無 block。** 目標：將 `requirePlan` 套用到 reports 路由、補測試、補前端升級提示 UI。

### Task A1: Plan Middleware 測試 + Reports Plan Gating

**Files:**
- Create: `systems/enterprise-admin/backend/src/__tests__/plan.middleware.test.ts`
- Modify: `systems/enterprise-admin/backend/src/modules/reports/reports.routes.ts`

- [ ] **Step A1-1: 寫 plan.middleware 失敗測試**

```typescript
// systems/enterprise-admin/backend/src/__tests__/plan.middleware.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';

vi.mock('../lib/tenant.context', () => ({
  tenantContext: {
    getStore: vi.fn(),
  },
}));

import { requirePlan } from '../middleware/plan.middleware';
import { tenantContext } from '../lib/tenant.context';

const mockGetStore = vi.mocked(tenantContext.getStore);

function makeReqResNext() {
  const req = {} as Request;
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  const next = vi.fn() as NextFunction;
  return { req, res, next };
}

describe('requirePlan middleware', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls next() when tenant plan meets requirement', () => {
    mockGetStore.mockReturnValue({ tenantId: 't1', plan: 'starter' });
    const { req, res, next } = makeReqResNext();
    requirePlan('starter')(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('calls next() when tenant plan exceeds requirement', () => {
    mockGetStore.mockReturnValue({ tenantId: 't1', plan: 'pro' });
    const { req, res, next } = makeReqResNext();
    requirePlan('starter')(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('returns 403 PLAN_UPGRADE_REQUIRED when plan is insufficient', () => {
    mockGetStore.mockReturnValue({ tenantId: 't1', plan: 'free' });
    const { req, res, next } = makeReqResNext();
    requirePlan('starter')(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'PLAN_UPGRADE_REQUIRED' }),
      })
    );
  });

  it('returns 500 when tenant context is missing', () => {
    mockGetStore.mockReturnValue(null);
    const { req, res, next } = makeReqResNext();
    requirePlan('starter')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
```

- [ ] **Step A1-2: 執行測試確認失敗（context mock 問題會先出現）**

```bash
cd systems/enterprise-admin/backend
npx vitest run src/__tests__/plan.middleware.test.ts
```

預期：`FAIL` — 此時 4 個 test 應全部過（middleware 已存在），若有 mock import order 問題則修正。

- [ ] **Step A1-3: 修正 reports.routes.ts — 加入 requirePlan('starter')**

編輯 `systems/enterprise-admin/backend/src/modules/reports/reports.routes.ts`，在 `requirePermission` 後面加入：

```typescript
import { Router } from 'express';
import { ReportsController } from './reports.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/rbac.middleware';
import { requirePlan } from '../../middleware/plan.middleware';

const router = Router();

router.use(authMiddleware);
router.use(requirePermission('read:reports'));
router.use(requirePlan('starter'));  // Reports 為 starter+ 功能

router.get('/margin', ReportsController.getMarginAnalysis);
router.get('/margin/trend', ReportsController.getMarginTrend);
router.get('/cashflow', ReportsController.getCashFlowStatement);
router.get('/cashflow/trend', ReportsController.getCashFlowTrend);
router.get('/sales-ranking', ReportsController.getSalesRanking);

export default router;
```

- [ ] **Step A1-4: 執行測試確認全部通過**

```bash
npx vitest run src/__tests__/plan.middleware.test.ts
```

預期：`PASS` — 4/4 tests

- [ ] **Step A1-5: 執行完整後端測試確認無 regression**

```bash
npx vitest run
```

預期：所有原有測試仍 PASS

- [ ] **Step A1-6: Commit**

```bash
cd systems/enterprise-admin
git add backend/src/__tests__/plan.middleware.test.ts backend/src/modules/reports/reports.routes.ts
git commit -m "feat(saas): apply requirePlan('starter') to reports routes + add plan middleware tests"
```

---

### Task A2: 前端 Plan Upgrade 提示 UI

**Files:**
- Modify: `systems/enterprise-admin/admin-ui/src/lib/api.ts`（或 axios instance 所在檔案）
- Create: `systems/enterprise-admin/admin-ui/src/components/PlanUpgradeToast.tsx`

先確認 axios instance 位置：
```bash
find systems/enterprise-admin/admin-ui/src -name "api.ts" -o -name "axios*.ts" | head -5
```

- [ ] **Step A2-1: 找 axios interceptor 所在檔案**

```bash
grep -r "axios.create\|interceptors.response" systems/enterprise-admin/admin-ui/src --include="*.ts" --include="*.tsx" -l
```

預期輸出：一個或多個 ts/tsx 檔案路徑。

- [ ] **Step A2-2: 在 axios response interceptor 新增 PLAN_UPGRADE_REQUIRED 處理**

在找到的 axios instance 檔案的 `interceptors.response.use` error 分支中加入：

```typescript
// 在現有 401 處理後加入
if (error.response?.status === 403) {
  const code = error.response?.data?.error?.code;
  if (code === 'PLAN_UPGRADE_REQUIRED') {
    const msg = error.response.data.error.message ?? '此功能需要升級方案';
    // 發出自定義事件，由 Toast 元件監聽
    window.dispatchEvent(new CustomEvent('plan-upgrade-required', { detail: { message: msg } }));
    return Promise.reject(error);
  }
}
```

- [ ] **Step A2-3: 建立 PlanUpgradeToast 元件**

```tsx
// systems/enterprise-admin/admin-ui/src/components/PlanUpgradeToast.tsx
import { useEffect, useState } from 'react';

export function PlanUpgradeToast() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const { message } = (e as CustomEvent).detail;
      setMessage(message);
      setTimeout(() => setMessage(null), 5000);
    };
    window.addEventListener('plan-upgrade-required', handler);
    return () => window.removeEventListener('plan-upgrade-required', handler);
  }, []);

  if (!message) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 rounded-lg bg-amber-500 px-4 py-3 text-white shadow-lg">
      <p className="font-semibold">方案升級所需</p>
      <p className="text-sm">{message}</p>
    </div>
  );
}
```

- [ ] **Step A2-4: 在 App.tsx 或 AdminLayout.tsx 掛載 PlanUpgradeToast**

找到根元件，加入：

```tsx
import { PlanUpgradeToast } from './components/PlanUpgradeToast';

// 在 JSX return 最外層加入（與 router 同層）
<PlanUpgradeToast />
```

- [ ] **Step A2-5: 手動測試 — 將 seed 的 tenant plan 改為 free，訪問 /reports/margin，確認 toast 出現**

```bash
# 在 psql 或 prisma studio 中臨時修改
# UPDATE tenants SET plan = 'free' WHERE slug = 'demo';
# 瀏覽器訪問 /reports/margin → 應看到「方案升級所需」Toast
# 改回 pro
# UPDATE tenants SET plan = 'pro' WHERE slug = 'demo';
```

- [ ] **Step A2-6: 更新 ROADMAP.md — 勾選 SAAS-03**

```markdown
- [x] **SAAS-03**: Plan-based feature gating (`free`/`starter`/`pro`)。
```

- [ ] **Step A2-7: Commit**

```bash
git add admin-ui/src/components/PlanUpgradeToast.tsx admin-ui/src/ \
        systems/enterprise-admin/ROADMAP.md
git commit -m "feat(saas): frontend plan upgrade toast + ROADMAP SAAS-03 done"
```

---

## Track B — INT-02: CSV 批次匯入匯出

> **可立即執行，無 block，與 Track A 平行。** 範圍：Products 匯出/匯入、Orders 匯出、Customers 匯出。

### Task B1: 安裝依賴 + CSV Service 骨架 + Products Export

**Files:**
- Modify: `systems/enterprise-admin/backend/package.json`
- Create: `systems/enterprise-admin/backend/src/modules/inventory/csv.service.ts`
- Create: `systems/enterprise-admin/backend/src/__tests__/csv.service.test.ts`

- [ ] **Step B1-1: 安裝 CSV 依賴**

```bash
cd systems/enterprise-admin/backend
npm install csv-stringify csv-parse multer
npm install -D @types/multer
```

預期：`package.json` 新增這四個套件。

- [ ] **Step B1-2: 寫 csv.service.test.ts 的 Products Export 失敗測試**

```typescript
// systems/enterprise-admin/backend/src/__tests__/csv.service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/tenant.context', () => ({
  requireTenantId: vi.fn(() => 'test-tenant-id'),
  tenantContext: { getStore: vi.fn(() => ({ tenantId: 'test-tenant-id', plan: 'pro' })) },
}));

vi.mock('../lib/prisma', () => ({
  prisma: {
    product: {
      findMany: vi.fn(),
    },
    order: {
      findMany: vi.fn(),
    },
    customer: {
      findMany: vi.fn(),
    },
  },
}));

import { CsvService } from '../modules/inventory/csv.service';
import { prisma } from '../lib/prisma';

const mockProductFindMany = vi.mocked(prisma.product.findMany);
const mockOrderFindMany = vi.mocked(prisma.order.findMany);

describe('CsvService.exportProducts', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns CSV string with header row', async () => {
    mockProductFindMany.mockResolvedValue([
      {
        id: 'p1', name: '阿斯匹靈', sku: 'ASP-001',
        retailPrice: 15.0, costPrice: 8.0, stockQuantity: 100,
        safetyStockDays: 7, status: 'active',
        category: { name: '止痛藥' }, supplier: null,
      } as any,
    ]);

    const csv = await CsvService.exportProducts();
    expect(csv).toContain('商品名稱,SKU,售價,成本,庫存,安全庫存天數,狀態,分類');
    expect(csv).toContain('阿斯匹靈');
    expect(csv).toContain('ASP-001');
  });

  it('returns only header row when no products', async () => {
    mockProductFindMany.mockResolvedValue([]);
    const csv = await CsvService.exportProducts();
    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('商品名稱');
  });
});

describe('CsvService.exportOrders', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns CSV string with order data', async () => {
    mockOrderFindMany.mockResolvedValue([
      {
        id: 'o1', orderNumber: 'ORD-001', status: 'completed',
        totalAmount: 150.0, paymentMethod: 'CASH',
        createdAt: new Date('2026-05-01'),
        customer: { fullName: '王小明' }, salesPerson: null,
        items: [{ quantity: 2, unitPrice: 75.0 }],
      } as any,
    ]);

    const csv = await CsvService.exportOrders();
    expect(csv).toContain('訂單編號,狀態,總金額,付款方式');
    expect(csv).toContain('ORD-001');
    expect(csv).toContain('150');
  });
});
```

- [ ] **Step B1-3: 執行測試確認失敗（CsvService 尚未建立）**

```bash
npx vitest run src/__tests__/csv.service.test.ts
```

預期：`FAIL` — `Cannot find module '../modules/inventory/csv.service'`

- [ ] **Step B1-4: 實作 CsvService**

```typescript
// systems/enterprise-admin/backend/src/modules/inventory/csv.service.ts
import { stringify } from 'csv-stringify/sync';
import { prisma } from '../../lib/prisma';
import { requireTenantId } from '../../lib/tenant.context';

export class CsvService {
  static async exportProducts(): Promise<string> {
    const tenantId = requireTenantId();
    const products = await prisma.product.findMany({
      where: { tenantId, deletedAt: null },
      include: { category: true, supplier: true },
      orderBy: { name: 'asc' },
    });

    const rows = products.map((p) => [
      p.name,
      p.sku,
      p.retailPrice,
      p.costPrice,
      p.stockQuantity,
      p.safetyStockDays ?? '',
      p.status,
      p.category?.name ?? '',
      p.supplier?.name ?? '',
    ]);

    return stringify(rows, {
      header: true,
      columns: ['商品名稱', 'SKU', '售價', '成本', '庫存', '安全庫存天數', '狀態', '分類', '供應商'],
    });
  }

  static async exportOrders(startDate?: Date, endDate?: Date): Promise<string> {
    const tenantId = requireTenantId();
    const orders = await prisma.order.findMany({
      where: {
        tenantId,
        ...(startDate && endDate ? { createdAt: { gte: startDate, lte: endDate } } : {}),
      },
      include: { customer: true, salesPerson: true },
      orderBy: { createdAt: 'desc' },
    });

    const rows = orders.map((o) => [
      o.orderNumber ?? o.id.slice(0, 8),
      o.status,
      o.totalAmount,
      o.paymentMethod ?? '',
      o.customer?.fullName ?? '',
      o.salesPerson?.fullName ?? '',
      o.createdAt.toISOString().slice(0, 10),
    ]);

    return stringify(rows, {
      header: true,
      columns: ['訂單編號', '狀態', '總金額', '付款方式', '客戶', '銷售人員', '建立日期'],
    });
  }

  static async exportCustomers(): Promise<string> {
    const tenantId = requireTenantId();
    const customers = await prisma.customer.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });

    const rows = customers.map((c) => [
      c.fullName,
      c.phone ?? '',
      c.email ?? '',
      c.totalSpent,
      c.purchaseCount,
      c.createdAt.toISOString().slice(0, 10),
    ]);

    return stringify(rows, {
      header: true,
      columns: ['姓名', '電話', 'Email', '累計消費', '購買次數', '加入日期'],
    });
  }
}
```

- [ ] **Step B1-5: 執行測試確認通過**

```bash
npx vitest run src/__tests__/csv.service.test.ts
```

預期：`PASS` — 3/3 tests

- [ ] **Step B1-6: Commit**

```bash
git add backend/src/modules/inventory/csv.service.ts \
        backend/src/__tests__/csv.service.test.ts \
        backend/package.json backend/package-lock.json
git commit -m "feat(csv): CsvService with product/order/customer export"
```

---

### Task B2: Products CSV Import API + 路由

**Files:**
- Create: `systems/enterprise-admin/backend/src/modules/inventory/csv.controller.ts`
- Modify: `systems/enterprise-admin/backend/src/modules/inventory/inventory.routes.ts`

- [ ] **Step B2-1: 寫 Products Import 失敗測試**

在 `csv.service.test.ts` 末尾加入：

```typescript
describe('CsvService.importProducts', () => {
  it('parses valid CSV and returns preview rows', async () => {
    const csv = `商品名稱,SKU,售價,成本,庫存,安全庫存天數
阿斯匹靈,ASP-002,15,8,50,7
維他命C,VIT-C-500,25,12,200,14`;

    const result = await CsvService.parseProductImportCsv(csv);
    expect(result.valid).toHaveLength(2);
    expect(result.errors).toHaveLength(0);
    expect(result.valid[0].name).toBe('阿斯匹靈');
    expect(result.valid[0].retailPrice).toBe(15);
  });

  it('captures validation errors for missing required fields', async () => {
    const csv = `商品名稱,SKU,售價,成本,庫存,安全庫存天數
,ASP-003,15,8,50,7`;

    const result = await CsvService.parseProductImportCsv(csv);
    expect(result.valid).toHaveLength(0);
    expect(result.errors[0]).toMatch(/商品名稱.*必填/);
  });
});
```

- [ ] **Step B2-2: 執行測試確認失敗**

```bash
npx vitest run src/__tests__/csv.service.test.ts
```

預期：`FAIL` — `parseProductImportCsv is not a function`

- [ ] **Step B2-3: 在 CsvService 加入 parseProductImportCsv**

在 `csv.service.ts` 的 `CsvService` 類別末尾加入：

```typescript
import { parse } from 'csv-parse/sync';

// 在 exportCustomers 後面加入：

static async parseProductImportCsv(csvContent: string): Promise<{
  valid: Array<{ name: string; sku: string; retailPrice: number; costPrice: number; stockQuantity: number; safetyStockDays?: number }>;
  errors: string[];
}> {
  const records = parse(csvContent, { columns: true, skip_empty_lines: true, trim: true });
  const valid: any[] = [];
  const errors: string[] = [];

  for (let i = 0; i < records.length; i++) {
    const row = records[i];
    const rowNum = i + 2; // +2: header=1, data starts at 2

    if (!row['商品名稱']?.trim()) {
      errors.push(`第 ${rowNum} 行：商品名稱 必填`);
      continue;
    }
    if (!row['SKU']?.trim()) {
      errors.push(`第 ${rowNum} 行：SKU 必填`);
      continue;
    }
    const retailPrice = parseFloat(row['售價']);
    const costPrice = parseFloat(row['成本']);
    const stockQuantity = parseInt(row['庫存'], 10);
    if (isNaN(retailPrice) || retailPrice < 0) {
      errors.push(`第 ${rowNum} 行：售價 必須為非負數字`);
      continue;
    }
    if (isNaN(costPrice) || costPrice < 0) {
      errors.push(`第 ${rowNum} 行：成本 必須為非負數字`);
      continue;
    }
    if (isNaN(stockQuantity) || stockQuantity < 0) {
      errors.push(`第 ${rowNum} 行：庫存 必須為非負整數`);
      continue;
    }

    valid.push({
      name: row['商品名稱'].trim(),
      sku: row['SKU'].trim(),
      retailPrice,
      costPrice,
      stockQuantity,
      safetyStockDays: row['安全庫存天數'] ? parseInt(row['安全庫存天數'], 10) : undefined,
    });
  }

  return { valid, errors };
}
```

- [ ] **Step B2-4: 執行測試確認通過**

```bash
npx vitest run src/__tests__/csv.service.test.ts
```

預期：`PASS` — 5/5 tests

- [ ] **Step B2-5: 建立 csv.controller.ts**

```typescript
// systems/enterprise-admin/backend/src/modules/inventory/csv.controller.ts
import { Request, Response, NextFunction } from 'express';
import { CsvService } from './csv.service';
import { prisma } from '../../lib/prisma';
import { requireTenantId } from '../../lib/tenant.context';

export class CsvController {
  static async exportProducts(req: Request, res: Response, next: NextFunction) {
    try {
      const csv = await CsvService.exportProducts();
      const filename = `products-${new Date().toISOString().slice(0, 10)}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send('﻿' + csv); // BOM for Excel UTF-8
    } catch (err) {
      next(err);
    }
  }

  static async importProducts(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: { code: 'NO_FILE', message: '請上傳 CSV 檔案' } });
      }
      const csvContent = req.file.buffer.toString('utf-8').replace(/^﻿/, '');
      const { valid, errors } = await CsvService.parseProductImportCsv(csvContent);

      if (errors.length > 0) {
        return res.status(422).json({ success: false, error: { code: 'CSV_VALIDATION_ERROR', message: errors.join('; ') } });
      }

      const tenantId = requireTenantId();
      let created = 0;
      let skipped = 0;

      for (const row of valid) {
        const existing = await prisma.product.findFirst({ where: { sku: row.sku, tenantId } });
        if (existing) { skipped++; continue; }
        await prisma.product.create({ data: { ...row, tenantId, status: 'active' } });
        created++;
      }

      return res.json({ success: true, data: { created, skipped, errors: [] } });
    } catch (err) {
      next(err);
    }
  }

  static async exportOrders(req: Request, res: Response, next: NextFunction) {
    try {
      const { start, end } = req.query;
      const startDate = start ? new Date(start as string) : undefined;
      const endDate = end ? new Date(end as string) : undefined;
      const csv = await CsvService.exportOrders(startDate, endDate);
      const filename = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send('﻿' + csv);
    } catch (err) {
      next(err);
    }
  }

  static async exportCustomers(req: Request, res: Response, next: NextFunction) {
    try {
      const csv = await CsvService.exportCustomers();
      const filename = `customers-${new Date().toISOString().slice(0, 10)}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send('﻿' + csv);
    } catch (err) {
      next(err);
    }
  }
}
```

- [ ] **Step B2-6: 更新 inventory.routes.ts — 加入 CSV 路由**

找到 inventory.routes.ts（路徑：`backend/src/modules/inventory/inventory.routes.ts`），在現有路由後加入：

```typescript
import multer from 'multer';
import { CsvController } from './csv.controller';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// CSV Export/Import (加在現有路由最後)
router.get('/export/csv', requirePermission('products:read'), CsvController.exportProducts);
router.post('/import/csv', requirePermission('products:create'), upload.single('file'), CsvController.importProducts);
```

在 orders.routes.ts 加入：

```typescript
import { CsvController } from '../inventory/csv.controller';

// CSV Export
router.get('/export/csv', requirePermission('orders:read'), CsvController.exportOrders);
```

在 crm.routes.ts 加入：

```typescript
import { CsvController } from '../inventory/csv.controller';

// CSV Export
router.get('/customers/export/csv', requirePermission('customers:read'), CsvController.exportCustomers);
```

- [ ] **Step B2-7: 手動測試 API**

```bash
# 確認後端運行中，取得 token 後：
TOKEN="your-jwt-token"

# 測試 Products Export
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/inventory/export/csv -o /tmp/products.csv
cat /tmp/products.csv | head -5

# 測試 Products Import
curl -H "Authorization: Bearer $TOKEN" \
  -F "file=@/tmp/products.csv" \
  http://localhost:3000/api/inventory/import/csv
```

預期：export 回傳 CSV 內容，import 回傳 `{ success: true, data: { created: N, skipped: M } }`

- [ ] **Step B2-8: Commit**

```bash
git add backend/src/modules/inventory/csv.controller.ts \
        backend/src/modules/inventory/inventory.routes.ts \
        backend/src/modules/orders/orders.routes.ts \
        backend/src/modules/crm/crm.routes.ts \
        backend/src/__tests__/csv.service.test.ts
git commit -m "feat(csv): Products import/export + Orders/Customers export API"
```

---

### Task B3: 前端 Export 按鈕 + Products Import Modal

**Files:**
- Modify: `systems/enterprise-admin/admin-ui/src/pages/InventoryPage.tsx`（或 ProductListPage.tsx）
- Create: `systems/enterprise-admin/admin-ui/src/components/CsvImportModal.tsx`

- [ ] **Step B3-1: 確認商品列表頁路徑**

```bash
find systems/enterprise-admin/admin-ui/src -name "*nventory*" -o -name "*Product*" | grep -i "page\|list"
```

- [ ] **Step B3-2: 建立 CsvImportModal**

```tsx
// systems/enterprise-admin/admin-ui/src/components/CsvImportModal.tsx
import { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api'; // 替換為實際 api client 路徑

interface Props {
  isOpen: boolean;
  onClose: () => void;
  uploadUrl: string;
  queryKey: string[];
  label: string;
}

export function CsvImportModal({ isOpen, onClose, uploadUrl, queryKey, label }: Props) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('file', file);
      const { data } = await api.post(uploadUrl, form, { headers: { 'Content-Type': 'multipart/form-data' } });
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey });
      onClose();
      alert(`匯入完成：新增 ${data.data.created} 筆，略過重複 ${data.data.skipped} 筆`);
    },
    onError: (err: any) => {
      setError(err.response?.data?.error?.message ?? '匯入失敗');
    },
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold">批次匯入 {label}</h2>
        {error && <p className="mb-3 text-sm text-red-500">{error}</p>}
        <input ref={fileRef} type="file" accept=".csv" className="mb-4 block w-full text-sm" />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn btn-ghost">取消</button>
          <button
            onClick={() => {
              const file = fileRef.current?.files?.[0];
              if (!file) return setError('請選擇 CSV 檔案');
              setError(null);
              mutation.mutate(file);
            }}
            disabled={mutation.isPending}
            className="btn btn-primary"
          >
            {mutation.isPending ? '上傳中...' : '確認匯入'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step B3-3: 在商品列表頁加入 Export 按鈕 + Import Modal 觸發**

在商品列表頁的操作列區域（通常是 `<div className="flex ...">` 含「新增商品」按鈕那段），加入：

```tsx
import { CsvImportModal } from '../components/CsvImportModal';
import api from '../lib/api';

// state
const [importOpen, setImportOpen] = useState(false);

// 匯出函式
const handleExport = async () => {
  const res = await api.get('/inventory/export/csv', { responseType: 'blob' });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = `products-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

// JSX 在「新增商品」旁邊加入：
<button onClick={handleExport} className="btn btn-ghost">匯出 CSV</button>
<button onClick={() => setImportOpen(true)} className="btn btn-ghost">匯入 CSV</button>
<CsvImportModal
  isOpen={importOpen}
  onClose={() => setImportOpen(false)}
  uploadUrl="/inventory/import/csv"
  queryKey={['products']}
  label="商品"
/>
```

- [ ] **Step B3-4: 在 Orders 頁加入 Export 按鈕**

同上，在訂單列表頁操作列加入：

```tsx
const handleExportOrders = async () => {
  const res = await api.get('/orders/export/csv', { responseType: 'blob' });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

// JSX：
<button onClick={handleExportOrders} className="btn btn-ghost">匯出 CSV</button>
```

- [ ] **Step B3-5: 手動測試 UI**

```
1. 訪問 /inventory → 點「匯出 CSV」→ 確認下載檔案包含商品資料
2. 點「匯入 CSV」→ 上傳剛下載的 CSV → 確認提示「匯入完成，略過重複 N 筆」
3. 訪問 /orders → 點「匯出 CSV」→ 確認下載訂單資料
```

- [ ] **Step B3-6: 更新 ROADMAP — 勾選 INT-02**

```markdown
- [x] **INT-02**: 批次匯入匯出 (Excel/CSV)
```

- [ ] **Step B3-7: Commit**

```bash
git add admin-ui/src/components/CsvImportModal.tsx \
        admin-ui/src/pages/ \
        systems/enterprise-admin/ROADMAP.md
git commit -m "feat(csv): frontend export buttons + Products import modal + ROADMAP INT-02 done"
```

---

## Track C — C-04: Analytics 模組拆分

> **可立即執行，與 A/B 平行。** 目標：將 744 行的 `analytics.service.ts` 拆為三個子服務，Controller 改為 façade。

### Task C1: 拆出 CrmAnalyticsService

**Files:**
- Create: `systems/enterprise-admin/backend/src/modules/analytics/crm-analytics.service.ts`
- Modify: `systems/enterprise-admin/backend/src/modules/analytics/analytics.service.ts`

- [ ] **Step C1-1: 讀取 analytics.service.ts，找 RFM 和 ChurnRisk 的行號範圍**

```bash
grep -n "async getRfm\|async getChurnRisk\|async getKpis\|async getTrends\|async getProduct\|async getSupplier\|async getHeatmap\|async getBonusGate" \
  systems/enterprise-admin/backend/src/modules/analytics/analytics.service.ts
```

記下每個 method 的起止行號，用於下一步切割。

- [ ] **Step C1-2: 建立 crm-analytics.service.ts**

將 `getRfm` 和 `getChurnRisk` 的完整實作（包含型別定義和 import）移至新檔案：

```typescript
// systems/enterprise-admin/backend/src/modules/analytics/crm-analytics.service.ts
import { prisma } from '../../lib/prisma';
import { requireTenantId } from '../../lib/tenant.context';

// 從 analytics.service.ts 移過來的型別定義
export type RfmSegment = 'vip' | 'loyal' | 'new' | 'dormant' | 'at_risk';

export interface RfmCustomer {
  // ... 保留原有介面定義
}

export interface RfmResult {
  // ... 保留原有介面定義
}

export interface ChurnRiskCustomer {
  // ... 保留原有介面定義
}

export class CrmAnalyticsService {
  static async getRfm(startDate: Date, endDate: Date): Promise<RfmResult> {
    requireTenantId();
    // ... 貼上原始 getRfm 實作（不改邏輯）
  }

  static async getChurnRisk(): Promise<ChurnRiskCustomer[]> {
    requireTenantId();
    // ... 貼上原始 getChurnRisk 實作
  }
}
```

> **注意：** 直接搬移程式碼，不改邏輯，保留所有型別。

- [ ] **Step C1-3: 執行現有測試確認沒 regression**

```bash
cd systems/enterprise-admin/backend
npx vitest run src/__tests__/analytics.service.test.ts
```

預期：原本 RFM / ChurnRisk 相關測試仍 PASS（因為 analytics.service.ts 仍保有原始實作）

- [ ] **Step C1-4: analytics.service.ts 的 getRfm / getChurnRisk 改為 re-export**

```typescript
// 在 analytics.service.ts 的 getRfm / getChurnRisk 方法替換為：
import { CrmAnalyticsService } from './crm-analytics.service';
export { RfmSegment, RfmCustomer, RfmResult, ChurnRiskCustomer } from './crm-analytics.service';

// AnalyticsService class 內：
static async getRfm(startDate: Date, endDate: Date) {
  return CrmAnalyticsService.getRfm(startDate, endDate);
}
static async getChurnRisk() {
  return CrmAnalyticsService.getChurnRisk();
}
```

- [ ] **Step C1-5: 執行所有測試確認無 regression**

```bash
npx vitest run
```

預期：`PASS` — 所有測試

- [ ] **Step C1-6: Commit**

```bash
git add backend/src/modules/analytics/crm-analytics.service.ts \
        backend/src/modules/analytics/analytics.service.ts
git commit -m "refactor(analytics): extract CrmAnalyticsService (getRfm, getChurnRisk)"
```

---

### Task C2: 拆出 ProductAnalyticsService

**Files:**
- Create: `systems/enterprise-admin/backend/src/modules/analytics/product-analytics.service.ts`
- Modify: `systems/enterprise-admin/backend/src/modules/analytics/analytics.service.ts`

- [ ] **Step C2-1: 建立 product-analytics.service.ts**

將 `getProductAbc` 和 `getSupplierRanking` 移至：

```typescript
// systems/enterprise-admin/backend/src/modules/analytics/product-analytics.service.ts
import { prisma } from '../../lib/prisma';
import { requireTenantId } from '../../lib/tenant.context';

export type AbcQuadrant = 'star' | 'cash_cow' | 'hidden_gem' | 'underperformer';

export interface AbcProduct {
  // ... 保留原有介面
}

export interface AbcResult {
  // ... 保留原有介面
}

export interface RankedSupplier {
  // ... 保留原有介面
}

export class ProductAnalyticsService {
  static async getProductAbc(startDate: Date, endDate: Date): Promise<AbcResult> {
    requireTenantId();
    // ... 貼上原始實作
  }

  static async getSupplierRanking(): Promise<RankedSupplier[]> {
    requireTenantId();
    // ... 貼上原始實作
  }
}
```

- [ ] **Step C2-2: analytics.service.ts 的對應 method 改為 delegate**

```typescript
import { ProductAnalyticsService } from './product-analytics.service';
export { AbcQuadrant, AbcProduct, AbcResult, RankedSupplier } from './product-analytics.service';

// AnalyticsService 內：
static async getProductAbc(s: Date, e: Date) { return ProductAnalyticsService.getProductAbc(s, e); }
static async getSupplierRanking() { return ProductAnalyticsService.getSupplierRanking(); }
```

- [ ] **Step C2-3: 執行所有測試**

```bash
npx vitest run
```

預期：`PASS`

- [ ] **Step C2-4: Commit**

```bash
git add backend/src/modules/analytics/product-analytics.service.ts \
        backend/src/modules/analytics/analytics.service.ts
git commit -m "refactor(analytics): extract ProductAnalyticsService (getProductAbc, getSupplierRanking)"
```

---

### Task C3: 拆出 OperationsAnalyticsService + 清理 analytics.service.ts

**Files:**
- Create: `systems/enterprise-admin/backend/src/modules/analytics/operations-analytics.service.ts`
- Modify: `systems/enterprise-admin/backend/src/modules/analytics/analytics.service.ts`
- Modify: `systems/enterprise-admin/backend/src/__tests__/analytics.service.test.ts`

- [ ] **Step C3-1: 建立 operations-analytics.service.ts**

將 `getKpis`、`getTrends`、`getHeatmap`、`getBonusGate` 移至：

```typescript
// systems/enterprise-admin/backend/src/modules/analytics/operations-analytics.service.ts
import { prisma } from '../../lib/prisma';
import { requireTenantId } from '../../lib/tenant.context';

export interface HeatmapCell {
  // ... 保留原有介面
}

export interface BonusGateResult {
  // ... 保留原有介面
}

export class OperationsAnalyticsService {
  static async getKpis(startDate: Date, endDate: Date) {
    requireTenantId();
    // ...
  }
  static async getTrends(startDate: Date, endDate: Date) {
    requireTenantId();
    // ...
  }
  static async getHeatmap() {
    requireTenantId();
    // ...
  }
  static async getBonusGate() {
    requireTenantId();
    // ...
  }
}
```

- [ ] **Step C3-2: 清理 analytics.service.ts — 改為純 façade**

最終 `analytics.service.ts` 只剩 façade 轉發：

```typescript
// systems/enterprise-admin/backend/src/modules/analytics/analytics.service.ts
import { CrmAnalyticsService } from './crm-analytics.service';
import { ProductAnalyticsService } from './product-analytics.service';
import { OperationsAnalyticsService } from './operations-analytics.service';

export * from './crm-analytics.service';
export * from './product-analytics.service';
export * from './operations-analytics.service';

export class AnalyticsService {
  static getRfm = CrmAnalyticsService.getRfm;
  static getChurnRisk = CrmAnalyticsService.getChurnRisk;
  static getProductAbc = ProductAnalyticsService.getProductAbc;
  static getSupplierRanking = ProductAnalyticsService.getSupplierRanking;
  static getKpis = OperationsAnalyticsService.getKpis;
  static getTrends = OperationsAnalyticsService.getTrends;
  static getHeatmap = OperationsAnalyticsService.getHeatmap;
  static getBonusGate = OperationsAnalyticsService.getBonusGate;
}
```

- [ ] **Step C3-3: analytics.controller.ts 的 import 保持不變**

由於 AnalyticsService 仍 re-export 所有 method，controller 不需修改。確認：

```bash
grep "AnalyticsService" systems/enterprise-admin/backend/src/modules/analytics/analytics.controller.ts | head -5
```

預期：import 仍指向 `./analytics.service`，無需改動。

- [ ] **Step C3-4: 執行完整測試套件**

```bash
npx vitest run
```

預期：`PASS` — 所有測試

- [ ] **Step C3-5: 確認 analytics.service.ts 行數已大幅縮減**

```bash
wc -l systems/enterprise-admin/backend/src/modules/analytics/analytics.service.ts
```

預期：< 50 行（純 façade）

- [ ] **Step C3-6: 更新測試 import 讓各子服務可被獨立測試**

在 `analytics.service.test.ts` 之後，確認各子服務有對應測試（若沒有，補充最小 smoke test）：

```bash
# 檢查是否有子服務測試
ls systems/enterprise-admin/backend/src/__tests__/*analytics*
```

若只有 `analytics.service.test.ts`，不需補充——現有測試透過 façade 已完整覆蓋。

- [ ] **Step C3-7: Commit**

```bash
git add backend/src/modules/analytics/operations-analytics.service.ts \
        backend/src/modules/analytics/analytics.service.ts
git commit -m "refactor(analytics): extract OperationsAnalyticsService, analytics.service.ts now pure facade — closes C-04"
```

- [ ] **Step C3-8: 更新 ROADMAP 的 C-04 說明**

在 ROADMAP.md 的 C-04 section 加入：

```markdown
### C-04: Analytics 模組 API 合約邊界（已完成 2026-05-20）
- [x] AnalyticsService 拆分為 CrmAnalyticsService / ProductAnalyticsService / OperationsAnalyticsService
- [x] analytics.service.ts 作為 façade 維持後向相容
```

```bash
git add systems/enterprise-admin/ROADMAP.md
git commit -m "docs(roadmap): mark C-04 analytics split as complete"
```

---

## 執行優先順序總覽

| Track | 任務 | 預估時間 | 前置條件 |
|-------|------|---------|---------|
| **A** | SAAS-03 Plan Gating | ~2h | 無 |
| **B** | INT-02 CSV 匯入匯出 | ~4h | 無 |
| **C** | C-04 Analytics 拆分 | ~3h | 無 |
| **D** | Phase 10 電子發票 | ~8h | Phase 9 PR #5 merge |

Track A/B/C 可同時在不同 worktree 執行。
