import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/tenant.context', () => ({
  requireTenantId: vi.fn(() => 'test-tenant-id'),
  tenantContext: { getStore: vi.fn(() => ({ tenantId: 'test-tenant-id', plan: 'pro' })) },
}));

vi.mock('../lib/prisma', () => ({
  prisma: {
    product: { findMany: vi.fn() },
    order: { findMany: vi.fn() },
    customer: { findMany: vi.fn() },
  },
}));

import { CsvService } from '../modules/inventory/csv.service';
import { prisma } from '../lib/prisma';

const mockProductFindMany = vi.mocked(prisma.product.findMany);
const mockOrderFindMany = vi.mocked(prisma.order.findMany);
const mockCustomerFindMany = vi.mocked(prisma.customer.findMany);

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
    expect(csv).toContain('商品名稱');
    expect(csv).toContain('SKU');
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
      } as any,
    ]);

    const csv = await CsvService.exportOrders();
    expect(csv).toContain('訂單編號');
    expect(csv).toContain('ORD-001');
    expect(csv).toContain('150');
  });
});

describe('CsvService.parseProductImportCsv', () => {
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
