import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CartPanel from '../components/CartPanel';
import { useCartStore } from '../store/cartStore';
import { PosProduct } from '../api/pos';

const product: PosProduct = {
  id: 'p1', name: 'Panadol', sku: 'PAN', retailPrice: 100, stockQuantity: 20,
};

const defaultProps = {
  currentStaffName: '張藥師',
  onCheckout: vi.fn(),
  onSwitchStaff: vi.fn(),
};

function setupCart(quantity = 1, discountRate = 0, orderDiscount = 0) {
  useCartStore.setState({
    items: quantity > 0 ? [{ product, quantity, discountRate }] : [],
    orderDiscountAmount: orderDiscount,
    orderDiscountNote: '',
    paymentMethod: 'CASH',
    currentSalesStaffId: null,
  });
}

beforeEach(() => {
  setupCart(0);
  vi.clearAllMocks();
});

describe('CartPanel empty state', () => {
  it('shows empty message when cart is empty', () => {
    setupCart(0);
    render(<CartPanel {...defaultProps} />);
    expect(screen.getByText('購物車為空')).toBeInTheDocument();
  });

  it('disables checkout button when cart is empty', () => {
    setupCart(0);
    render(<CartPanel {...defaultProps} />);
    expect(screen.getByRole('button', { name: /結帳/ })).toBeDisabled();
  });
});

describe('CartPanel subtotal display', () => {
  it('shows subtotal = price × quantity', () => {
    setupCart(2); // 100 × 2 = 200
    render(<CartPanel {...defaultProps} />);
    expect(screen.getByText(/小計 \$200/)).toBeInTheDocument();
  });

  it('shows subtotal with item discount applied', () => {
    setupCart(1, 10); // 100 × 0.9 = 90
    render(<CartPanel {...defaultProps} />);
    expect(screen.getByText(/小計 \$90/)).toBeInTheDocument();
  });
});

describe('CartPanel total display', () => {
  it('shows total = subtotal when no order discount', () => {
    setupCart(3); // subtotal=300
    render(<CartPanel {...defaultProps} />);
    expect(screen.getByText(/合計 \$300/)).toBeInTheDocument();
  });

  it('shows total = subtotal - orderDiscount', () => {
    setupCart(3, 0, 50); // subtotal=300, discount=50, total=250
    render(<CartPanel {...defaultProps} />);
    expect(screen.getByText(/合計 \$250/)).toBeInTheDocument();
  });
});

describe('CartPanel order discount input', () => {
  it('updates total when user types order discount', async () => {
    const user = userEvent.setup();
    setupCart(1); // subtotal=100
    render(<CartPanel {...defaultProps} />);
    const discountInput = within(screen.getByText('整筆折扣').parentElement!).getByPlaceholderText('0');
    await user.clear(discountInput);
    await user.type(discountInput, '30');
    expect(useCartStore.getState().orderDiscountAmount).toBe(30);
    expect(screen.getByText(/合計 \$70/)).toBeInTheDocument();
  });
});

describe('CartPanel payment method', () => {
  it('updates payment method in store when clicked', async () => {
    const user = userEvent.setup();
    setupCart(1);
    render(<CartPanel {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: '刷卡' }));
    expect(useCartStore.getState().paymentMethod).toBe('CARD');
  });
});

describe('CartPanel checkout button', () => {
  it('calls onCheckout when clicked with items', async () => {
    const user = userEvent.setup();
    setupCart(1);
    render(<CartPanel {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: /結帳/ }));
    expect(defaultProps.onCheckout).toHaveBeenCalledOnce();
  });
});
