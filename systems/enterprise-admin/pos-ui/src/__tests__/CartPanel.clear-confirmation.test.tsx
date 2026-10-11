import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PosProduct } from '../api/pos';
import CartPanel from '../components/CartPanel';
import { useCartStore } from '../store/cartStore';
import { useCheckoutRecoveryStore } from '../store/checkoutRecoveryStore';
import type { PendingCheckout } from '../store/checkoutRecoveryStore';

const productA: PosProduct = {
  id: 'product-a', name: 'Synthetic A', sku: 'A', retailPrice: 100, stockQuantity: 20,
};
const productB: PosProduct = {
  id: 'product-b', name: 'Synthetic B', sku: 'B', retailPrice: 200, stockQuantity: 20,
};

beforeEach(() => {
  localStorage.clear();
  useCheckoutRecoveryStore.setState({ scope: 'tenant-a:cashier-a', pending: null });
  useCartStore.setState({
    items: [], orderDiscountAmount: 0, orderDiscountNote: '', paymentMethod: 'CASH',
    currentSalesStaffId: null, customerId: null, selectedCustomer: null,
    heldCarts: [], draftRevision: 0, draftScope: 'tenant-a:cashier-a',
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function setup() {
  useCartStore.getState().addItem(productA);
  const onFeedback = vi.fn();
  render(<CartPanel currentStaffName="Synthetic cashier" onCheckout={vi.fn()}
    onSplitCheckout={vi.fn()} onSwitchStaff={vi.fn()} onFeedback={onFeedback} />);
  return { onFeedback };
}

function clickClear() {
  fireEvent.click(screen.getByRole('button', { name: /清空/ }));
}

function freezeCheckout(status: PendingCheckout['status']) {
  const recovery = useCheckoutRecoveryStore.getState();
  recovery.prepare({
    commandId: 'synthetic-command', shiftId: 'synthetic-shift',
    cartItems: [{ productId: productA.id, quantity: 1, discountRate: 0 }],
    paymentMethod: 'CASH', orderDiscountAmount: 0,
  }, useCartStore.getState());
  recovery.mark(status);
  return useCheckoutRecoveryStore.getState().pending;
}

describe('CartPanel clear confirmation belongs to its editable draft', () => {
  it('still clears the same editable draft on the second click', () => {
    const { onFeedback } = setup();
    clickClear();
    expect(useCartStore.getState().items).toHaveLength(1);
    clickClear();
    expect(useCartStore.getState().items).toHaveLength(0);
    expect(onFeedback).toHaveBeenCalledWith({ type: 'success', message: '購物車已清空' });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('requires a new confirmation after holding A and starting B', () => {
    const { onFeedback } = setup();
    clickClear();
    act(() => {
      useCartStore.getState().holdCurrentCart('A');
      useCartStore.getState().addItem(productB);
    });

    clickClear();

    expect(useCartStore.getState().items.map((item) => item.product.id)).toEqual(['product-b']);
    expect(useCartStore.getState().heldCarts[0].items[0].product.id).toBe('product-a');
    expect(onFeedback).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }));
  });

  it('does not transfer A confirmation to a recalled held draft B', () => {
    useCartStore.getState().addItem(productB);
    useCartStore.getState().holdCurrentCart('B');
    const heldB = useCartStore.getState().heldCarts[0].id;
    setup();
    clickClear();
    act(() => { useCartStore.getState().recallHeldCart(heldB); });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    clickClear();
    expect(useCartStore.getState().items[0].product.id).toBe(productB.id);
    clickClear();
    expect(useCartStore.getState().items).toHaveLength(0);
    expect(useCartStore.getState().heldCarts[0].items[0].product.id).toBe(productA.id);
  });

  it('invalidates confirmation after an A/B/A hold and recall cycle', () => {
    setup();
    clickClear();
    act(() => {
      useCartStore.getState().holdCurrentCart('A');
      const heldA = useCartStore.getState().heldCarts[0].id;
      useCartStore.getState().addItem(productB);
      useCartStore.getState().recallHeldCart(heldA);
    });
    clickClear();
    expect(useCartStore.getState().items[0].product.id).toBe(productA.id);
    expect(useCartStore.getState().heldCarts[0].items[0].product.id).toBe(productB.id);
  });

  it.each([false, true])('invalidates confirmation on scope change (ABA: %s)', (returnToA) => {
    setup();
    clickClear();
    act(() => {
      useCartStore.getState().bindCheckoutScope('tenant-b:cashier-b');
      if (returnToA) useCartStore.getState().bindCheckoutScope('tenant-a:cashier-a');
      useCartStore.getState().addItem(productB);
    });
    clickClear();
    expect(useCartStore.getState().items[0].product.id).toBe(productB.id);
  });

  it('requires a new confirmation after another action clears and refills the draft', () => {
    setup();
    clickClear();
    act(() => {
      useCartStore.getState().clearCart();
      useCartStore.getState().addItem(productA);
    });
    clickClear();
    expect(useCartStore.getState().items).toHaveLength(1);
  });

  it('does not keep confirmation through an empty cart refilled within one render', () => {
    setup();
    clickClear();
    act(() => {
      useCartStore.getState().removeItem(productA.id);
      useCartStore.getState().addItem(productB);
    });
    clickClear();
    expect(useCartStore.getState().items[0].product.id).toBe(productB.id);
  });

  it('expires both the confirmation and its live status message after three seconds', () => {
    vi.useFakeTimers();
    setup();
    clickClear();
    act(() => { vi.advanceTimersByTime(2999); });
    expect(screen.getByRole('status')).toHaveTextContent('再按一次確認清空');
    act(() => { vi.advanceTimersByTime(1); });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '清空購物車 (F5)' })).toBeInTheDocument();
    clickClear();
    expect(useCartStore.getState().items).toHaveLength(1);
  });

  it('starts a fresh timeout after a draft replacement is armed', () => {
    vi.useFakeTimers();
    setup();
    clickClear();
    act(() => { vi.advanceTimersByTime(2000); });
    act(() => {
      useCartStore.getState().holdCurrentCart('A');
      useCartStore.getState().addItem(productB);
    });
    clickClear();
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.getByRole('status')).toHaveTextContent('再按一次確認清空');
    clickClear();
    expect(useCartStore.getState().items).toHaveLength(0);
  });

  it.each(['pending', 'unknown', 'conflict'] as const)(
    'keeps a %s checkout intent frozen without a false clear-success message', (status) => {
      const { onFeedback } = setup();
      clickClear();
      let pending: PendingCheckout | null = null;
      act(() => { pending = freezeCheckout(status); });
      expect(screen.getByRole('button', { name: /清空/ })).toBeDisabled();
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      clickClear();
      expect(useCartStore.getState().items).toHaveLength(1);
      expect(useCheckoutRecoveryStore.getState().pending).toBe(pending);
      expect(onFeedback).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }));
    },
  );

  it('permanently invalidates the old confirmation through pending/unlocked ABA', () => {
    setup();
    clickClear();
    act(() => {
      freezeCheckout('pending');
      useCheckoutRecoveryStore.getState().confirm('synthetic-command');
    });
    clickClear();
    expect(useCartStore.getState().items).toHaveLength(1);
  });

  it('an empty cart only reports the empty state and never arms a confirmation', () => {
    const { onFeedback } = setup();
    act(() => { useCartStore.getState().removeItem(productA.id); });
    clickClear();
    expect(onFeedback).toHaveBeenCalledWith({ type: 'info', message: '購物車目前沒有商品' });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
