import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PaymentModal from '../components/PaymentModal';
import { useCartStore } from '../store/cartStore';
import { PosProduct } from '../api/pos';

const product: PosProduct = {
  id: 'p1',
  name: 'Panadol',
  sku: 'PAN',
  retailPrice: 100,
  stockQuantity: 20,
};

beforeEach(() => {
  useCartStore.setState({
    items: [{ product, quantity: 2, discountRate: 0 }],
    orderDiscountAmount: 0,
    orderDiscountNote: '',
    paymentMethod: 'CASH',
    currentSalesStaffId: null,
  });
});

describe('PaymentModal', () => {
  it('shows readable payment labels and total', () => {
    render(<PaymentModal onConfirm={vi.fn()} onClose={vi.fn()} loading={false} />);

    expect(screen.getByRole('heading', { name: '確認結帳' })).toBeInTheDocument();
    expect(screen.getByText('$200 元')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '現金' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '信用卡' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '取消' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '確認付款' })).toBeInTheDocument();
  });

  it('does not double-submit while loading', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<PaymentModal onConfirm={onConfirm} onClose={vi.fn()} loading />);

    const confirmButton = screen.getByRole('button', { name: '付款處理中...' });
    expect(confirmButton).toBeDisabled();
    await user.click(confirmButton);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
