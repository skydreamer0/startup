import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// Existing index.html manifest and its three declared icons, verified against
// exact-head 821cf93 source-hashes.json. Default (non-incognito) Chrome fetches
// the manifest. These are read-only app assets, never API/network wildcards.
export const categoryStaticAssets = Object.freeze([
  { path: '/manifest.json', mime: 'application/json', bytes: 966,
    sha256: 'ec5455a1a38f9a84fe6de0098148784c8bb0b440398c4aadc376a211bd774c1b' },
  { path: '/brand/flow-capsule-v1/app-icon-192.png', mime: 'image/png', bytes: 3569,
    sha256: '08ce9008b51e8c477da8b7d196295de117570cf347147f25c345c463f85fe6db' },
  { path: '/brand/flow-capsule-v1/app-icon-512.png', mime: 'image/png', bytes: 9254,
    sha256: 'a2e1e1fbac9a6c73364f8fe6b14400d0cd1938a7a52b4bc5d4a07d6becd2b888' },
  { path: '/brand/flow-capsule-v1/maskable-512.png', mime: 'image/png', bytes: 8619,
    sha256: '9bfd5a1fdd39cbf048f85c51849fbd193fc3fc8cd8119b7935c9e41939869bc4' },
].map(asset => Object.freeze(asset)));

export function categoryStaticRequest(url, method, origin) {
  if (method !== 'GET' || url.origin !== origin || url.search || url.hash || url.username || url.password) return undefined;
  return categoryStaticAssets.find(asset => asset.path === url.pathname);
}
function assertBytes(asset, body) {
  assert.equal(body.length, asset.bytes, `Category static byte length: ${asset.path}`);
  assert.equal(createHash('sha256').update(body).digest('hex'), asset.sha256, `Category static SHA-256: ${asset.path}`);
}
export function assertCategoryStaticSources(app) {
  for (const asset of categoryStaticAssets) assertBytes(asset, readFileSync(path.join(app, 'public', asset.path)));
  return categoryStaticAssets.map(asset => ({ ...asset }));
}
export function assertCategoryStaticResponse(asset, { status, contentType, body }) {
  assert.ok(categoryStaticAssets.includes(asset), 'Only pinned category static assets may be verified');
  assert.equal(status, 200);
  assert.equal(contentType?.split(';')[0].trim().toLowerCase(), asset.mime);
  assertBytes(asset, body);
  return { method: 'GET', ...asset };
}
export function assertCategoryStaticEvidence(receipts) {
  assert.ok(Array.isArray(receipts), 'Category static response ledger is required');
  for (const receipt of receipts) {
    const asset = categoryStaticAssets.find(asset => asset.path === receipt.path);
    assert.ok(asset, 'Unknown category static asset');
    assert.deepEqual(receipt, { method: 'GET', ...asset });
  }
  assert.ok(receipts.some(receipt => receipt.path === '/manifest.json'), 'Default Chrome must observe the declared manifest');
}
