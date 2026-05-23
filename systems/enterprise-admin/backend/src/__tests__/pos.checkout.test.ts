import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', () => ({
  prisma: {
    shift: { findFirst: vi.fn() },
    product: { findFirst: vi.fn(), update: vi.fn() },
    productBatch: { findMany: vi.fn(), update: vi.fn() },
    customer: { findFirst: vi.fn() },
    order: { findFirst: vi.fn(), create: vi.fn() },
    inventoryTransaction: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('../lib/tenant.context', () => ({
  requireTenantId: vi.fn(() => 'tenant-1'),
}));

import { prisma } from '../lib/prisma';
import { CheckoutService } from '../modules/pos/checkout.service';
import { CheckoutDto } from '../modules/pos/pos.schema';

const mockTx = {
  shift: { findFirst: vi.fn() },
  product: { findFirst: vi.fn(), update: vi.fn() },
  productBatch: { findMany: vi.fn(), update: vi.fn() },
  customer: { findFirst: vi.fn() },
  order: { findFirst: vi.fn(), create: vi.fn() },
  inventoryTransaction: { create: vi.fn() },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.$transaction).mockImplementation(async (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx));
});

const baseDto: CheckoutDto = {
  cartItems: [{ productId: 'prod-1', quantity: 2, discountRate: 0 }],
  paymentMethod: 'CASH',
  orderDiscountAmount: 0,
  shiftId: 'shift-1',
};

describe('CheckoutService.checkout', () => {
  it('throws 400 when shift is not OPEN', async () => {
    mockTx.shift.findFirst.mockResolvedValue({ id: 'shift-1', status: 'CLOSED', staffId: 'staff-1' });
    await expect(CheckoutService.checkout(baseDto)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws 400 when product has insufficient stock', async () => {
    mockTx.shift.findFirst.mockResolvedValue({ id: 'shift-1', status: 'OPEN', staffId: 'staff-1' });
    mockTx.customer.findFirst.mockResolvedValue({ id: 'walk-in-id' });
    mockTx.product.findFirst.mockResolvedValue({ id: 'prod-1', stockQuantity: 1, retailPrice: 100, name: 'Test' });
    mockTx.productBatch.findMany.mockResolvedValue([]);
    await expect(CheckoutService.checkout(baseDto)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('creates order with correct totalAmount after discount', async () => {
    const shift = { id: 'shift-1', status: 'OPEN', staffId: 'staff-1', tenantId: 'tenant-1' };
    mockTx.shift.findFirst.mockResolvedValue(shift);
    mockTx.customer.findFirst.mockResolvedValue({ id: 'walk-in-id' });
    mockTx.product.findFirst.mockResolvedValue({ id: 'prod-1', stockQuantity: 10, retailPrice: 100, name: 'Test' });
    mockTx.productBatch.findMany.mockResolvedValue([
      { id: 'batch-1', quantity: 10, expiryDate: new Date('2027-01-01') },
    ]);
    mockTx.order.findFirst.mockResolvedValue(null);
    const createdOrder = { id: 'order-1', orderNumber: 'POS-20260516-00001', totalAmount: 180 };
    mockTx.order.create.mockResolvedValue(createdOrder);
    mockTx.inventoryTransaction.create.mockResolvedValue({});

    const dto: CheckoutDto = { ...baseDto, orderDiscountAmount: 20 }; // 2×100 − 20 = 180
    const result = await CheckoutService.checkout(dto);

    expect(mockTx.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ totalAmount: 180 }),
      }),
    );
    expect(result).toBe(createdOrder);
  });

  it('uses shift.staffId when salesStaffId not provided', async () => {
    const shift = { id: 'shift-1', status: 'OPEN', staffId: 'staff-from-shift', tenantId: 'tenant-1' };
    mockTx.shift.findFirst.mockResolvedValue(shift);
    mockTx.customer.findFirst.mockResolvedValue({ id: 'walk-in-id' });
    mockTx.product.findFirst.mockResolvedValue({ id: 'prod-1', stockQuantity: 5, retailPrice: 50, name: 'Item' });
    mockTx.productBatch.findMany.mockResolvedValue([{ id: 'b1', quantity: 5, expiryDate: new Date('2027-01-01') }]);
    mockTx.order.findFirst.mockResolvedValue(null);
    mockTx.order.create.mockResolvedValue({ id: 'o1' });
    mockTx.inventoryTransaction.create.mockResolvedValue({});

    await CheckoutService.checkout(baseDto);

    expect(mockTx.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ salesStaffId: 'staff-from-shift' }),
      }),
    );
  });

  it('rejects customer IDs outside the current tenant before creating an order', async () => {
    const shift = { id: 'shift-1', status: 'OPEN', staffId: 'staff-1', tenantId: 'tenant-1' };
    mockTx.shift.findFirst.mockResolvedValue(shift);
    mockTx.customer.findFirst.mockResolvedValue(null);

    await expect(CheckoutService.checkout({ ...baseDto, customerId: 'customer-from-other-tenant' })).rejects.toMatchObject({
      statusCode: 404,
    });

    expect(mockTx.customer.findFirst).toHaveBeenCalledWith({
      where: { id: 'customer-from-other-tenant', tenantId: 'tenant-1' },
      select: { id: true },
    });
    expect(mockTx.order.create).not.toHaveBeenCalled();
  });
});
