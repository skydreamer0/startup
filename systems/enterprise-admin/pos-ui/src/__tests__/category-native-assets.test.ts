// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { categoryStaticAssets, categoryStaticRequest, assertCategoryStaticSources,
  assertCategoryStaticResponse, assertCategoryStaticEvidence } from '../../e2e/category-native/static-assets.mjs';

const origin = 'http://127.0.0.1:4290';
const app = fileURLToPath(new URL('../..', import.meta.url));
const body = (path: string) => readFileSync(new URL(`../../public${path}`, import.meta.url));
it('pins existing manifest and declared icon source bytes', () => {
  expect(assertCategoryStaticSources(app)).toHaveLength(4);
  const manifest = JSON.parse(body('/manifest.json').toString());
  expect(manifest.icons.map((icon: { src: string }) => icon.src).sort()).toEqual(categoryStaticAssets.slice(1).map(asset => asset.path).sort());
});
it.each(categoryStaticAssets)('accepts only verified $path bytes and MIME', asset => {
  const response = { status: 200, contentType: asset.mime, body: body(asset.path) };
  expect(categoryStaticRequest(new URL(asset.path, origin), 'GET', origin)).toBe(asset);
  expect(assertCategoryStaticResponse(asset, response)).toEqual({ method: 'GET', ...asset });
  expect(() => assertCategoryStaticResponse(asset, { ...response, status: 302 })).toThrow();
  expect(() => assertCategoryStaticResponse(asset, { ...response, contentType: 'text/html' })).toThrow();
  const changed = Buffer.from(response.body); changed[0] ^= 1;
  expect(() => assertCategoryStaticResponse(asset, { ...response, body: changed })).toThrow();
  expect(() => assertCategoryStaticResponse(asset, { ...response, body: changed.subarray(1) })).toThrow();
});
it.each([
  ['GET', 'https://example.test/manifest.json'], ['POST', `${origin}/manifest.json`],
  ['GET', `${origin}/manifest.json?token=unexpected`], ['GET', `${origin}/manifest.json#unexpected`],
  ['GET', 'http://user:pass@127.0.0.1:4290/manifest.json'], ['GET', `${origin}/other.json`],
  ['GET', `${origin}/api/pos/products`], ['GET', `${origin}/brand/flow-capsule-v1/unknown.png`],
])('does not broaden network permission: %s %s', (method, url) => {
  expect(categoryStaticRequest(new URL(url), method, origin)).toBeUndefined();
});
it('requires a verified manifest ledger and rejects substituted receipts', () => {
  const asset = categoryStaticAssets[0];
  const receipt = assertCategoryStaticResponse(asset, { status: 200, contentType: asset.mime, body: body(asset.path) });
  expect(() => assertCategoryStaticEvidence([receipt])).not.toThrow();
  expect(() => assertCategoryStaticEvidence([])).toThrow();
  expect(() => assertCategoryStaticEvidence([{ ...receipt, sha256: 'changed' }])).toThrow();
  expect(() => assertCategoryStaticEvidence([{ ...receipt, path: '/other.json' }])).toThrow();
});
