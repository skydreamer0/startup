import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { createState, createDispatch, endEntry } from './network.mjs';
import { cases, origin, loginPath } from './contract.mjs';
import { brandAssets } from '../dialog-acceptance/brand-assets.mjs';
const fixture = { nonce: '11111111-1111-1111-1111-111111111111', codes: { active: 'SYNTHETIC-A' } };
const loginBody = { success: true, data: { accessToken: 'SYNTHETIC-NOT-A-CREDENTIAL', user: { id: 'user', fullName: '合成人員' } } };
function harness(kind, failure, disposeFails = true) {
  const primary = new SyntaxError('Synthetic original failure'), secondary = new Error('Synthetic disposal failure');
  const state = createState(fixture, cases[0]); state.releaseActive();
  let disposed = 0, fulfilled = 0;
  const brand = brandAssets[0];
  const request = { url: () => origin + (kind === 'brand' ? brand.path : loginPath), method: () => kind === 'brand' ? 'GET' : 'POST', resourceType: () => kind === 'brand' ? 'image' : 'fetch', postDataJSON: () => ({ employeeCode: fixture.codes.active }), headers: () => ({}) };
  const route = { request: () => request,
    fetch: async () => {
      if (failure === 'fetch') throw primary;
      return { status: () => failure === 'status' ? 500 : 200, headers: () => ({ 'content-type': brand.mime }),
        body: async () => { if (failure === 'body') throw primary; return kind === 'brand' ? fs.readFileSync(new URL('../../public' + brand.path, import.meta.url)) : Buffer.from(JSON.stringify(loginBody)); },
        dispose: async () => { disposed++; if (disposeFails) throw secondary; },
      };
    }, fulfill: async () => { if (failure === 'fulfill') throw primary; fulfilled++; },
  };
  return { state, route, primary, secondary, counts: () => ({ disposed, fulfilled }) };
}
for (const kind of ['api', 'brand']) {
  for (const failure of ['body', 'fulfill']) test(`${kind}: genuine ${failure} error survives simultaneous disposal rejection`, async () => {
    const h = harness(kind, failure); await assert.rejects(createDispatch(h.state, { pace: async () => true })(h.route), error => error === h.primary);
    assert.equal(h.state.controllers.size, 0); assert.equal(h.counts().disposed, 1); assert.equal(h.counts().fulfilled, 0);
    assert.deepEqual(h.state.errors, ['Response disposal also failed after the primary error']);
  });
  test(`${kind}: genuine unexpected status remains primary when disposal rejects`, async () => {
    const h = harness(kind, 'status'); await assert.rejects(createDispatch(h.state, { pace: async () => true })(h.route), error => error.code === 'ERR_ASSERTION' && error.actual === 500);
    assert.equal(h.state.controllers.size, 0); assert.equal(h.counts().disposed, 1); assert.equal(h.counts().fulfilled, 0);
  });
  test(`${kind}: standalone disposal rejection remains a failure after fulfillment`, async () => {
    const h = harness(kind, null); await assert.rejects(createDispatch(h.state, { pace: async () => true })(h.route), error => error === h.secondary);
    assert.equal(h.state.controllers.size, 0); assert.deepEqual(h.counts(), { disposed: 1, fulfilled: 1 });
    assert.deepEqual(h.state.errors, []);
  });
  test(`${kind}: no disposal attempted for fetch failure and its original error survives`, async () => {
    const h = harness(kind, 'fetch'); await assert.rejects(createDispatch(h.state, { pace: async () => true })(h.route), error => error === h.primary);
    assert.equal(h.state.controllers.size, 0); assert.deepEqual(h.counts(), { disposed: 0, fulfilled: 0 });
  });
  test(`${kind}: ordinary successful completion disposes once without adding errors`, async () => {
    const h = harness(kind, null, false); await createDispatch(h.state, { pace: async () => true })(h.route);
    assert.equal(h.state.controllers.size, 0); assert.deepEqual(h.counts(), { disposed: 1, fulfilled: 1 }); assert.deepEqual(h.state.errors, []);
  });
}

test('api: disposal failure after cancelling a fetched response is still a failure and releases ownership', async () => {
  const h = harness('api', null); let release;
  h.state.activeRelease = new Promise(resolve => { release = () => resolve(undefined); }); h.state.releaseActive = release;
  const work = createDispatch(h.state, { pace: async () => true })(h.route);
  // Attach the rejection handler before releasing the bounded response hold.
  const rejected = assert.rejects(work, error => error === h.secondary);
  await new Promise(resolve => setImmediate(resolve)); assert.equal(h.state.activeReady, true);
  endEntry(h.state); await rejected;
  assert.equal(h.state.controllers.size, 0); assert.deepEqual(h.counts(), { disposed: 1, fulfilled: 0 });
});
