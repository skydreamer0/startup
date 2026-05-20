import api from './client';
import type {
  PosProduct,
  PosStaff,
  ActiveShift,
  CheckoutPayload,
  CheckoutResult,
} from '@pharmasaas/types';

export type { PosProduct, PosStaff, ActiveShift, CheckoutPayload, CheckoutResult };

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

  openShift: (staffId: string, openingCash = 0) =>
    api.post<{ success: boolean; data: ActiveShift }>('/shifts', { staffId, openingCash }),

  closeShift: (shiftId: string, closingCash = 0) =>
    api.patch<{ success: boolean; data: ActiveShift }>(`/shifts/${shiftId}/close`, { closingCash }),
};
