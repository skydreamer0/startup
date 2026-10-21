import assert from 'node:assert/strict';
import { cameraCases } from './cases.mjs';
import { cameraLiteral } from './camera-fixture.mjs';

export function assertCameraEvidence(receipts, geometries, nonce) {
  assert.deepEqual(receipts.map(receipt => receipt.test).sort(), [...cameraCases].sort());
  const required = [];
  for (const receipt of receipts) {
    assert.equal(receipt.nonce, nonce);
    const handoff = receipt.test.startsWith('camera local decode and explicit package handoff at ');
    assert.equal(receipt.media.calls.length, handoff ? 2 : 3);
    assert.ok(receipt.media.calls.every(call => call.audio === false && typeof call.video === 'object'));
    assert.equal(receipt.media.tracks.length, 2);
    assert.ok(receipt.media.tracks.every(track => track.kind === 'video' && track.readyState === 'ended'));
    assert.equal(receipt.lookups, handoff ? 1 : 0); assert.equal(receipt.resolves, handoff ? 1 : 0);
    if (handoff) {
      assert.equal(receipt.warmOffline, true);
      assert.ok(receipt.wasm.some(response => response.status === 200 && response.mime.includes('application/wasm')));
      const scan = receipt.evidence.scan;
      assert.equal(scan.literal, cameraLiteral); assert.equal(scan.source, 'camera');
      assert.deepEqual(scan.evidence, { inputRoute: 'camera-frame', hardwareVerified: false });
      assert.deepEqual(scan.bytes, { status: 'observed', value: [...Buffer.from(cameraLiteral)] });
      assert.equal(scan.gs1.status, 'unknown'); assert.equal(scan.decoder.version, '3.1.2');
    }
    for (const name of handoff ? ['camera-live', 'camera-confirmed', 'camera-package-choice'] : ['camera-denied']) required.push(receipt.test + ':' + name);
  }
  assert.deepEqual(geometries.map(row => row.test + ':' + row.name).sort(), required.sort());
  for (const row of geometries) {
    assert.equal(row.nonce, nonce);
    const g = row.geometry;
    for (const key of ['x', 'y', 'width', 'height', 'viewportWidth', 'viewportHeight', 'scrollX', 'documentWidth']) assert.ok(Number.isFinite(g[key]));
    assert.equal(g.scrollX, 0); assert.ok(g.documentWidth <= g.viewportWidth);
    assert.ok(g.x >= 0 && g.y >= 0 && g.width >= 44 && g.height >= 44);
    assert.ok(g.x + g.width <= g.viewportWidth && g.y + g.height <= g.viewportHeight);
    assert.equal(g.hits.length, 5);
    const expected = [[g.x + g.width / 2, g.y + g.height / 2], [g.x + 2, g.y + g.height / 2],
      [g.x + g.width - 2, g.y + g.height / 2], [g.x + g.width / 2, g.y + 2], [g.x + g.width / 2, g.y + g.height - 2]];
    g.hits.forEach((hit, index) => {
      assert.equal(hit.x, expected[index][0]); assert.equal(hit.y, expected[index][1]);
      assert.equal(hit.owned, true); assert.equal(typeof hit.hit, 'string');
    });
  }
  return { cases: receipts.length, captures: geometries.length };
}
