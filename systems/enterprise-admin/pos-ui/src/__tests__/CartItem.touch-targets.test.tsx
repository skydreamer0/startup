import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CartItem from '../components/CartItem';
import { useCartStore } from '../store/cartStore';
import { useCheckoutRecoveryStore } from '../store/checkoutRecoveryStore';

const product = { id: 'touch-item', name: '觸控測試商品', sku: 'TOUCH', retailPrice: 125, stockQuantity: 5 };

beforeEach(() => {
  useCheckoutRecoveryStore.setState({ scope: null, pending: null });
  useCartStore.setState({
    items: [{ product, quantity: 2, discountRate: 0 }],
    orderDiscountAmount: 0, orderDiscountNote: '', paymentMethod: 'CASH',
    currentSalesStaffId: null, heldCarts: [],
  });
  render(<CartItem item={useCartStore.getState().items[0]} />);
});

describe('CartItem declared touch-target minimums (JSDOM, not browser geometry)', () => {
  it('keeps quantity and removal controls at least 44 CSS px without flex shrinking', () => {
    for (const name of ['增加數量', '減少數量', '移除 觸控測試商品']) {
      expect(screen.getByRole('button', { name })).toHaveStyle({ minWidth: '44px', minHeight: '44px', flexShrink: '0' });
    }
    expect(screen.getByRole('spinbutton', { name: '商品數量' })).toHaveStyle({ minWidth: '44px', minHeight: '44px', flexShrink: '0' });
    expect(screen.getByRole('textbox', { name: '商品折扣百分比' })).toHaveStyle({ minWidth: '44px', minHeight: '44px' });
  });

  it('preserves repeated quantity clicks, stock cap, typed quantity and discount arithmetic', async () => {
    const user = userEvent.setup();
    const increase = screen.getByRole('button', { name: '增加數量' });
    for (let count = 0; count < 5; count += 1) await user.click(increase);
    expect(useCartStore.getState().items[0].quantity).toBe(5);
    await user.click(screen.getByRole('button', { name: '減少數量' }));
    expect(useCartStore.getState().items[0].quantity).toBe(4);
    const quantity = screen.getByRole('spinbutton', { name: '商品數量' });
    await user.clear(quantity); await user.type(quantity, '3{Enter}');
    const discount = screen.getByRole('textbox', { name: '商品折扣百分比' });
    await user.type(discount, '20');
    expect(useCartStore.getState().items[0]).toMatchObject({ quantity: 3, discountRate: 20 });
    expect(screen.getByText('$300')).toBeInTheDocument();
  });

  it.each(['{Enter}', ' '])('preserves native %s activation and removal', async (key) => {
    const user = userEvent.setup();
    screen.getByRole('button', { name: '增加數量' }).focus();
    await user.keyboard(key);
    expect(useCartStore.getState().items[0].quantity).toBe(3);
    screen.getByRole('button', { name: '移除 觸控測試商品' }).focus();
    await user.keyboard(key);
    expect(useCartStore.getState().items).toHaveLength(0);
  });
});
