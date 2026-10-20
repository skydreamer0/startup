import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { createHttpWorkTracker, instrumentExpressHandlers, trackReceivingRequest } from './http-work.mjs';

function harness(handler) {
  function errorHandler(error, _req, res, _next) { if (error) { res.writableEnded = true; res.emit('finish'); } }
  const app = { router: { stack: [{ route: { stack: [{ handle: handler }] } }, { handle: errorHandler }] } };
  instrumentExpressHandlers(app);
  const tracker = createHttpWorkTracker();
  const req = new EventEmitter(); Object.assign(req, { path: '/api/v1/admin/receiving-drafts', method: 'GET', user: { userId: 'actor' } });
  const res = new EventEmitter(); Object.assign(res, { statusCode: 200, destroyed: false, writableFinished: false });
  const rows = [];
  trackReceivingRequest(req, res, () => {}, tracker, row => rows.push(row));
  return { app, tracker, req, res, rows, handler: app.router.stack[0].route.stack[0].handle,
    errorHandler: app.router.stack[1].handle };
}

test('a finished response does not prove the actual async handler Promise has settled', async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const h = harness(async (_req, res) => { res.writableEnded = true; res.emit('finish'); await pending; });
  const actualHandlerWork = h.handler(h.req, h.res, () => {});
  assert.equal(h.rows[0].applicationComplete, false);
  assert.equal(h.rows[0].pendingHandlers, 1);
  assert.equal(h.tracker.activeCount, 1);
  release(); await actualHandlerWork;
  assert.equal(h.rows[0].applicationComplete, true);
  assert.equal(h.rows[0].pendingHandlers, 0);
  assert.equal(h.tracker.activeCount, 0);
});

test('async handler rejection remains pending through response finish and is recorded on settlement', async () => {
  const h = harness(async (_req, res) => { res.writableEnded = true; res.emit('finish'); await Promise.resolve(); throw new Error('synthetic handler reject'); });
  const actualHandlerWork = h.handler(h.req, h.res, () => {});
  let rejection; try { await actualHandlerWork; } catch (error) { rejection = error; }
  assert.match(rejection.message, /synthetic handler reject/);
  h.errorHandler(rejection, h.req, h.res, () => {});
  assert.equal(h.rows[0].applicationComplete, true);
  assert.equal(h.rows[0].pendingHandlers, 0);
  assert.deepEqual(h.rows[0].handlerFailures, [{ name: '<anonymous>', errorName: 'Error' }]);
  assert.equal(h.tracker.activeCount, 0);
});

test('synchronous handler throw is retained and cannot be counted quiet before transport close', () => {
  const h = harness(() => { throw new TypeError('synthetic synchronous handler throw'); });
  let thrown; try { h.handler(h.req, h.res, () => {}); } catch (error) { thrown = error; }
  assert.match(thrown.message, /synthetic synchronous handler throw/);
  assert.equal(h.rows[0].pendingHandlers, 0);
  assert.equal(h.rows[0].applicationComplete, false);
  assert.deepEqual(h.rows[0].handlerFailures, [{ name: '<anonymous>', errorName: 'TypeError' }]);
  assert.equal(h.tracker.activeCount, 1);
  h.errorHandler(thrown, h.req, h.res, () => {});
  assert.equal(h.rows[0].applicationComplete, true);
  assert.equal(h.tracker.activeCount, 0);
});

test('an aborted transport cannot settle an unfinished handler Promise', async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const h = harness(async () => { await pending; });
  const actualHandlerWork = h.handler(h.req, h.res, () => {});
  h.req.emit('aborted'); h.res.destroyed = true; h.res.emit('close');
  assert.equal(h.rows[0].aborted, true);
  assert.equal(h.rows[0].transportComplete, true);
  assert.equal(h.rows[0].applicationComplete, false);
  assert.equal(h.tracker.activeCount, 1);
  release(); await actualHandlerWork;
  assert.equal(h.rows[0].applicationComplete, true);
  assert.equal(h.tracker.activeCount, 0);
});

test('express.json-style middleware return without next stays open until its delayed callback dispatches the async route', async () => {
  let continueParsing, routePromise, releaseRoute;
  const routeGate = new Promise(resolve => { releaseRoute = resolve; });
  function jsonParserStyle(_req, _res, next) { continueParsing = next; }
  async function receivingRoute(_req, res) { res.writableEnded = true; res.emit('finish'); await routeGate; }
  function errorMiddleware(error, _req, res, _next) { if (error) { res.writableEnded = true; res.emit('finish'); } }
  const app = { router: { stack: [
    { handle: jsonParserStyle },
    { route: { stack: [{ handle: receivingRoute }] } },
    { handle: errorMiddleware },
  ] } };
  instrumentExpressHandlers(app);
  const tracker = createHttpWorkTracker();
  const req = new EventEmitter(); Object.assign(req, { path: '/api/v1/admin/receiving-drafts', method: 'PUT' });
  const res = new EventEmitter(); Object.assign(res, { statusCode: 200, destroyed: false, writableEnded: false, writableFinished: false });
  const rows = [];
  trackReceivingRequest(req, res, () => {}, tracker, row => rows.push(row));
  const [parser, route] = app.router.stack;
  parser.handle(req, res, () => { routePromise = route.route.stack[0].handle(req, res, () => {}); });
  assert.equal(rows[0].dispatchComplete, false);
  assert.equal(rows[0].applicationComplete, false);
  assert.equal(tracker.activeCount, 1);
  continueParsing();
  assert.equal(rows[0].pendingHandlers, 1);
  assert.equal(rows[0].applicationComplete, false);
  assert.equal(tracker.activeCount, 1);
  await Promise.resolve();
  assert.equal(rows[0].transportComplete, true);
  assert.equal(rows[0].applicationComplete, false);
  assert.equal(rows[0].pendingHandlers, 1);
  assert.equal(tracker.activeCount, 1);
  releaseRoute(); await routePromise;
  assert.equal(rows[0].dispatchComplete, true);
  assert.equal(rows[0].applicationComplete, true);
  assert.equal(tracker.activeCount, 0);
});

test('the actual Express JSON parser chain stays active through response finish until its route Promise settles', async () => {
  const requireBackend = createRequire(new URL('../../../backend/package.json', import.meta.url));
  const express = requireBackend('express'), request = requireBackend('supertest');
  let releaseRoute, markRouteFinished;
  const routeGate = new Promise(resolve => { releaseRoute = resolve; });
  const routeFinished = new Promise(resolve => { markRouteFinished = resolve; });
  let quietResolve;
  const tracker = createHttpWorkTracker(value => { if (value === 0) quietResolve?.(); });
  const quiet = new Promise(resolve => { quietResolve = resolve; });
  const app = express(); const rows = [];
  app.use((req, res, next) => trackReceivingRequest(req, res, next, tracker, row => rows.push(row)));
  app.use((_req, _res, next) => next()); // same synchronous pre-parser middleware shape as app.ts security layers
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use((_req, _res, next) => next()); // same middleware-to-router continuation shape
  app.put('/api/v1/admin/receiving-drafts', async (req, res) => {
    assert.deepEqual(req.body, { title: 'synthetic callback parser' });
    res.status(200).json({ success: true });
    await routeGate;
    markRouteFinished();
  });
  app.use(function errorMiddleware(error, _req, res, _next) { res.status(500).send(error.message); });
  instrumentExpressHandlers(app);
  const response = await request(app).put('/api/v1/admin/receiving-drafts').send({ title: 'synthetic callback parser' }).timeout({ response: 2000 });
  assert.equal(response.status, 200);
  assert.equal(rows[0].dispatchComplete, false);
  assert.equal(rows[0].applicationComplete, false);
  assert.equal(rows[0].pendingHandlers, 1);
  assert.equal(tracker.activeCount, 1);
  releaseRoute(); await routeFinished; await quiet;
  assert.equal(rows[0].dispatchComplete, true);
  assert.equal(rows[0].applicationComplete, true);
  assert.equal(rows[0].pendingHandlers, 0);
  assert.equal(tracker.activeCount, 0);
});

test('instrumentation preserves normal-handler and Express error-handler arity and argument forwarding', () => {
  const calls = [];
  function normalHandler(req, res, next) { calls.push(['normal', this.tag, req, res]); return next(); }
  function errorMiddleware(error, req, res, next) { calls.push(['error', this.tag, error, req, res]); return next(error); }
  const app = { router: { stack: [{ handle: normalHandler }, { handle: errorMiddleware }] } };
  instrumentExpressHandlers(app);
  const [normal, error] = app.router.stack.map(layer => layer.handle);
  assert.equal(normal.length, 3);
  assert.equal(error.length, 4, 'Express identifies error middleware by its four-argument signature');
  const receiver = { tag: 'receiver' }, req = {}, res = {}, sentinel = new Error('forwarded');
  let normalNext = false, forwardedError;
  normal.call(receiver, req, res, () => { normalNext = true; });
  error.call(receiver, sentinel, req, res, value => { forwardedError = value; });
  assert.equal(normalNext, true);
  assert.equal(forwardedError, sentinel);
  assert.deepEqual(calls, [['normal', 'receiver', req, res], ['error', 'receiver', sentinel, req, res]]);
});

test('instrumented Express dispatch preserves ordinary route and async error-middleware behavior', async () => {
  const requireBackend = createRequire(new URL('../../../backend/package.json', import.meta.url));
  const express = requireBackend('express'), request = requireBackend('supertest');
  const app = express();
  app.get('/normal', async (_req, res) => res.status(200).send('normal route'));
  app.get('/error', async () => { throw new Error('synthetic route rejection'); });
  app.use(function errorMiddleware(error, _req, res, _next) { res.status(503).send(error.message); });
  instrumentExpressHandlers(app);
  assert.equal(app.router.stack.at(-1).handle.length, 4);
  const normal = await request(app).get('/normal');
  assert.equal(normal.status, 200); assert.equal(normal.text, 'normal route');
  const failed = await request(app).get('/error');
  assert.equal(failed.status, 503); assert.equal(failed.text, 'synthetic route rejection');
});
