import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', () => ({
  prisma: {
    shift: { findFirst: vi.fn() },
    product: { findFirst: vi.fn(), updateMany: vi.fn() },
    productBatch: { findMany: vi.fn(), updateMany: vi.fn() },
    customer: { findFirst: vi.fn() },
    order: { findFirst: vi.fn(), create: vi.fn() },
    inventoryTransaction: { create: vi.fn() },
    saleBatchAllocation: { createMany: vi.fn() },
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
  checkoutCommand: { createMany: vi.fn(), updateMany: vi.fn() },
  shift: { findFirst: vi.fn() },
  product: { findFirst: vi.fn(), updateMany: vi.fn() },
  productBatch: { findMany: vi.fn(), updateMany: vi.fn() },
  customer: { findFirst: vi.fn() },
  order: { findFirst: vi.fn(), create: vi.fn() },
  inventoryTransaction: { create: vi.fn() },
  saleBatchAllocation: { createMany: vi.fn() },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockTx.checkoutCommand.createMany.mockResolvedValue({ count: 1 });
  mockTx.checkoutCommand.updateMany.mockResolvedValue({ count: 1 });
  mockTx.product.updateMany.mockResolvedValue({ count: 1 });
  mockTx.productBatch.updateMany.mockResolvedValue({ count: 1 });
  vi.mocked(prisma.$transaction).mockImplementation(async (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx));
});

const baseDto: CheckoutDto = {
  commandId: "44444444-4444-4444-8444-444444444444",
  cartItems: [{ productId: '11111111-1111-4111-8111-111111111111', quantity: 2, discountRate: 0 }],
  paymentMethod: 'CASH',
  orderDiscountAmount: 0,
  shiftId: '22222222-2222-4222-8222-222222222222',
};

describe('CheckoutService.checkout', () => {
  it('throws 400 when shift is not OPEN', async () => {
    mockTx.shift.findFirst.mockResolvedValue({ id: '22222222-2222-4222-8222-222222222222', status: 'CLOSED', staffId: 'staff-1' });
    await expect(CheckoutService.checkout(baseDto)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws 400 when product has insufficient stock', async () => {
    mockTx.shift.findFirst.mockResolvedValue({ id: '22222222-2222-4222-8222-222222222222', status: 'OPEN', staffId: 'staff-1' });
    mockTx.customer.findFirst.mockResolvedValue({ id: 'walk-in-id' });
    mockTx.product.findFirst.mockResolvedValue({ id: '11111111-1111-4111-8111-111111111111', stockQuantity: 1, retailPrice: 100, name: 'Test' });
    mockTx.productBatch.findMany.mockResolvedValue([]);
    await expect(CheckoutService.checkout(baseDto)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('creates order with correct totalAmount after discount', async () => {
    const shift = { id: '22222222-2222-4222-8222-222222222222', status: 'OPEN', staffId: 'staff-1', tenantId: 'tenant-1' };
    mockTx.shift.findFirst.mockResolvedValue(shift);
    mockTx.customer.findFirst.mockResolvedValue({ id: 'walk-in-id' });
    mockTx.product.findFirst.mockResolvedValue({ id: '11111111-1111-4111-8111-111111111111', stockQuantity: 10, retailPrice: 100, name: 'Test' });
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
    expect(result).toEqual(createdOrder);
  });

  it('uses shift.staffId when salesStaffId not provided', async () => {
    const shift = { id: '22222222-2222-4222-8222-222222222222', status: 'OPEN', staffId: 'staff-from-shift', tenantId: 'tenant-1' };
    mockTx.shift.findFirst.mockResolvedValue(shift);
    mockTx.customer.findFirst.mockResolvedValue({ id: 'walk-in-id' });
    mockTx.product.findFirst.mockResolvedValue({ id: '11111111-1111-4111-8111-111111111111', stockQuantity: 5, retailPrice: 50, name: 'Item' });
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
    const shift = { id: '22222222-2222-4222-8222-222222222222', status: 'OPEN', staffId: 'staff-1', tenantId: 'tenant-1' };
    mockTx.shift.findFirst.mockResolvedValue(shift);
    mockTx.customer.findFirst.mockResolvedValue(null);

    await expect(CheckoutService.checkout({ ...baseDto, customerId: '33333333-3333-4333-8333-333333333333' })).rejects.toMatchObject({
      statusCode: 404,
    });

    expect(mockTx.customer.findFirst).toHaveBeenCalledWith({
      where: { id: '33333333-3333-4333-8333-333333333333', tenantId: 'tenant-1' },
      select: { id: true },
    });
    expect(mockTx.order.create).not.toHaveBeenCalled();
  });
});
