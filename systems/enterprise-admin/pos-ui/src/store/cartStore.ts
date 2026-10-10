import { create } from 'zustand';
import { useCheckoutRecoveryStore } from './checkoutRecoveryStore';
import type { PosCustomerLookup, PosProduct } from '@pharmasaas/types';

export interface CartItem {
  product: PosProduct;
  quantity: number;
  discountRate: number; // 0-100
}

// Ordinary editable drafts stay in memory. Only customerId enters checkout recovery.
export interface EditableDraft {
  draftRevision: number;
  items: CartItem[];
  orderDiscountAmount: number;
  orderDiscountNote: string;
  paymentMethod: 'CASH' | 'CARD' | 'LINE_PAY' | 'TRANSFER' | 'OTHER';
  currentSalesStaffId: string | null;
  customerId: string | null;
  selectedCustomer: PosCustomerLookup | null;
}

export interface HeldCart extends EditableDraft {
  id: string;
  label: string;
  heldAt: Date;
}

interface CartState extends EditableDraft {
  draftScope: string | null;
  bindCheckoutScope: (scope: string) => void;
  setCustomer: (customer: PosCustomerLookup | null) => void;
  heldCarts: HeldCart[];

  addItem: (product: PosProduct) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  updateItemDiscount: (productId: string, discountRate: number) => void;
  setOrderDiscount: (amount: number, note?: string) => void;
  setPaymentMethod: (method: CartState['paymentMethod']) => void;
  setSalesStaff: (staffId: string | null) => void;
  clearCart: () => void;

  holdCurrentCart: (label?: string) => void;
  recallHeldCart: (id: string) => void;
  deleteHeldCart: (id: string) => void;

  subtotal: () => number;
  total: () => number;
}

function snapshotDraft(state: EditableDraft): EditableDraft {
  return {
    draftRevision: state.draftRevision, items: state.items,
    orderDiscountAmount: state.orderDiscountAmount, orderDiscountNote: state.orderDiscountNote,
    paymentMethod: state.paymentMethod, currentSalesStaffId: state.currentSalesStaffId,
    customerId: state.customerId, selectedCustomer: state.selectedCustomer,
  };
}
const emptyDraft = {
  items: [], orderDiscountAmount: 0, orderDiscountNote: '', paymentMethod: 'CASH' as const,
  currentSalesStaffId: null, customerId: null, selectedCustomer: null,
};

export const useCartStore = create<CartState>((set, get) => {
  const mutate = (update: Partial<CartState> | ((state: CartState) => Partial<CartState> | CartState)) => {
    if (!useCheckoutRecoveryStore.getState().pending) set(update);
  };
  return {
  ...emptyDraft,
  draftRevision: 0,
  draftScope: null,
  heldCarts: [],
  // Identity changes must discard the old editable workspace even when recovery
  // is frozen. The old persisted intent remains private under its original scope.
  bindCheckoutScope: (scope) => set((state) => state.draftScope && state.draftScope !== scope
    ? { ...emptyDraft, heldCarts: [], draftScope: scope, draftRevision: state.draftRevision + 1 }
    : { draftScope: scope }),
  setCustomer: (customer) => mutate({ selectedCustomer: customer, customerId: customer?.id ?? null }),

  addItem: (product) => mutate((state) => {
    const existing = state.items.find((item) => item.product.id === product.id);
    if (existing) {
      return {
        items: state.items.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: Math.min(item.quantity + 1, product.stockQuantity) }
            : item,
        ),
      };
    }
    return { items: [...state.items, { product, quantity: 1, discountRate: 0 }] };
  }),

  removeItem: (productId) => mutate((state) => ({
    items: state.items.filter((item) => item.product.id !== productId),
  })),

  updateQuantity: (productId, quantity) => mutate((state) => ({
    items: quantity <= 0
      ? state.items.filter((item) => item.product.id !== productId)
      : state.items.map((item) =>
          item.product.id === productId ? { ...item, quantity } : item,
        ),
  })),

  updateItemDiscount: (productId, discountRate) => mutate((state) => ({
    items: state.items.map((item) =>
      item.product.id === productId ? { ...item, discountRate } : item,
    ),
  })),

  setOrderDiscount: (amount, note = '') => mutate({ orderDiscountAmount: amount, orderDiscountNote: note }),

  setPaymentMethod: (method) => mutate({ paymentMethod: method }),

  setSalesStaff: (staffId) => mutate({ currentSalesStaffId: staffId }),

  clearCart: () => mutate((state) => ({
    ...emptyDraft, currentSalesStaffId: state.currentSalesStaffId, draftRevision: state.draftRevision + 1,
  })),

  holdCurrentCart: (label) => mutate((state) => {
    if (state.items.length === 0) return state;
    const held: HeldCart = {
      id: crypto.randomUUID(),
      label: label ?? `掛單 #${state.heldCarts.length + 1}`,
      ...snapshotDraft(state),
      heldAt: new Date(),
    };
    return {
      heldCarts: [...state.heldCarts, held],
      draftRevision: state.draftRevision + 1,
      ...emptyDraft,
      currentSalesStaffId: state.currentSalesStaffId,
    };
  }),

  recallHeldCart: (id) => mutate((state) => {
    const held = state.heldCarts.find((c) => c.id === id);
    if (!held) return state;
    // Save current cart back if non-empty
    const newHeld = state.items.length > 0
      ? state.heldCarts
          .filter((c) => c.id !== id)
          .concat({
            id: crypto.randomUUID(),
            label: `掛單 #${state.heldCarts.length + 1}`,
            ...snapshotDraft(state),
            heldAt: new Date(),
          })
      : state.heldCarts.filter((c) => c.id !== id);
    return {
      heldCarts: newHeld,
      ...snapshotDraft(held),
      // Never restore an old revision: invalidate late effects even on A/B/A.
      draftRevision: state.draftRevision + 1,
    };
  }),

  deleteHeldCart: (id) => mutate((state) => ({
    heldCarts: state.heldCarts.filter((c) => c.id !== id),
  })),

  subtotal: () => {
    const { items } = get();
    return items.reduce((sum, item) => {
      // retailPrice may arrive as string from Prisma Decimal JSON serialisation
      const retailPrice = Number(item.product.retailPrice);
      const finalPrice = retailPrice * (1 - item.discountRate / 100);
      return sum + finalPrice * item.quantity;
    }, 0);
  },

  total: () => {
    const { orderDiscountAmount } = get();
    return Math.max(0, get().subtotal() - orderDiscountAmount);
  },
  };
});
