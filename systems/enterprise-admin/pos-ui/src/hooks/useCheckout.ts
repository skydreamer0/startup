import { useEffect, useRef, useState } from 'react';
import { posApi, type CheckoutResult } from '../api/pos';
import { useCartStore } from '../store/cartStore';
import { useCheckoutRecoveryStore, type PendingCheckout } from '../store/checkoutRecoveryStore';
import type { PosToastMessage } from '../components/PosToast';
import type { PaymentEntry } from '@pharmasaas/types';
import { buildCheckoutPayload } from '../services/checkoutIntent';
import { checkoutPayloadHash } from '../services/checkoutPayloadHash';

const CONFLICT_RECOVERY_MESSAGE = '此意圖曾發生衝突。請保留紀錄，由管理員核對原訂單，不能自動確認或建立新意圖';

interface UseCheckoutOptions {
  shiftId: string | undefined;
  customerId?: string;
  onSuccess: (scope: string) => void;
  showToast: (msg: PosToastMessage) => void;
}

export function useCheckout({ shiftId, customerId, onSuccess, showToast }: UseCheckoutOptions) {
  const [checkoutResult, setCheckoutResult] = useState<CheckoutResult | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [contextReady, setContextReady] = useState(false);
  const [checkoutScope, setCheckoutScope] = useState<string | null>(null);
  const pending = useCheckoutRecoveryStore((state) => state.pending);
  const busy = useRef(false);

  useEffect(() => {
    let active = true;
    posApi.getCheckoutContext().then(({ data }) => {
      if (!active) return;
      const { tenantId, userId } = data.data;
      const scope = `${tenantId}:${userId}`;
      const previousScope = useCheckoutRecoveryStore.getState().scope;
      const restored = useCheckoutRecoveryStore.getState().hydrate(scope);
      if (previousScope && previousScope !== scope) useCartStore.getState().clearCart();
      if (restored) useCartStore.setState(restored.draft);
      setCheckoutScope(scope);
      setContextReady(true);
    }).catch(() => {
      if (active) setRecoveryError('無法確認結帳身分或讀取意圖紀錄，請重新登入後查回原意圖');
    });
    return () => { active = false; };
  }, []);

  function confirmed(intent: PendingCheckout, scope: string | null, result: CheckoutResult) {
    const recovery = useCheckoutRecoveryStore.getState();
    if (!scope || recovery.scope !== scope || recovery.pending?.payload.commandId !== intent.payload.commandId) return;
    // Clear only this confirmed intent, preserving any later cart that bypassed
    // the normal frozen-cart UI while the request was in flight.
    const cart = useCartStore.getState();
    const sameDraft = JSON.stringify(cart.items) === JSON.stringify(intent.draft.items)
      && cart.orderDiscountAmount === intent.draft.orderDiscountAmount
      && cart.orderDiscountNote === intent.draft.orderDiscountNote
      && cart.paymentMethod === intent.draft.paymentMethod
      && cart.currentSalesStaffId === intent.draft.currentSalesStaffId;
    if (!recovery.confirm(intent.payload.commandId)) return;
    if (sameDraft) useCartStore.getState().clearCart();
    setCheckoutResult(result);
    setRecoveryError(null);
    onSuccess(scope);
    showToast({ type: 'success', message: '結帳完成' });
  }

  async function recover(intent: PendingCheckout, queryOnly: boolean) {
    const scope = useCheckoutRecoveryStore.getState().scope;
    try {
      if (queryOnly) {
        const { data } = await posApi.getCheckoutCommand(intent.payload.commandId);
        if (intent.status === 'conflict') {
          setRecoveryError(CONFLICT_RECOVERY_MESSAGE);
        } else if (data.data.status === 'SUCCEEDED') {
          if (data.data.payloadHash === await checkoutPayloadHash(intent.payload)) confirmed(intent, scope, data.data.result);
          else {
            useCheckoutRecoveryStore.getState().mark('conflict');
            setRecoveryError('查回結果與保留意圖不同，請保留紀錄並聯絡管理員');
          }
        }
        else useCheckoutRecoveryStore.getState().mark('unknown');
      } else {
        const { data } = await posApi.checkout(intent.payload);
        confirmed(intent, scope, data.data);
      }
    } catch (err: unknown) {
      if (useCheckoutRecoveryStore.getState().scope !== scope) return;
      const response = (err as { response?: { status: number; data?: { error?: { message?: string } } } }).response;
      useCheckoutRecoveryStore.getState().mark(response?.status === 409 ? 'conflict' : 'unknown');
      setRecoveryError(useCheckoutRecoveryStore.getState().pending?.status === 'conflict'
        ? CONFLICT_RECOVERY_MESSAGE
        : response?.data?.error?.message ?? '尚未確認結帳結果，請查詢或重送同一意圖');
    }
  }

  async function handleCheckout(splitPayments?: PaymentEntry[]) {
    if (busy.current || !contextReady) return;
    busy.current = true;
    setCheckoutLoading(true);
    try {
      const recovery = useCheckoutRecoveryStore.getState();
      if (recovery.pending?.status === 'conflict') return;
      let intent = recovery.pending;
      if (!intent) {
        const cart = useCartStore.getState();
        if (!shiftId || !cart.items.length) {
          showToast({ type: 'error', message: '請確認開啟班別及購物車商品' });
          return;
        }
        intent = recovery.prepare({ commandId: crypto.randomUUID(), ...buildCheckoutPayload({
          items: cart.items, paymentMethod: cart.paymentMethod, splitPayments,
          orderDiscountAmount: cart.orderDiscountAmount, orderDiscountNote: cart.orderDiscountNote,
          customerId, shiftId, salesStaffId: cart.currentSalesStaffId,
        }) }, {
          items: cart.items, paymentMethod: cart.paymentMethod,
          orderDiscountAmount: cart.orderDiscountAmount, orderDiscountNote: cart.orderDiscountNote,
          currentSalesStaffId: cart.currentSalesStaffId,
        });
      }
      await recover(intent, false);
    } catch {
      setRecoveryError('無法保存結帳意圖，尚未送出。請保留購物車並檢查瀏覽器儲存空間');
    } finally {
      busy.current = false;
      setCheckoutLoading(false);
    }
  }

  async function queryCheckout() {
    const intent = useCheckoutRecoveryStore.getState().pending;
    if (busy.current || !contextReady || !intent) return;
    busy.current = true;
    setCheckoutLoading(true);
    try { await recover(intent, true); }
    finally { busy.current = false; setCheckoutLoading(false); }
  }

  return { checkoutResult, setCheckoutResult, checkoutLoading, handleCheckout, queryCheckout, pending, recoveryError, contextReady, checkoutScope };
}
