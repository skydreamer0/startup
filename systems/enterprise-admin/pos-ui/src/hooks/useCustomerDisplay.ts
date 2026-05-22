import { useEffect } from 'react';
import { useCartStore } from '../store/cartStore';

let displayWindow: Window | null = null;
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('pos-customer-display') : null;

export function openCustomerDisplay() {
  if (!displayWindow || displayWindow.closed) {
    displayWindow = window.open('/customer-display', 'customer-display', 'width=1024,height=768');
  } else {
    displayWindow.focus();
  }
}

export function useCustomerDisplay() {
  const { items, subtotal, total, orderDiscountAmount } = useCartStore();

  useEffect(() => {
    if (!channel) return;
    if (items.length === 0) {
      channel.postMessage({ type: 'clear' });
      return;
    }
    channel.postMessage({
      items: items.map((item) => ({
        name: item.product.name,
        quantity: item.quantity,
        unitPrice: Number(item.product.retailPrice) * (1 - item.discountRate / 100),
        lineTotal: Number(item.product.retailPrice) * (1 - item.discountRate / 100) * item.quantity,
      })),
      subtotal: subtotal(),
      discount: orderDiscountAmount,
      total: total(),
      paymentMethod: useCartStore.getState().paymentMethod,
    });
  }, [items, subtotal, total, orderDiscountAmount]);
}
