import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { allowedRequest, digest, origin, prefix, requestLimit, requestSpacingMs, safePayload } from './contract.mjs';
import { brandRequest, assertBrandResponse } from '../dialog-acceptance/brand-assets.mjs';
const fonts = new Set([
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Outfit:wght@500;600;700;800&display=swap',
]);
export function createPacer({ spacing = requestSpacingMs, now = Date.now, wait = delay, limit = requestLimit } = {}) {
  let tail = Promise.resolve(), next = 0, count = 0;
  return signal => {
    const pending = tail.then(async () => {
      if (signal.aborted) return false;
      const remaining = Math.max(0, next - now());
      if (remaining) { try { await wait(remaining, undefined, { signal }); } catch (error) { if (signal.aborted && error?.name === 'AbortError') return false; throw error; } }
      if (signal.aborted) return false;
      assert.ok(++count <= limit, 'Bounded native API request limit'); next = now() + spacing; return true;
    });
    tail = pending.then(() => undefined, () => undefined); return pending;
  };
}
export function requestClass(request) {
  const url = new URL(request.url()), method = request.method(), resource = request.resourceType();
  if (method === 'GET' && resource === 'stylesheet' && fonts.has(url.href)) return { kind: 'font' };
  if (url.origin !== origin || url.username || url.password || url.hash || !['GET','HEAD','POST'].includes(method)) return { kind: 'deny' };
  if (url.pathname.startsWith('/api/')) {
    if (!['fetch','xhr'].includes(resource) || !allowedRequest(method, url.pathname)) return { kind: 'deny' };
    if ([...url.searchParams.keys()].some(key => !['q','categoryId','inStockOnly','limit','shiftId'].includes(key))) return { kind: 'deny' };
    return { kind: 'api', path: url.pathname + url.search, pathname: url.pathname, method };
  }
  const brand = brandRequest(url, method, origin); if (brand) return { kind: 'brand', brand };
  if (['GET','HEAD'].includes(method) && !url.search && (['/','/login','/favicon.ico'].includes(url.pathname) || /^\/assets\/[a-zA-Z0-9_.-]+$/.test(url.pathname))) return { kind: 'static' };
  return { kind: 'deny' };
}
export function createRecoveryDispatch(state, { pace = createPacer(), id = randomUUID } = {}) {
  return async route => {
    const request = route.request(), classification = requestClass(request);
    if (classification.kind === 'font') { await route.fulfill({ contentType: 'text/css', body: '' }); return; }
    if (classification.kind === 'deny') { state.errors.push('Request outside exact native scope'); await route.abort(); return; }
    if (classification.kind === 'static') { await route.continue(); return; }
    if (classification.kind === 'brand') {
      const response = await route.fetch({ maxRedirects: 0, maxRetries: 0, timeout: 20_000 });
      try { state.verifiedBrand.push(assertBrandResponse(classification.brand, { status: response.status(), contentType: response.headers()['content-type'], body: await response.body() })); await route.fulfill({ response }); }
      finally { await response.dispose(); }
      return;
    }
    const controller = new AbortController();
    state.controllers.set(request, controller);
    if (state.cancelled.has(request) || state.ending) controller.abort();
    const phase = state.phase; // Immutable dispatch provenance, never a later UI phase.
    async function send(payload, selectedPhase) {
      const row = { id: `${state.fixture.nonce}:${id()}`, caseId: state.caseId, phase: selectedPhase, method: classification.method, path: classification.path, dispatched: false, cancelled: false, delivered: false };
      if (classification.method === 'POST' && classification.pathname === `${prefix}/checkout`) row.payload = safePayload(payload);
      state.requests.push(row);
      if (!(await pace(controller.signal)) || controller.signal.aborted || state.ending) { row.cancelled = true; return null; }
      assert.ok(request.headers().authorization === `Bearer ${state.fixture.accessToken}`, 'Exact owned synthetic actor required');
      row.dispatched = true;
      const headers = { authorization: `Bearer ${state.fixture.accessToken}`, 'content-type': 'application/json', 'x-recovery-qa-request': row.id, 'x-recovery-qa-case': state.caseId, 'x-recovery-qa-phase': selectedPhase };
      const response = await route.fetch({ headers, ...(payload === undefined ? {} : { postData: JSON.stringify(payload) }), maxRedirects: 0, maxRetries: 0, timeout: 20_000 });
      let parsed;
      try { const body = await response.body(); parsed = JSON.parse(body.toString('utf8')); } catch { await response.dispose(); throw new Error('Real API response body unavailable or malformed'); }
      row.status = response.status(); row.sha256 = digest(parsed); row.cancelled = controller.signal.aborted || state.ending;
      return { response, row, parsed };
    }
    let reply;
    try {
      const payload = classification.method === 'POST' ? request.postDataJSON() : undefined;
      const firstCheckout = classification.method === 'POST' && classification.pathname === `${prefix}/checkout` && !state.checkoutSeen;
      if (firstCheckout) {
        state.checkoutSeen = true;
        if (state.mode === 'conflict') {
          const competing = structuredClone(payload); assert.equal(competing.cartItems.length, 1); assert.equal(competing.cartItems[0].quantity, 1); competing.cartItems[0].quantity = 2;
          const primed = await send(competing, 'prime');
          if (!primed) return;
          try { assert.equal(primed.row.status, 201, 'Competing intent must really commit'); primed.row.competingCommit = true; }
          finally { await primed.response.dispose(); }
          if (controller.signal.aborted || state.ending) return; // Never replay an aborted browser request or continue after teardown.
        }
      }
      reply = await send(payload, phase);
      if (!reply) return;
      const expected = firstCheckout && state.mode === 'conflict' ? 409 : classification.method === 'POST' && classification.pathname === `${prefix}/checkout` ? 201 : 200;
      assert.equal(reply.row.status, expected, 'Unexpected real API status');
      if (controller.signal.aborted || state.ending) { reply.row.cancelled = true; return; }
      if (firstCheckout && state.mode === 'unknown') {
        reply.row.droppedAfterCommit = true;
        await route.abort('connectionreset'); return; // Deliberate loss only AFTER a genuine committed 201.
      }
      if (classification.method === 'POST' && classification.pathname.endsWith('/refund')) {
        state.refundReady = true;
        await state.refundRelease;
      }
      if (controller.signal.aborted || state.ending) { reply.row.cancelled = true; return; }
      try { await route.fulfill({ response: reply.response }); reply.row.delivered = true; }
      catch (error) { if (!controller.signal.aborted) throw error; reply.row.cancelled = true; }
    } finally { if (reply) await reply.response.dispose(); state.controllers.delete(request); }
  };
}
export function endRecovery(state) {
  state.ending = true;
  for (const controller of state.controllers.values()) controller.abort();
  state.releaseRefund();
}
export function createState(fixture, scenario) {
  let release;
  const state = { fixture, caseId: scenario.id, mode: scenario.mode, phase: 'initial', checkoutSeen: false, requests: [], errors: [], pageErrors: [], verifiedBrand: [], cancelled: new WeakSet(), controllers: new Map(), ending: false, refundReady: false, refundRelease: new Promise(resolve => { release = resolve; }) };
  state.releaseRefund = release; return state;
}
