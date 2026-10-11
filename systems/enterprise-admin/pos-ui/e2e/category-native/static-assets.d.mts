export interface CategoryStaticAsset {
  readonly path: string;
  readonly mime: string;
  readonly bytes: number;
  readonly sha256: string;
}

export interface CategoryStaticReceipt extends CategoryStaticAsset {
  readonly method: 'GET';
}

export const categoryStaticAssets: readonly CategoryStaticAsset[];
export function categoryStaticRequest(url: URL, method: string, origin: string): CategoryStaticAsset | undefined;
export function assertCategoryStaticSources(app: string): CategoryStaticAsset[];
export function assertCategoryStaticResponse(asset: CategoryStaticAsset, response: {
  status: number;
  contentType?: string | null;
  body: Uint8Array;
}): CategoryStaticReceipt;
export function assertCategoryStaticEvidence(receipts: unknown): asserts receipts is CategoryStaticReceipt[];
