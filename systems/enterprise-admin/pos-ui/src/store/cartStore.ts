import { create } from 'zustand';
import type { PosProduct } from '@pharmasaas/types';

export interface CartItem {
  product: PosProduct;
  quantity: number;
  discountRate: number; // 0-100
}

interface CartState {
  items: CartItem[];
  orderDiscountAmount: number;
  orderDiscountNote: string;
  paymentMethod: 'CASH' | 'CARD' | 'LINE_PAY' | 'TRANSFER' | 'OTHER';
  currentSalesStaffId: string | null;

  addItem: (product: PosProduct) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  updateItemDiscount: (productId: string, discountRate: number) => void;
  setOrderDiscount: (amount: number, note?: string) => void;
  setPaymentMethod: (method: CartState['paymentMethod']) => void;
  setSalesStaff: (staffId: string | null) => void;
  clearCart: () => void;

  subtotal: () => number;
  total: () => number;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  orderDiscountAmount: 0,
  orderDiscountNote: '',
  paymentMethod: 'CASH',
  currentSalesStaffId: null,

  addItem: (product) => set((state) => {
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

  removeItem: (productId) => set((state) => ({
    items: state.items.filter((item) => item.product.id !== productId),
  })),

  updateQuantity: (productId, quantity) => set((state) => ({
    items: quantity <= 0
      ? state.items.filter((item) => item.product.id !== productId)
      : state.items.map((item) =>
          item.product.id === productId ? { ...item, quantity } : item,
        ),
  })),

  updateItemDiscount: (productId, discountRate) => set((state) => ({
    items: state.items.map((item) =>
      item.product.id === productId ? { ...item, discountRate } : item,
    ),
  })),

  setOrderDiscount: (amount, note = '') => set({ orderDiscountAmount: amount, orderDiscountNote: note }),

  setPaymentMethod: (method) => set({ paymentMethod: method }),

  setSalesStaff: (staffId) => set({ currentSalesStaffId: staffId }),

  clearCart: () => set({
    items: [],
    orderDiscountAmount: 0,
    orderDiscountNote: '',
  }),

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
}));
