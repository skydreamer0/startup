import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CartPanel from '../components/CartPanel';
import { useCartStore } from '../store/cartStore';
import { PosProduct } from '../api/pos';

const product: PosProduct = {
  id: 'p1',
  name: 'Panadol',
  sku: 'PAN',
  retailPrice: 100,
  stockQuantity: 20,
};

const defaultProps = {
  currentStaffName: '王小明',
  onCheckout: vi.fn(),
  onSplitCheckout: vi.fn(),
  onSwitchStaff: vi.fn(),
};

function setupCart(quantity = 1, discountRate = 0, orderDiscount = 0) {
  useCartStore.setState({
    items: quantity > 0 ? [{ product, quantity, discountRate }] : [],
    orderDiscountAmount: orderDiscount,
    orderDiscountNote: '',
    paymentMethod: 'CASH',
    currentSalesStaffId: null,
    heldCarts: [],
  });
}

beforeEach(() => {
  setupCart(0);
  vi.clearAllMocks();
});

describe('CartPanel empty state', () => {
  it('shows a readable empty cart message', () => {
    setupCart(0);
    render(<CartPanel {...defaultProps} />);
    expect(screen.getByText('點擊商品加入購物車')).toBeInTheDocument();
  });

  it('disables checkout button when cart is empty', () => {
    setupCart(0);
    render(<CartPanel {...defaultProps} />);
    expect(screen.getByTestId('cart-checkout-button')).toBeDisabled();
  });
});

describe('CartPanel subtotal display', () => {
  it('shows subtotal = price x quantity', () => {
    setupCart(2);
    render(<CartPanel {...defaultProps} />);
    const subtotalRow = screen.getByText('小計').closest('div')!;
    expect(within(subtotalRow).getByText('$200')).toBeInTheDocument();
  });

  it('shows subtotal with item discount applied', () => {
    setupCart(1, 10);
    render(<CartPanel {...defaultProps} />);
    const subtotalRow = screen.getByText('小計').closest('div')!;
    expect(within(subtotalRow).getByText('$90')).toBeInTheDocument();
  });
});

describe('CartPanel total display', () => {
  it('shows total = subtotal when no order discount', () => {
    setupCart(3);
    render(<CartPanel {...defaultProps} />);
    const totalRow = screen.getByText('總計金額').closest('div')!;
    expect(within(totalRow).getByText('$300')).toBeInTheDocument();
  });

  it('shows total = subtotal - orderDiscount', () => {
    setupCart(3, 0, 50);
    render(<CartPanel {...defaultProps} />);
    const totalRow = screen.getByText('總計金額').closest('div')!;
    expect(within(totalRow).getByText('$250')).toBeInTheDocument();
  });
});

describe('CartPanel order discount input', () => {
  it('updates total when user types order discount', async () => {
    const user = userEvent.setup();
    setupCart(1);
    render(<CartPanel {...defaultProps} />);
    const discountInput = within(screen.getByText('整筆折扣').parentElement!).getByPlaceholderText('0');
    await user.clear(discountInput);
    await user.type(discountInput, '30');
    expect(useCartStore.getState().orderDiscountAmount).toBe(30);
    expect(screen.getByText('$70')).toBeInTheDocument();
  });
});

describe('CartPanel payment method', () => {
  it('updates payment method in store when clicked', async () => {
    const user = userEvent.setup();
    setupCart(1);
    render(<CartPanel {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: '信用卡' }));
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

describe('CartPanel clear cart confirmation', () => {
  it('requires a second click before clearing the cart', async () => {
    const user = userEvent.setup();
    setupCart(1);
    render(<CartPanel {...defaultProps} />);

    await user.click(screen.getByRole('button', { name: /清空購物車/ }));
    expect(useCartStore.getState().items).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('再按一次確認清空');

    await user.click(screen.getByRole('button', { name: /再按一次確認清空/ }));
    expect(useCartStore.getState().items).toHaveLength(0);
  });
});
