import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PosProduct } from '../api/pos';
import HoldOrderBar from '../components/HoldOrderBar';
import { useCartStore } from '../store/cartStore';
import { useCheckoutRecoveryStore } from '../store/checkoutRecoveryStore';
import type { PendingCheckout } from '../store/checkoutRecoveryStore';

// Synthetic React/JSDOM fixtures with real cart/recovery actions, no API or DB.
const productA: PosProduct = { id: 'a', name: 'Synthetic A', sku: 'A', retailPrice: 10, stockQuantity: 5 };
const productB: PosProduct = { id: 'b', name: 'Synthetic B', sku: 'B', retailPrice: 20, stockQuantity: 5 };
const blockedMessage = { type: 'warning', message: '結帳結果尚待確認，暫時無法變更掛單' };

beforeEach(() => {
  localStorage.clear();
  useCheckoutRecoveryStore.setState({ scope: 'synthetic-tenant:cashier', pending: null });
  useCartStore.setState({
    items: [], orderDiscountAmount: 0, orderDiscountNote: '', paymentMethod: 'CASH',
    currentSalesStaffId: null, customerId: null, selectedCustomer: null,
    heldCarts: [], draftRevision: 0, draftScope: 'synthetic-tenant:cashier',
  });
});
afterEach(cleanup);

function setup() {
  const store = useCartStore.getState();
  store.addItem(productA);
  store.holdCurrentCart('A');
  store.addItem(productB);
  const onFeedback = vi.fn();
  render(<HoldOrderBar onFeedback={onFeedback} />);
  fireEvent.click(screen.getByRole('button', { name: /筆掛單/ }));
  return { onFeedback };
}

function freeze(status: PendingCheckout['status']) {
  const recovery = useCheckoutRecoveryStore.getState();
  recovery.prepare({
    commandId: 'synthetic-command', shiftId: 'synthetic-shift',
    cartItems: [{ productId: 'b', quantity: 1, discountRate: 0 }],
    paymentMethod: 'CASH', orderDiscountAmount: 0,
  }, useCartStore.getState());
  recovery.mark(status);
}

const actions = [
  ['hold', /📋 掛單/], ['recall', /^叫回$/], ['delete', /^×$/],
] as const;

describe('HoldOrderBar reports only applied editable-draft actions', () => {
  for (const status of ['pending', 'unknown', 'conflict'] as const) {
    it.each(actions)(`${status} blocks %s without a success claim or state change`, (_action, name) => {
      const { onFeedback } = setup();
      act(() => freeze(status));
      const cart = useCartStore.getState();
      const pending = useCheckoutRecoveryStore.getState().pending;
      fireEvent.click(screen.getByRole('button', { name }));
      expect(useCartStore.getState()).toBe(cart);
      expect(useCheckoutRecoveryStore.getState().pending).toBe(pending);
      expect(onFeedback.mock.calls).toEqual([[blockedMessage]]);
      expect(screen.getByText('掛單列表')).toBeInTheDocument();
    });
  }

  it.each(actions)('checks live pending state before a React rerender for %s', (_action, name) => {
    const { onFeedback } = setup();
    const button = screen.getByRole('button', { name });
    act(() => {
      freeze('unknown');
      const cart = useCartStore.getState();
      fireEvent.click(button);
      expect(useCartStore.getState()).toBe(cart);
    });
    expect(onFeedback.mock.calls).toEqual([[blockedMessage]]);
  });

  it('holds the current editable cart and reports its actual transition', () => {
    const { onFeedback } = setup();
    fireEvent.click(screen.getByRole('button', { name: /📋 掛單/ }));
    expect(useCartStore.getState().items).toEqual([]);
    expect(useCartStore.getState().heldCarts.map((cart) => cart.items[0].product.id)).toEqual(['a', 'b']);
    expect(onFeedback.mock.calls).toEqual([[{ type: 'success', message: '已掛單，購物車已清空' }]]);
  });

  it('recalls A, preserves editable B as a held draft and closes only on success', () => {
    const { onFeedback } = setup();
    fireEvent.click(screen.getByRole('button', { name: '叫回' }));
    expect(useCartStore.getState().items[0].product.id).toBe('a');
    expect(useCartStore.getState().heldCarts[0].items[0].product.id).toBe('b');
    expect(screen.queryByText('掛單列表')).not.toBeInTheDocument();
    expect(onFeedback.mock.calls).toEqual([[{ type: 'success', message: '已叫回「A」' }]]);
  });

  it('deletes only the selected held draft and keeps the active cart', () => {
    const { onFeedback } = setup();
    const items = useCartStore.getState().items;
    fireEvent.click(screen.getByRole('button', { name: '×' }));
    expect(useCartStore.getState().heldCarts).toEqual([]);
    expect(useCartStore.getState().items).toBe(items);
    expect(onFeedback.mock.calls).toEqual([[{ type: 'info', message: '已刪除「A」' }]]);
  });

  it('reads an empty cart at activation instead of reporting a stale hold success', () => {
    const { onFeedback } = setup();
    const button = screen.getByRole('button', { name: /📋 掛單/ });
    act(() => {
      useCartStore.getState().clearCart();
      fireEvent.click(button);
    });
    expect(useCartStore.getState().heldCarts).toHaveLength(1);
    expect(onFeedback.mock.calls).toEqual([[{ type: 'info', message: '購物車是空的，無法掛單' }]]);
  });

  it.each(actions.slice(1))('rejects a removed held row before rerender for %s', (_action, name) => {
    const { onFeedback } = setup();
    const button = screen.getByRole('button', { name });
    const id = useCartStore.getState().heldCarts[0].id;
    act(() => {
      useCartStore.getState().deleteHeldCart(id);
      const cart = useCartStore.getState();
      fireEvent.click(button);
      expect(useCartStore.getState()).toBe(cart);
    });
    expect(onFeedback.mock.calls).toEqual([[{ type: 'info', message: '掛單已變更，請重新選擇' }]]);
  });
});
