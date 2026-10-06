import { webcrypto } from 'node:crypto';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCheckout } from '../hooks/useCheckout';
import { useCartStore } from '../store/cartStore';
import { useCheckoutRecoveryStore } from '../store/checkoutRecoveryStore';
import { checkoutPayloadHash } from '../services/checkoutPayloadHash';
import { posApi } from '../api/pos';

vi.mock('../api/pos', () => ({ posApi: { checkout: vi.fn(), getCheckoutCommand: vi.fn(), getCheckoutContext: vi.fn() } }));
const product = { id: 'product-1', name: 'Synthetic product', sku: 'SYNTHETIC', retailPrice: 100, stockQuantity: 3 };
const result = { id: 'original-order', orderNumber: 'SYNTHETIC-1', totalAmount: '100', paymentMethod: 'CASH', items: [{ productId: product.id, quantity: 1, unitPrice: '100', finalUnitPrice: '100' }] };
const success = vi.fn(); const toast = vi.fn();
function hook() { return renderHook(() => useCheckout({ shiftId: 'shift-1', onSuccess: success, showToast: toast })); }
beforeEach(() => {
  vi.restoreAllMocks(); vi.clearAllMocks(); localStorage.clear();
  vi.stubGlobal("crypto", webcrypto);
  useCheckoutRecoveryStore.setState({ scope: null, pending: null });
  useCartStore.setState({ items: [{ product, quantity: 1, discountRate: 0 }], orderDiscountAmount: 0, orderDiscountNote: '', paymentMethod: 'CASH', currentSalesStaffId: 'cashier-1', heldCarts: [] });
  vi.mocked(posApi.getCheckoutContext).mockResolvedValue({ data: { data: { tenantId: 'tenant-1', userId: 'cashier-1' } } } as Awaited<ReturnType<typeof posApi.getCheckoutContext>>);
});

afterAll(() => vi.unstubAllGlobals());

describe('Frozen POS checkout recovery (synthetic API)', () => {
  it('persists before sending, guards double submit, retains unknown draft and queries the original order', async () => {
    let fail: (reason: Error) => void = () => {};
    vi.mocked(posApi.checkout).mockImplementation(() => new Promise((_resolve, reject) => { fail = reject; }));
    const h = hook(); await waitFor(() => expect(h.result.current.contextReady).toBe(true));
    let first: Promise<void> = Promise.resolve();
    act(() => { first = h.result.current.handleCheckout(); void h.result.current.handleCheckout(); });
    expect(posApi.checkout).toHaveBeenCalledTimes(1);
    const payload = vi.mocked(posApi.checkout).mock.calls[0][0];
    expect(payload.commandId).toBeTruthy();
    expect(localStorage.getItem('pos-checkout-intent-v1:tenant-1:cashier-1')).toContain(payload.commandId);
    act(() => { useCartStore.getState().clearCart(); useCartStore.getState().holdCurrentCart(); useCartStore.getState().setSalesStaff('other'); useCartStore.getState().updateQuantity(product.id, 3); });
    expect(useCartStore.getState().items[0].quantity).toBe(1);
    await act(async () => { fail(new Error('Lost response')); await first; });
    expect(h.result.current.pending?.status).toBe('unknown'); expect(success).not.toHaveBeenCalled();
    expect(useCartStore.getState().items).toHaveLength(1);
    vi.mocked(posApi.getCheckoutCommand).mockResolvedValue({ data: { data: { commandId: payload.commandId, status: 'SUCCEEDED', payloadHash: await checkoutPayloadHash(payload), result } } } as Awaited<ReturnType<typeof posApi.getCheckoutCommand>>);
    await act(async () => { await h.result.current.queryCheckout(); });
    expect(h.result.current.checkoutResult?.id).toBe('original-order');
    expect(useCartStore.getState().items).toHaveLength(0);
    expect(localStorage.getItem('pos-checkout-intent-v1:tenant-1:cashier-1')).toBeNull();
  });

  it('refresh restores unknown and a query miss resends exactly the frozen command', async () => {
    vi.mocked(posApi.checkout).mockRejectedValue(new Error('Disconnected'));
    const h = hook(); await waitFor(() => expect(h.result.current.contextReady).toBe(true));
    await act(async () => { await h.result.current.handleCheckout([{ method: 'CARD', amount: 100 }]); });
    const payload = vi.mocked(posApi.checkout).mock.calls[0][0]; h.unmount();
    useCheckoutRecoveryStore.setState({ scope: null, pending: null }); useCartStore.setState({ items: [] });
    const refreshed = hook(); await waitFor(() => expect(refreshed.result.current.pending?.status).toBe('unknown'));
    expect(useCartStore.getState().items).toHaveLength(1);
    vi.mocked(posApi.getCheckoutCommand).mockResolvedValue({ data: { data: { commandId: payload.commandId, status: 'UNKNOWN' } } } as Awaited<ReturnType<typeof posApi.getCheckoutCommand>>);
    await act(async () => { await refreshed.result.current.queryCheckout(); });
    vi.mocked(posApi.checkout).mockResolvedValue({ data: { data: result } } as Awaited<ReturnType<typeof posApi.checkout>>);
    await act(async () => { await refreshed.result.current.handleCheckout([{ method: 'CASH', amount: 100 }]); });
    expect(vi.mocked(posApi.checkout).mock.calls[1][0]).toEqual(payload);
    expect(refreshed.result.current.checkoutResult?.id).toBe('original-order');
  });

  it('blocks POST when intent persistence fails', async () => {
    const h = hook(); await waitFor(() => expect(h.result.current.contextReady).toBe(true));
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Quota exceeded'); });
    await act(async () => { await h.result.current.handleCheckout(); });
    expect(posApi.checkout).not.toHaveBeenCalled(); expect(useCartStore.getState().items).toHaveLength(1);
    expect(h.result.current.recoveryError).toContain('尚未送出');
  });

  it('keeps conflict evidence and blocks automatic replacement or resend', async () => {
    vi.mocked(posApi.checkout).mockRejectedValue({ response: { status: 409 } });
    const h = hook(); await waitFor(() => expect(h.result.current.contextReady).toBe(true));
    await act(async () => { await h.result.current.handleCheckout(); });
    expect(h.result.current.pending?.status).toBe('conflict');
    await act(async () => { await h.result.current.handleCheckout(); });
    expect(posApi.checkout).toHaveBeenCalledTimes(1); expect(localStorage.length).toBe(1);
  });

  it('does not confirm a lookup result belonging to a different payload', async () => {
    vi.mocked(posApi.checkout).mockRejectedValue(new Error('Lost response'));
    const h = hook(); await waitFor(() => expect(h.result.current.contextReady).toBe(true));
    await act(async () => { await h.result.current.handleCheckout(); });
    const payload = vi.mocked(posApi.checkout).mock.calls[0][0];
    vi.mocked(posApi.getCheckoutCommand).mockResolvedValue({ data: { data: { commandId: payload.commandId, status: 'SUCCEEDED', payloadHash: 'different-intent-hash', result } } } as Awaited<ReturnType<typeof posApi.getCheckoutCommand>>);
    await act(async () => { await h.result.current.queryCheckout(); });
    expect(h.result.current.pending?.status).toBe('conflict'); expect(h.result.current.checkoutResult).toBeNull();
    expect(useCartStore.getState().items).toHaveLength(1); expect(localStorage.length).toBe(1);
  });

  it('persists only business fields, excluding a supplied PIN', async () => {
    const h = hook(); await waitFor(() => expect(h.result.current.contextReady).toBe(true));
    const draft = { items: useCartStore.getState().items, paymentMethod: 'CASH' as const, orderDiscountAmount: 0, orderDiscountNote: '', currentSalesStaffId: 'cashier-1' };
    act(() => { useCheckoutRecoveryStore.getState().prepare({ commandId: crypto.randomUUID(), cartItems: [{ productId: product.id, quantity: 1, discountRate: 0 }], shiftId: 'shift-1', paymentMethod: 'CASH', orderDiscountAmount: 0, adminPin: 'synthetic-secret' }, draft); });
    expect(localStorage.getItem('pos-checkout-intent-v1:tenant-1:cashier-1')).not.toContain('synthetic-secret');
    expect(localStorage.getItem('pos-checkout-intent-v1:tenant-1:cashier-1')).not.toContain('adminPin');
  });

  it('preserves a later cart when the original response arrives', async () => {
    let reply: (value: Awaited<ReturnType<typeof posApi.checkout>>) => void = () => {};
    vi.mocked(posApi.checkout).mockImplementation(() => new Promise((resolve) => { reply = resolve; }));
    const h = hook(); await waitFor(() => expect(h.result.current.contextReady).toBe(true));
    let submission: Promise<void> = Promise.resolve(); act(() => { submission = h.result.current.handleCheckout(); });
    useCartStore.setState({ items: [{ product, quantity: 3, discountRate: 0 }] });
    await act(async () => { reply({ data: { data: result } } as Awaited<ReturnType<typeof posApi.checkout>>); await submission; });
    expect(useCartStore.getState().items[0].quantity).toBe(3); expect(h.result.current.checkoutResult?.id).toBe(result.id);
  });

  it('restores only the authenticated tenant and cashier, keeping the other record private', async () => {
    vi.mocked(posApi.checkout).mockRejectedValue({ response: { status: 401 } });
    const h = hook(); await waitFor(() => expect(h.result.current.contextReady).toBe(true));
    await act(async () => { await h.result.current.handleCheckout(); }); h.unmount();
    vi.mocked(posApi.getCheckoutContext).mockResolvedValue({ data: { data: { tenantId: 'tenant-2', userId: 'cashier-2' } } } as Awaited<ReturnType<typeof posApi.getCheckoutContext>>);
    const other = hook(); await waitFor(() => expect(other.result.current.contextReady).toBe(true));
    expect(other.result.current.pending).toBeNull(); expect(localStorage.length).toBe(1);
    expect(useCartStore.getState().items).toHaveLength(0);
    other.unmount();
    vi.mocked(posApi.getCheckoutContext).mockResolvedValue({ data: { data: { tenantId: 'tenant-1', userId: 'cashier-1' } } } as Awaited<ReturnType<typeof posApi.getCheckoutContext>>);
    const restored = hook(); await waitFor(() => expect(restored.result.current.pending?.status).toBe('unknown'));
    expect(restored.result.current.pending?.payload.commandId).toBe(vi.mocked(posApi.checkout).mock.calls[0][0].commandId);
  });
});
