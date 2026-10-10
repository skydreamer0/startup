import { useState } from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CustomerLookupPanel from '../components/CustomerLookupPanel';
import type { PosCustomerLookup } from '../api/pos';

const { lookupCustomer, createCustomer } = vi.hoisted(() => ({
  lookupCustomer: vi.fn(),
  createCustomer: vi.fn(),
}));

vi.mock('../api/pos', async () => {
  const actual = await vi.importActual<object>('../api/pos');
  return {
    ...actual,
    posApi: {
      lookupCustomer,
      createCustomer,
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

function ControlledPanel(props: React.ComponentProps<typeof CustomerLookupPanel>) {
  const [selectedCustomer, setCustomer] = useState(props.selectedCustomer);
  return <CustomerLookupPanel {...props} selectedCustomer={selectedCustomer}
    onSelect={(customer) => { setCustomer(customer); props.onSelect(customer); }}
    onClear={() => { setCustomer(null); props.onClear?.(); }} />;
}

describe('CustomerLookupPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('looks up a customer and shows the selected customer card', async () => {
    const user = userEvent.setup();
    lookupCustomer.mockResolvedValue({ data: { success: true, data: vipCustomer } });
    const onSelect = vi.fn();
    const onFeedback = vi.fn();

    render(<ControlledPanel selectedCustomer={null} onSelect={onSelect} onFeedback={onFeedback} />);

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

    render(<ControlledPanel selectedCustomer={null} onSelect={vi.fn()} onFeedback={onFeedback} />);

    await user.type(screen.getByLabelText('客戶查詢'), '0922');
    await user.click(screen.getByRole('button', { name: '查詢客戶' }));

    expect(onFeedback).toHaveBeenCalledWith({ type: 'warning', message: '90 天未回購，請關懷 王小美' });
  });

  it('shows inline 新增客戶 prompt when lookup returns no match', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onFeedback = vi.fn();
    lookupCustomer.mockResolvedValue({ data: { success: true, data: null } });

    render(<ControlledPanel selectedCustomer={null} onSelect={onSelect} onFeedback={onFeedback} />);

    await user.type(screen.getByLabelText('客戶查詢'), '0000');
    await user.click(screen.getByRole('button', { name: '查詢客戶' }));

    expect(onSelect).not.toHaveBeenCalled();
    expect(onFeedback).not.toHaveBeenCalled();
    expect(await screen.findByText('此電話無紀錄')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '新增客戶' })).toBeInTheDocument();
  });

  it('creates a new customer and selects them after inline registration', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onFeedback = vi.fn();
    const newCustomer: PosCustomerLookup = {
      id: 'cust-new-1',
      name: '陳小明',
      phone: '0900000000',
      rfmSegment: 'new',
      totalSpent: 0,
      purchaseCount: 0,
      lastPurchaseDate: null,
      daysSinceLastPurchase: null,
      recentPurchases: [],
      supplementDueItems: [],
    };
    lookupCustomer.mockResolvedValue({ data: { success: true, data: null } });
    createCustomer.mockResolvedValue({ data: { success: true, data: newCustomer } });

    render(<ControlledPanel selectedCustomer={null} onSelect={onSelect} onFeedback={onFeedback} />);

    await user.type(screen.getByLabelText('客戶查詢'), '0900000000');
    await user.click(screen.getByRole('button', { name: '查詢客戶' }));
    await screen.findByText('此電話無紀錄');

    await user.click(screen.getByRole('button', { name: '新增客戶' }));
    await user.type(screen.getByPlaceholderText('姓名（選填）'), '陳小明');
    await user.click(screen.getByRole('button', { name: '建立' }));

    expect(createCustomer).toHaveBeenCalledWith({ phone: '0900000000', name: '陳小明' });
    expect(onSelect).toHaveBeenCalledWith(newCustomer);
    expect(onFeedback).toHaveBeenCalledWith({ type: 'success', message: '已建立新客戶：陳小明' });
  });

  it('shows 409 error toast and keeps form open on duplicate phone', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onFeedback = vi.fn();
    lookupCustomer.mockResolvedValue({ data: { success: true, data: null } });
    const conflictError = Object.assign(new Error('conflict'), {
      isAxiosError: true,
      response: { status: 409 },
    });
    createCustomer.mockRejectedValue(conflictError);

    render(<ControlledPanel selectedCustomer={null} onSelect={onSelect} onFeedback={onFeedback} />);

    await user.type(screen.getByLabelText('客戶查詢'), '0900000000');
    await user.click(screen.getByRole('button', { name: '查詢客戶' }));
    await screen.findByText('此電話無紀錄');

    await user.click(screen.getByRole('button', { name: '新增客戶' }));
    await user.click(screen.getByRole('button', { name: '建立' }));

    expect(onSelect).not.toHaveBeenCalled();
    expect(onFeedback).toHaveBeenCalledWith({ type: 'error', message: '此電話已有客戶紀錄，請直接查詢' });
    expect(screen.getByPlaceholderText('電話')).toBeInTheDocument();
  });

  it('returns to idle when Cancel is clicked in creating form', async () => {
    const user = userEvent.setup();
    lookupCustomer.mockResolvedValue({ data: { success: true, data: null } });

    render(<ControlledPanel selectedCustomer={null} onSelect={vi.fn()} onFeedback={vi.fn()} />);

    await user.type(screen.getByLabelText('客戶查詢'), '0900000000');
    await user.click(screen.getByRole('button', { name: '查詢客戶' }));
    await screen.findByText('此電話無紀錄');

    await user.click(screen.getByRole('button', { name: '新增客戶' }));
    expect(screen.getByPlaceholderText('電話')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '取消' }));
    expect(screen.queryByPlaceholderText('電話')).not.toBeInTheDocument();
    expect(screen.queryByText('此電話無紀錄')).not.toBeInTheDocument();
  });
});
