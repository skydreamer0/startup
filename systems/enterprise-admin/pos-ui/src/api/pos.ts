import api from './client';

export interface PosProduct {
  id: string;
  name: string;
  sku: string;
  barcode?: string;
  retailPrice: number;
  stockQuantity: number;
  safetyStock?: number;
  category?: { id: string; name: string };
}

export interface PosStaff {
  id: string;
  fullName: string;
  email: string;
  employeeCode?: string;
}

export interface ActiveShift {
  id: string;
  status: string;
  openedAt: string;
  staff: { id: string; fullName: string };
}

export interface CheckoutPayload {
  cartItems: { productId: string; quantity: number; discountRate: number }[];
  paymentMethod: 'CASH' | 'CARD' | 'LINE_PAY' | 'TRANSFER' | 'OTHER';
  orderDiscountAmount: number;
  orderDiscountNote?: string;
  customerId?: string;
  shiftId: string;
  salesStaffId?: string;
}

export interface CheckoutResult {
  id: string;
  orderNumber: string;
  totalAmount: number;
  paymentMethod: string;
  items: { productId: string; quantity: number; unitPrice: number; finalUnitPrice: number }[];
}

export const posApi = {
  getProducts: (q?: string, categoryId?: string, inStockOnly = true) =>
    api.get<{ success: boolean; data: PosProduct[] }>('/pos/products', {
      params: { q, categoryId, inStockOnly: inStockOnly ? 'true' : 'false' },
    }),

  getStaff: () =>
    api.get<{ success: boolean; data: PosStaff[] }>('/pos/staff'),

  getActiveShift: () =>
    api.get<{ success: boolean; data: ActiveShift | null }>('/pos/shift/active'),

  checkout: (payload: CheckoutPayload) =>
    api.post<{ success: boolean; data: CheckoutResult }>('/pos/checkout', payload),

  getReceipt: (orderId: string) =>
    api.get<{ success: boolean; data: { buffer: string } }>(`/pos/receipt/${orderId}`),

  login: (email: string, password: string) =>
    api.post<{ success: boolean; data: { accessToken: string } }>('/auth/login', { email, password }),
};
