import type { ApiSuccess, PackageCandidate, PackageIdentifier } from '@pharmasaas/types';
import api from './client';

function parseCandidate(value: unknown): PackageCandidate {
  const row = value as PackageCandidate | null;
  if (!row || typeof row.packageId !== 'string' || typeof row.revisionId !== 'string'
    || !Number.isSafeInteger(row.revision) || row.revision < 1
    || typeof row.label !== 'string' || typeof row.contents !== 'string' || typeof row.source !== 'string'
    || (row.unitsPerPackage !== null && (!Number.isSafeInteger(row.unitsPerPackage) || row.unitsPerPackage < 1))
    || (row.stockUnitLabel !== null && typeof row.stockUnitLabel !== 'string')
    || typeof row.validFrom !== 'string' || (row.validUntil !== null && typeof row.validUntil !== 'string')
    || !row.product || typeof row.product.id !== 'string' || typeof row.product.name !== 'string'
    || typeof row.product.sku !== 'string' || !Number.isSafeInteger(row.product.stockQuantity)
    || row.product.stockQuantity < 0 || !['number', 'string'].includes(typeof row.product.retailPrice)
    || (typeof row.product.retailPrice === 'string' && !row.product.retailPrice.trim())
    || !Number.isFinite(Number(row.product.retailPrice)) || Number(row.product.retailPrice) < 0) {
    throw new Error('商品包裝查找回應格式不完整');
  }
  return row;
}
export const productPackagesApi = {
  async lookup(identifier: PackageIdentifier, signal: AbortSignal) {
    const response = await api.get<ApiSuccess<PackageCandidate[]>>('/pos/packages/lookup', { params: identifier, signal });
    if (response.data.success !== true || !Array.isArray(response.data.data)) throw new Error('商品包裝查找回應格式不完整');
    const rows = response.data.data.map(parseCandidate);
    if (new Set(rows.map(row => row.packageId)).size !== rows.length) throw new Error('包裝查找回傳重複身分');
    return rows;
  },
  async resolve(identifier: PackageIdentifier, selected: PackageCandidate, signal: AbortSignal) {
    const response = await api.post<ApiSuccess<PackageCandidate>>('/pos/packages/resolve', {
      identifier, packageId: selected.packageId, revision: selected.revision,
    }, { signal });
    if (response.data.success !== true) throw new Error('無法確認包裝對照');
    const row = parseCandidate(response.data.data);
    if (row.packageId !== selected.packageId || row.revision !== selected.revision
      || row.revisionId !== selected.revisionId || row.product.id !== selected.product.id
      || row.unitsPerPackage !== selected.unitsPerPackage || row.stockUnitLabel !== selected.stockUnitLabel) {
      throw new Error('包裝對照已變更，請重新查找');
    }
    return row;
  },
};
