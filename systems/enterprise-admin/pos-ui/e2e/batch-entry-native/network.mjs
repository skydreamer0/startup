import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { requestClass as resourceClass, createPacer as basePacer } from '../recovery-native/network.mjs';
import { assertBrandResponse } from '../dialog-acceptance/brand-assets.mjs';
import { requestIdentity } from './fixture.mjs';
import { origin, routePath, digest, requestLimit, requestSpacingMs } from './contract.mjs';
export const createPacer = (options = {}) => basePacer({ spacing: requestSpacingMs, limit: requestLimit, ...options });
export function requestClass(request) {
  let url; try { url = new URL(request.url()); } catch { return { kind: 'deny' }; }
  if (url.pathname.startsWith('/api/')) {
    if (url.origin !== origin || url.username || url.password || url.hash || !['fetch', 'xhr'].includes(request.resourceType())) return { kind: 'deny' };
    if (url.searchParams.size !== new Set(url.searchParams.keys()).size) return { kind: 'deny' };
    const identity = requestIdentity(request.method(), url.pathname, Object.fromEntries(url.searchParams));
    return identity ? { kind: 'api', method: 'GET', ...identity } : { kind: 'deny' };
  }
  if (url.origin === origin && !url.username && !url.password && !url.search && !url.hash && url.pathname === routePath && request.method() === 'GET' && request.resourceType() === 'document') return { kind: 'static' };
  return resourceClass(request);
}
/** @returns {{fixture: any, caseId: string, actor: string, mode: string, stage: string, requests: Array<any>, errors: string[], pageErrors: string[], verifiedBrand: Array<any>, controllers: Map<any, AbortController>, cancelled: WeakSet<object>, ending: boolean, holdPageTwo: boolean, held: Set<AbortController>, hold: Promise<void>, releaseHold: () => void, journey: { stages: string[], postCount: number, [key: string]: any }}} */
export function createState(fixture, scenario) {
  let release = () => {}; const hold = new Promise(resolve => { release = () => resolve(); });
  return { fixture, caseId: scenario.id, actor: scenario.actor, mode: 'normal', stage: 'initial', requests: [], errors: [], pageErrors: [], verifiedBrand: [], controllers: new Map(), cancelled: new WeakSet(), ending: false,
    holdPageTwo: ['full', 'cold'].includes(scenario.kind), held: new Set(), hold, releaseHold: release, journey: { stages: [], postCount: 0 } };
}
export function endEntry(state) { state.ending = true; state.releaseHold(); for (const controller of state.controllers.values()) controller.abort(); }
export async function disposeResponse(response, primaryFailed, state) {
  try { if (response) await response.dispose(); }
  catch (error) { if (!primaryFailed) throw error; state.errors.push('Response disposal also failed after primary error'); }
}
export function createDispatch(state, { pace = createPacer(), id = randomUUID } = {}) {
  return async route => {
    const request = route.request(), kind = requestClass(request);
    if (kind.kind === 'deny') { state.errors.push('Request outside exact read-only batch scope'); await route.abort(); return; }
    if (kind.kind === 'font') { await route.fulfill({ contentType: 'text/css', body: '' }); return; }
    if (kind.kind === 'static') { await route.continue(); return; }
    if (kind.kind === 'brand') {
      let response, primaryFailed = false;
      try { response = await route.fetch({ maxRedirects: 0, maxRetries: 0, timeout: 15_000 }); state.verifiedBrand.push(assertBrandResponse(kind.brand, { status: response.status(), contentType: response.headers()['content-type'], body: await response.body() })); await route.fulfill({ response }); }
      catch (error) { primaryFailed = true; throw error; }
      finally { await disposeResponse(response, primaryFailed, state); }
      return;
    }
    const controller = new AbortController(); state.controllers.set(request, controller);
    if (state.ending || state.cancelled.has(request)) controller.abort();
    const row = { id: `${state.fixture.nonce}:${id()}`, caseId: state.caseId, actor: state.actor, stage: state.stage, method: 'GET', path: kind.path, page: kind.page, dispatched: false, cancelled: false, delivered: false };
    const fault = kind.path.endsWith('/inventory/products') && kind.page === 2 && ['http500', 'malformed'].includes(state.mode) ? state.mode : null;
    state.requests.push(row); let response, primaryFailed = false;
    try {
      if (!(await pace(controller.signal)) || controller.signal.aborted || state.ending) { row.cancelled = true; return; }
      const authorization = request.headers().authorization;
      assert.ok(authorization === `Bearer ${state.fixture.tokens[state.actor]}`, 'Actual request must carry the exact owned actor');
      row.dispatched = true;
      response = await route.fetch({ headers: { authorization, 'content-type': 'application/json', 'x-batch-entry-request': row.id, 'x-batch-entry-case': state.caseId }, maxRedirects: 0, maxRetries: 0, timeout: 15_000 });
      const body = JSON.parse((await response.body()).toString('utf8')); row.status = response.status(); row.sha256 = digest(body);
      const restricted = kind.path.endsWith('/inventory/products') || kind.path.endsWith('/product-batches');
      assert.equal(row.status, state.actor === 'deniedA' && restricted ? 403 : 200, 'Unexpected genuine batch-entry HTTP result');
      if (state.holdPageTwo && kind.path.endsWith('/inventory/products') && kind.page === 2 && !controller.signal.aborted && !state.ending) {
        state.held.add(controller); await state.hold; state.held.delete(controller);
      }
      if (controller.signal.aborted || state.ending) { row.cancelled = true; return; }
      try {
        if (fault) {
          const mutated = fault === 'http500' ? { success: false, error: { message: 'Synthetic batch read transport failure' } } : { ...body, data: { ...body.data, data: [null] } };
          row.fault = fault; row.deliveredSha256 = digest(mutated); row.deliveredStatus = fault === 'http500' ? 500 : 200;
          await route.fulfill({ status: row.deliveredStatus, contentType: 'application/json', body: JSON.stringify(mutated) });
        } else await route.fulfill({ response });
        row.delivered = true;
      } catch (error) { if (!controller.signal.aborted) throw error; row.cancelled = true; }
    } catch (error) { primaryFailed = true; throw error; }
    finally { state.held.delete(controller); try { await disposeResponse(response, primaryFailed, state); } finally { state.controllers.delete(request); } }
  };
}
