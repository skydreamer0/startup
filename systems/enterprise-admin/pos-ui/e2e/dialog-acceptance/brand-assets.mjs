import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// Exact approved kit bytes, also recorded in design-system/brand/SHA256SUMS.json.
export const brandAssets = Object.freeze([
  { path: '/brand/flow-capsule-v1/favicon.svg', mime: 'image/svg+xml', bytes: 426,
    sha256: 'f06be1c64087299a4768beaa8cea530b1a3a1b463bac13a9c198abedf06417dc' },
  { path: '/brand/flow-capsule-v1/favicon-32.png', mime: 'image/png', bytes: 836,
    sha256: '92490160cede109b0e85bdf22ae2c7c117efa4e591053576370595498eb8257d' },
  { path: '/brand/flow-capsule-v1/favicon-16.png', mime: 'image/png', bytes: 404,
    sha256: '61f504fb26753251014d89f5f65f85d33cc98ac3b17028cde03cd88f3e55387f' },
].map(asset => Object.freeze(asset)));

export function brandRequest(url, method, origin) {
  if (method !== 'GET' || url.origin !== origin || url.search || url.hash || url.username || url.password) return undefined;
  return brandAssets.find(asset => asset.path === url.pathname);
}

function assertBytes(asset, body) {
  assert.equal(body.length, asset.bytes, `Brand byte length: ${asset.path}`);
  assert.equal(createHash('sha256').update(body).digest('hex'), asset.sha256, `Brand SHA-256: ${asset.path}`);
}

export function assertBrandSources(app) {
  for (const asset of brandAssets) assertBytes(asset, readFileSync(path.join(app, 'public', asset.path)));
  return brandAssets.map(asset => ({ ...asset }));
}

export function assertBrandResponse(asset, { status, contentType, body }) {
  assert.ok(brandAssets.includes(asset), 'Only pinned brand assets may be verified');
  assert.equal(status, 200, `Brand response status: ${asset.path}`);
  assert.equal(contentType?.split(';')[0].trim().toLowerCase(), asset.mime, `Brand MIME: ${asset.path}`);
  assertBytes(asset, body);
  return { method: 'GET', ...asset };
}

export function assertBrandEvidence(receipts) {
  assert.ok(Array.isArray(receipts), 'Verified brand response ledger is required');
  for (const receipt of receipts) {
    const asset = brandAssets.find(asset => asset.path === receipt.path);
    assert.ok(asset, 'Unknown brand asset in ledger');
    assert.deepEqual(receipt, { method: 'GET', ...asset }, 'Brand receipt must match pinned bytes and MIME');
  }
}
