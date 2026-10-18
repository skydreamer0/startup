import type { ApiSuccess, ProductPackageHistory, PackageRevisionInput, PackageRevisionRequest } from '@pharmasaas/types';
import api from './client';

export const productPackagesApi = {
  async list(productId: string, signal: AbortSignal) {
    const response = await api.get<ApiSuccess<ProductPackageHistory>>(`/inventory/products/${productId}/packages`, { signal });
    if (response.data.success !== true || response.data.data.product.id !== productId
      || !Array.isArray(response.data.data.packages)) throw new Error('包裝資料格式不完整');
    return response.data.data;
  },
  create: (productId: string, data: PackageRevisionInput) => api.post(`/inventory/products/${productId}/packages`, data),
  revise: (productId: string, packageId: string, expectedRevision: number, data: PackageRevisionInput, expectedRetired = false) =>
    api.post(`/inventory/products/${productId}/packages/${packageId}/revisions`,
      { expectedRevision, expectedRetired, data } satisfies PackageRevisionRequest),
  retire: (productId: string, packageId: string, expectedRevision: number, reason: string) =>
    api.post(`/inventory/products/${productId}/packages/${packageId}/retire`, { expectedRevision, reason }),
};
