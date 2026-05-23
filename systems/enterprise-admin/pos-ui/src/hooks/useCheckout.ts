import { useState } from 'react';
import { posApi, CheckoutResult } from '../api/pos';
import { useCartStore } from '../store/cartStore';
import { PosToastMessage } from '../components/PosToast';
import { PaymentEntry } from '../components/SplitPaymentModal';

interface UseCheckoutOptions {
  shiftId: string | undefined;
  customerId?: string;
  onSuccess: () => void;
  showToast: (msg: PosToastMessage) => void;
}

export function useCheckout({ shiftId, customerId, onSuccess, showToast }: UseCheckoutOptions) {
  const [checkoutResult, setCheckoutResult] = useState<CheckoutResult | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  const { clearCart } = useCartStore();

  async function handleCheckout(splitPayments?: PaymentEntry[]) {
    const { items, orderDiscountAmount, orderDiscountNote, paymentMethod, currentSalesStaffId: staffId } =
      useCartStore.getState();

    if (!shiftId) {
      showToast({ type: 'error', message: '目前沒有開啟班別，請先開班再結帳' });
      return;
    }

    setCheckoutLoading(true);
    try {
      const response = await posApi.checkout({
        cartItems: items.map((item) => ({
          productId: item.product.id,
          quantity: item.quantity,
          discountRate: item.discountRate,
        })),
        paymentMethod: splitPayments ? splitPayments[0].method : paymentMethod,
        payments: splitPayments,
        orderDiscountAmount,
        orderDiscountNote: orderDiscountNote || undefined,
        customerId,
        shiftId,
        salesStaffId: staffId ?? undefined,
      });
      clearCart();
      onSuccess();
      setCheckoutResult(response.data.data);
      showToast({ type: 'success', message: '結帳完成' });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error
        ?.message;
      showToast({ type: 'error', message: msg ?? '結帳失敗，請稍後再試' });
    } finally {
      setCheckoutLoading(false);
    }
  }

  return {
    checkoutResult,
    setCheckoutResult,
    checkoutLoading,
    handleCheckout,
  };
}
