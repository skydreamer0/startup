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

  it('returns product CSV rows with relation labels and safety stock', async () => {
    mockProductFindMany.mockResolvedValue([
      {
        name: '阿斯匹靈',
        sku: 'ASP-001',
        retailPrice: '15.5',
        costPrice: { toString: () => '8.25' },
        stockQuantity: 100,
        safetyStock: 7,
        category: { name: '止痛藥' },
        supplier: { name: '良好供應商' },
      },
    ]);

    const csv = await CsvService.exportProducts();

    expect(mockProductFindMany).toHaveBeenCalledWith({
      where: { tenantId: 'test-tenant-id' },
      include: { category: true, supplier: true },
      orderBy: { name: 'asc' },
    });
    expect(csv).toContain('商品名稱,SKU,售價,成本,庫存,安全庫存天數,分類,供應商');
    expect(csv).toContain('阿斯匹靈,ASP-001,15.5,8.25,100,7,止痛藥,良好供應商');
  });

  it('returns only header row when no products exist', async () => {
    mockProductFindMany.mockResolvedValue([]);

    const csv = await CsvService.exportProducts();
    const lines = csv.trim().split('\n');

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('商品名稱');
  });
});

describe('CsvService.exportOrders', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns order CSV rows with customer and sales staff names', async () => {
    mockOrderFindMany.mockResolvedValue([
      {
        id: 'order-id-1234',
        orderNumber: 'ORD-001',
        status: 'completed',
        totalAmount: { toString: () => '150' },
        paymentMethod: 'CASH',
        createdAt: new Date('2026-05-01T12:00:00.000Z'),
        customer: { name: '王小明' },
        salesStaff: { fullName: '李店員' },
      },
    ]);

    const startDate = new Date('2026-05-01T00:00:00.000Z');
    const endDate = new Date('2026-05-31T23:59:59.999Z');
    const csv = await CsvService.exportOrders(startDate, endDate);

    expect(mockOrderFindMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'test-tenant-id',
        createdAt: { gte: startDate, lte: endDate },
      },
      include: { customer: true, salesStaff: true },
      orderBy: { createdAt: 'desc' },
    });
    expect(csv).toContain('訂單編號,狀態,總金額,付款方式,客戶,銷售人員,建立日期');
    expect(csv).toContain('ORD-001,completed,150,CASH,王小明,李店員,2026-05-01');
  });

  it('falls back to the shortened order id when order number is missing', async () => {
    mockOrderFindMany.mockResolvedValue([
      {
        id: 'abcdef123456',
        orderNumber: null,
        status: 'paid',
        totalAmount: 99,
        paymentMethod: null,
        createdAt: new Date('2026-05-02T12:00:00.000Z'),
        customer: null,
        salesStaff: null,
      },
    ]);

    const csv = await CsvService.exportOrders();

    expect(csv).toContain('abcdef12,paid,99,,,,2026-05-02');
  });
});

describe('CsvService.exportCustomers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns customer CSV rows', async () => {
    mockCustomerFindMany.mockResolvedValue([
      {
        name: '陳小姐',
        phone: '0912345678',
        totalSpent: 1200,
        purchaseCount: 3,
        createdAt: new Date('2026-04-15T00:00:00.000Z'),
      },
    ]);

    const csv = await CsvService.exportCustomers();

    expect(mockCustomerFindMany).toHaveBeenCalledWith({
      where: { tenantId: 'test-tenant-id' },
      orderBy: { createdAt: 'desc' },
    });
    expect(csv).toContain('姓名,電話,累計消費,購買次數,加入日期');
    expect(csv).toContain('陳小姐,0912345678,1200,3,2026-04-15');
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
