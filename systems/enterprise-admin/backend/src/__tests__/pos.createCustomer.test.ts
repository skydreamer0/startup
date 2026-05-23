import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', () => ({
  prisma: {},
}));

vi.mock('../lib/tenant.context', () => ({
  requireTenantId: vi.fn(() => 'tenant-1'),
}));

vi.mock('../modules/crm/crm.service', () => ({
  CrmService: {
    createCustomer: vi.fn(),
  },
}));

import { AppError } from '../lib/errors';
import { CrmService } from '../modules/crm/crm.service';
import { CheckoutService } from '../modules/pos/checkout.service';

describe('CheckoutService.createCustomer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates customer and returns POS lookup shape for a new customer', async () => {
    vi.mocked(CrmService.createCustomer).mockResolvedValue({
      id: 'customer-1',
      name: 'Test Customer',
      phone: '0912345678',
    });

    const result = await CheckoutService.createCustomer({ phone: '0912345678', name: 'Test Customer' });

    expect(CrmService.createCustomer).toHaveBeenCalledWith({
      phone: '0912345678',
      name: 'Test Customer',
    });
    expect(result).toEqual({
      id: 'customer-1',
      name: 'Test Customer',
      phone: '0912345678',
      rfmSegment: 'new',
      totalSpent: 0,
      purchaseCount: 0,
      lastPurchaseDate: null,
      daysSinceLastPurchase: null,
      recentPurchases: [],
      supplementDueItems: [],
    });
  });

  it('propagates 409 AppError when duplicate phone exists', async () => {
    const duplicatePhoneError = new AppError(409, 'Phone number already registered');
    vi.mocked(CrmService.createCustomer).mockRejectedValue(duplicatePhoneError);

    await expect(CheckoutService.createCustomer({ phone: '0912345678' })).rejects.toBe(duplicatePhoneError);
  });
});
