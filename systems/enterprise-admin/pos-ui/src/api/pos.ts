import api from './client';
import type {
  PosProduct,
  PosStaff,
  ActiveShift,
  CheckoutPayload,
  CheckoutResult,
  PosOrderSummary,
  ShiftReport,
  PosCustomerLookup,
  PosRecommendation,
  ReorderForecastItem,
  ReorderUrgency,
  ApiSuccess,
  CheckoutCommandResult,
  CheckoutContext,
} from '@pharmasaas/types';

export type { PosProduct, PosStaff, ActiveShift, CheckoutPayload, CheckoutResult, PosOrderSummary, ShiftReport, PosCustomerLookup, PosRecommendation, ReorderForecastItem, ReorderUrgency };

export const posApi = {
  getCategories: () =>
    api.get<ApiSuccess<NonNullable<PosProduct['category']>[]>>('/pos/categories'),

  getProducts: (q?: string, categoryId?: string, inStockOnly = true) =>
    api.get<ApiSuccess<PosProduct[]>>('/pos/products', {
      params: { q, categoryId, inStockOnly: inStockOnly ? 'true' : 'false' },
    }),

  getStaff: () =>
    api.get<ApiSuccess<PosStaff[]>>('/pos/staff'),

  lookupCustomer: (q: string) =>
    api.get<ApiSuccess<PosCustomerLookup | null>>('/pos/customer-lookup', {
      params: { q },
    }),

  createCustomer: (payload: { phone: string; name?: string }) =>
    api.post<ApiSuccess<PosCustomerLookup>>('/pos/customers', payload),

  getRecommendations: (customerId: string) =>
    api.get<ApiSuccess<PosRecommendation[]>>(`/pos/recommendations/${customerId}`),

  getHotRecommendations: () =>
    api.get<ApiSuccess<PosRecommendation[]>>('/pos/recommendations'),

  getReorderForecast: (limit = 20) =>
    api.get<ApiSuccess<ReorderForecastItem[]>>('/pos/reorder-forecast', {
      params: { limit },
    }),

  getActiveShift: () =>
    api.get<ApiSuccess<ActiveShift | null>>('/pos/shift/active'),

  checkout: (payload: CheckoutPayload) =>
    api.post<ApiSuccess<CheckoutResult>>('/pos/checkout', payload),

  getCheckoutCommand: (commandId: string) =>
    api.get<ApiSuccess<CheckoutCommandResult>>(`/pos/checkout-commands/${commandId}`),

  getCheckoutContext: () =>
    api.get<ApiSuccess<CheckoutContext>>('/pos/checkout-context'),

  getReceipt: (orderId: string) =>
    api.get<ApiSuccess<{ buffer: string }>>(`/pos/receipt/${orderId}`),

  getTodayOrders: (shiftId?: string) =>
    api.get<ApiSuccess<PosOrderSummary[]>>('/pos/orders/today', {
      params: shiftId ? { shiftId } : undefined,
    }),

  getOrderById: (orderId: string) =>
    api.get<ApiSuccess<PosOrderSummary>>(`/pos/orders/${orderId}`),

  refundOrder: (orderId: string, reason?: string) =>
    api.post<ApiSuccess<PosOrderSummary>>(`/pos/orders/${orderId}/refund`, { reason }),

  openShift: (staffId: string, openingCash = 0) =>
    api.post<ApiSuccess<ActiveShift>>('/shifts', { staffId, openingCash }),

  closeShift: (shiftId: string, closingCash = 0) =>
    api.patch<ApiSuccess<ActiveShift>>(`/shifts/${shiftId}/close`, { closingCash }),

  getShiftReport: (shiftId: string) =>
    api.get<ApiSuccess<ShiftReport>>(`/shifts/${shiftId}/report`),
};
