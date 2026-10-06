import { create } from 'zustand';
import type { CheckoutPayload } from '@pharmasaas/types';
import type { CartItem } from './cartStore';

export interface CheckoutDraft {
  items: CartItem[];
  orderDiscountAmount: number;
  orderDiscountNote: string;
  paymentMethod: CheckoutPayload['paymentMethod'];
  currentSalesStaffId: string | null;
}

export interface PendingCheckout {
  payload: CheckoutPayload;
  draft: CheckoutDraft;
  status: 'pending' | 'unknown' | 'conflict';
}

function storageKey(scope: string) { return `pos-checkout-intent-v1:${scope}`; }

// Business fields only. Never persist authentication, including a supplied PIN.
function safePayload(payload: CheckoutPayload): CheckoutPayload {
  return {
    commandId: payload.commandId,
    cartItems: payload.cartItems.map(({ productId, quantity, discountRate }) => ({ productId, quantity, discountRate })),
    paymentMethod: payload.paymentMethod,
    payments: payload.payments?.map(({ method, amount }) => ({ method, amount })),
    orderDiscountAmount: payload.orderDiscountAmount,
    orderDiscountNote: payload.orderDiscountNote,
    customerId: payload.customerId,
    shiftId: payload.shiftId,
    salesStaffId: payload.salesStaffId,
  };
}

interface RecoveryState {
  scope: string | null;
  pending: PendingCheckout | null;
  hydrate: (scope: string) => PendingCheckout | null;
  prepare: (payload: CheckoutPayload, draft: CheckoutDraft) => PendingCheckout;
  mark: (status: PendingCheckout['status']) => void;
  confirm: (commandId: string) => boolean;
}

export const useCheckoutRecoveryStore = create<RecoveryState>((set, get) => ({
  scope: null,
  pending: null,
  hydrate: (scope) => {
    // Clear in-memory state before reading a different authenticated identity.
    set({ scope: null, pending: null });
    const raw = localStorage.getItem(storageKey(scope));
    const saved = raw ? JSON.parse(raw) as PendingCheckout : null;
    if (saved && (!saved.payload?.commandId || !Array.isArray(saved.draft?.items))) {
      throw new Error('結帳意圖紀錄無法讀取，請保留紀錄並聯絡管理員');
    }
    const pending = saved ? { ...saved, status: saved.status === 'conflict' ? 'conflict' as const : 'unknown' as const } : null;
    set({ scope, pending });
    return pending;
  },
  prepare: (payload, draft) => {
    const { scope, pending } = get();
    if (!scope) throw new Error('尚未確認結帳身分，請稍後再試');
    if (pending) return pending;
    const intent: PendingCheckout = JSON.parse(JSON.stringify({ payload: safePayload(payload), draft, status: 'pending' }));
    // A storage exception must occur before the caller can send any request.
    localStorage.setItem(storageKey(scope), JSON.stringify(intent));
    set({ pending: intent });
    return intent;
  },
  mark: (status) => {
    const { scope, pending } = get();
    if (!scope || !pending) return;
    // A known payload conflict requires manual investigation. Transport failures
    // and later lookups cannot downgrade this evidence or re-enable submission.
    if (pending.status === 'conflict') return;
    const next = { ...pending, status };
    set({ pending: next });
    // Even if this write fails, the pre-submit frozen intent remains recoverable.
    try { localStorage.setItem(storageKey(scope), JSON.stringify(next)); } catch { /* retain prior intent */ }
  },
  confirm: (commandId) => {
    const { scope, pending } = get();
    if (!scope || pending?.payload.commandId !== commandId) return false;
    localStorage.removeItem(storageKey(scope));
    set({ pending: null });
    return true;
  },
}));
