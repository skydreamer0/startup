import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { requestClass as resourceClass, createPacer as ownedPacer } from '../recovery-native/network.mjs';
import { assertBrandResponse } from '../dialog-acceptance/brand-assets.mjs';
import { allowedRequest, origin, loginPath, loginAttempt, safeResponse, digest, requestLimit, requestSpacingMs } from './contract.mjs';
export const createPacer = (options = {}) => ownedPacer({ spacing: requestSpacingMs, limit: requestLimit, ...options });
export function requestClass(request) {
  const url = new URL(request.url()), method = request.method();
  if (url.pathname.startsWith('/api/')) {
    if (url.origin !== origin || url.username || url.password || url.hash || !['fetch','xhr'].includes(request.resourceType()) || !allowedRequest(method, url.pathname)) return { kind: 'deny' };
    if (method === 'POST' && url.search || [...url.searchParams.keys()].some(key => !['q','categoryId','inStockOnly','limit'].includes(key))) return { kind: 'deny' };
    return { kind: 'api', path: url.pathname, method }; // Queries never become ledger text.
  }
  return resourceClass(request);
}
export function createState(fixture, scenario) {
  let release = () => {}; const activeRelease = new Promise(resolve => { release = () => resolve(undefined); });
  return { activeRelease, releaseActive: release, activeReady: false, fixture, caseId: scenario.id, requests: /** @type {Array<{id: string, caseId: string, path: string, method: string, attempt: string|null, dispatched: boolean, cancelled: boolean, delivered: boolean, status?: number, sha256?: string}>} */ ([]), errors: /** @type {string[]} */ ([]), pageErrors: /** @type {string[]} */ ([]), verifiedBrand: /** @type {any[]} */ ([]), controllers: new Map(), cancelled: new WeakSet(), ending: false, journey: /** @type {Record<string, any>} */ ({}), stage: 'initial' };
}
export function endEntry(state) { state.ending = true; state.releaseActive(); for (const controller of state.controllers.values()) controller.abort(); }
async function disposeResponse(response, primaryFailed, state) {
  try { if (response) await response.dispose(); }
  catch (error) {
    if (!primaryFailed) throw error;
    state.errors.push('Response disposal also failed after the primary error');
  }
}
export function createDispatch(state, { pace = createPacer(), id = randomUUID } = {}) {
  return async route => {
    const request = route.request(), kind = requestClass(request);
    if (kind.kind === 'deny') { state.errors.push('Request outside exact staff-entry scope'); await route.abort(); return; }
    if (kind.kind === 'font') { await route.fulfill({ contentType: 'text/css', body: '' }); return; }
    if (kind.kind === 'static') { await route.continue(); return; }
    if (kind.kind === 'brand') {
      const response = await route.fetch({ maxRedirects: 0, maxRetries: 0, timeout: 20_000 });
      let primaryFailed = false;
      try { state.verifiedBrand.push(assertBrandResponse(kind.brand, { status: response.status(), contentType: response.headers()['content-type'], body: await response.body() })); await route.fulfill({ response }); }
      catch (error) { primaryFailed = true; throw error; }
      finally { await disposeResponse(response, primaryFailed, state); }
      return;
    }
    const attempt = kind.path === loginPath ? loginAttempt(request.postDataJSON(), state.fixture) : null;
    if (kind.path === loginPath) assert.ok(attempt, 'Only three owned synthetic employee-code inputs');
    const controller = new AbortController(); state.controllers.set(request, controller);
    if (state.ending || state.cancelled.has(request)) controller.abort();
    const row = { id: `${state.fixture.nonce}:${id()}`, caseId: state.caseId, path: kind.path, method: kind.method, attempt, dispatched: false, cancelled: false, delivered: false };
    state.requests.push(row); let response, primaryFailed = false;
    try {
      if (!(await pace(controller.signal)) || controller.signal.aborted || state.ending) { row.cancelled = true; return; }
      const original = request.headers();
      const headers = { ...(original.authorization ? { authorization: original.authorization } : {}), 'content-type': 'application/json', 'x-staff-qa-request': row.id, 'x-staff-qa-case': state.caseId };
      row.dispatched = true;
      response = await route.fetch({ headers, maxRedirects: 0, maxRetries: 0, timeout: 20_000 });
      const body = JSON.parse((await response.body()).toString('utf8'));
      row.status = response.status();
      assert.equal(row.status, attempt && attempt !== 'active' ? 401 : 200, 'Unexpected genuine staff-entry API result');
      row.sha256 = digest(safeResponse(kind.path, row.status, body));
      if (attempt === 'active' && !controller.signal.aborted && !state.ending) { state.activeReady = true; await state.activeRelease; }
      if (controller.signal.aborted || state.ending) { row.cancelled = true; return; }
      try { await route.fulfill({ response }); row.delivered = true; }
      catch (error) { if (!controller.signal.aborted) throw error; row.cancelled = true; }
    } catch (error) { primaryFailed = true; throw error; }
    finally {
      try { await disposeResponse(response, primaryFailed, state); }
      finally { state.controllers.delete(request); }
    }
  };
}
