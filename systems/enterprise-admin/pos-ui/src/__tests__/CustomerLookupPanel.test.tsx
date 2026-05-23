import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CustomerLookupPanel from '../components/CustomerLookupPanel';
import type { PosCustomerLookup } from '../api/pos';

const { lookupCustomer } = vi.hoisted(() => ({
  lookupCustomer: vi.fn(),
}));

vi.mock('../api/pos', async () => {
  const actual = await vi.importActual<object>('../api/pos');
  return {
    ...actual,
    posApi: {
      lookupCustomer,
    },
  };
});

const vipCustomer: PosCustomerLookup = {
  id: 'customer-1',
  name: '王小美',
  phone: '0912345678',
  rfmSegment: 'vip',
  totalSpent: 12500,
  purchaseCount: 8,
  lastPurchaseDate: '2026-05-01T00:00:00.000Z',
  daysSinceLastPurchase: 12,
  recentPurchases: [{ productId: 'prod-1', name: '魚油', sku: 'FISH', quantity: 1, purchasedAt: '2026-05-01T00:00:00.000Z' }],
  supplementDueItems: [],
};

describe('CustomerLookupPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('looks up a customer and shows the selected customer card', async () => {
    const user = userEvent.setup();
    lookupCustomer.mockResolvedValue({ data: { success: true, data: vipCustomer } });
    const onSelect = vi.fn();
    const onFeedback = vi.fn();

    render(<CustomerLookupPanel selectedCustomer={null} onSelect={onSelect} onFeedback={onFeedback} />);

    await user.type(screen.getByLabelText('客戶查詢'), '0912345678');
    await user.click(screen.getByRole('button', { name: '查詢客戶' }));

    expect(lookupCustomer).toHaveBeenCalledWith('0912345678');
    expect(onSelect).toHaveBeenCalledWith(vipCustomer);
    expect(onFeedback).toHaveBeenCalledWith({ type: 'success', message: 'VIP 客戶 王小美，累計消費 $12,500' });
    expect(await screen.findByText('王小美')).toBeInTheDocument();
    expect(screen.getByText('VIP')).toBeInTheDocument();
    expect(screen.getByText('累計 $12,500')).toBeInTheDocument();
  });

  it('warns when a customer is at risk of churn', async () => {
    const user = userEvent.setup();
    const onFeedback = vi.fn();
    lookupCustomer.mockResolvedValue({
      data: {
        success: true,
        data: { ...vipCustomer, rfmSegment: 'at_risk', daysSinceLastPurchase: 96, totalSpent: 4200 },
      },
    });

    render(<CustomerLookupPanel selectedCustomer={null} onSelect={vi.fn()} onFeedback={onFeedback} />);

    await user.type(screen.getByLabelText('客戶查詢'), '0922');
    await user.click(screen.getByRole('button', { name: '查詢客戶' }));

    expect(onFeedback).toHaveBeenCalledWith({ type: 'warning', message: '90 天未回購，請關懷 王小美' });
  });

  it('shows not found feedback without selecting a customer', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onFeedback = vi.fn();
    lookupCustomer.mockResolvedValue({ data: { success: true, data: null } });

    render(<CustomerLookupPanel selectedCustomer={null} onSelect={onSelect} onFeedback={onFeedback} />);

    await user.type(screen.getByLabelText('客戶查詢'), '0000');
    await user.click(screen.getByRole('button', { name: '查詢客戶' }));

    expect(onSelect).not.toHaveBeenCalled();
    expect(onFeedback).toHaveBeenCalledWith({ type: 'info', message: '找不到符合的客戶' });
  });
});
