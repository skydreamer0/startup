import api from './client';
import type { ApiSuccess, PosProduct } from '@pharmasaas/types';

/** Server lookup is exact SKU only until a barcode model is introduced. */
export const lookupProduct = (code: string) =>
  api.get<ApiSuccess<PosProduct[]>>('/pos/products/lookup', { params: { code } });
