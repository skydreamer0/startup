import { receivingRequestAllowed } from './fixture.mjs';
import { authRequestPolicy } from '../../../backend/scripts/admin-auth-transport.mjs';

const requestWorkKey = Symbol('receiving-browser-request-work');
const wrappedHandlerKey = Symbol('receiving-browser-tracked-handler');

export function createHttpWorkTracker(onChange = () => {}) {
  let active = 0;
  return {
    get activeCount() { return active; },
    begin(onRequestChange = () => {}) {
      active++;
      let pendingHandlers = 0, transportComplete = false, applicationComplete = false;
      let aborted = false, settled = false, dispatchComplete = false;
      const handlerFailures = [];
      const publish = () => {
        if (!applicationComplete && dispatchComplete && pendingHandlers === 0) applicationComplete = true;
        if (!settled && applicationComplete && transportComplete) {
          settled = true;
          active--;
        }
        const state = { applicationComplete, dispatchComplete, transportComplete, pendingHandlers, handlerFailures: [...handlerFailures], aborted, settled };
        onChange(state);
        onRequestChange(state);
        onChange(active);
      };
      const work = {
        handlerStarted(name) {
          pendingHandlers++;
          publish();
          let completed = false;
          return (error, terminal = false) => {
            if (completed) return;
            completed = true;
            pendingHandlers--;
            if (error) handlerFailures.push({ name: name || '<anonymous>', errorName: error.name || 'Error' });
            if (terminal && !error) dispatchComplete = true;
            publish();
          };
        },
        dispatchFinished() { dispatchComplete = true; publish(); },
        transportFinished() { transportComplete = true; publish(); },
        transportClosed() { transportComplete = true; publish(); },
        requestAborted() { aborted = true; publish(); },
        get state() { return { applicationComplete, dispatchComplete, transportComplete, pendingHandlers, handlerFailures: [...handlerFailures], aborted, settled }; },
      };
      return work;
    },
  };
}

function invokeTracked(handler, receiver, req, args) {
    const work = req[requestWorkKey];
    if (!work) return handler.apply(receiver, args);
    const finish = work.handlerStarted(handler.name);
    const nextIndex = args.length === 4 ? 3 : 2;
    const responseIndex = args.length === 4 ? 2 : 1;
    const response = args[responseIndex];
    const next = args[nextIndex];
    let nextCalled = false;
    args = [...args];
    args[nextIndex] = function (...nextArgs) { nextCalled = true; return next.apply(this, nextArgs); };
    const complete = error => finish(error, !nextCalled && Boolean(response?.writableEnded || response?.destroyed));
    let result;
    try { result = handler.apply(receiver, args); }
    catch (error) { complete(error); throw error; }
    if (result && typeof result.then === 'function') {
      return Promise.resolve(result).then(value => { complete(); return value; }, error => { complete(error); throw error; });
    }
    complete();
    return result;
}

function wrapHandler(handler) {
  if (handler[wrappedHandlerKey]) return handler;
  if (handler.length === 4) {
    function trackedError(error, req, res, next) {
      return invokeTracked(handler, this, req, [error, req, res, next]);
    }
    Object.defineProperty(trackedError, wrappedHandlerKey, { value: true });
    return trackedError;
  }
  function tracked(req, res, next) {
    return invokeTracked(handler, this, req, [req, res, next]);
  }
  Object.defineProperty(tracked, wrappedHandlerKey, { value: true });
  return tracked;
}

function instrumentStack(stack, seenRouters) {
  for (const layer of stack ?? []) {
    if (layer.route?.stack) {
      for (const routeLayer of layer.route.stack) routeLayer.handle = wrapHandler(routeLayer.handle);
    } else if (layer.handle?.stack && !seenRouters.has(layer.handle)) {
      seenRouters.add(layer.handle);
      instrumentStack(layer.handle.stack, seenRouters);
    } else if (typeof layer.handle === 'function') {
      layer.handle = wrapHandler(layer.handle);
    }
  }
}

export function instrumentExpressHandlers(app) {
  const router = app.router ?? app._router;
  if (!router?.stack) throw new Error('The real Express app router stack is unavailable for handler-work instrumentation');
  instrumentStack(router.stack, new Set());
  return app;
}

export function trackReceivingRequest(req, res, next, tracker, onRow, identifyActor = () => null) {
  if (!req.path.startsWith('/api/')) return next();
  let row;
  const record = state => {
    if (!row) return;
    Object.assign(row, state);
    row.status = res.statusCode;
    row.actorId = req.user?.id ?? req.user?.userId ?? identifyActor(req) ?? row.actorId ?? null;
  };
  const work = tracker.begin(record);
  req[requestWorkKey] = work;
  const startedAt = Date.now(), method = req.method, pathname = req.path;
  const url = `http://127.0.0.1:4287${pathname}`;
  const allowed = receivingRequestAllowed(method, url)
    || authRequestPolicy({ url: () => url, method: () => method, resourceType: () => 'fetch' }, 'http://127.0.0.1:4287').allowed;
  row = { method, url, endpoint: pathname.replace('/api/v1/admin', ''), status: res.statusCode, allowed,
    actorId: req.user?.id ?? req.user?.userId ?? null, applicationComplete: false, dispatchComplete: false, transportComplete: false,
    pendingHandlers: 0, handlerFailures: [], aborted: false, transportClosed: false, elapsedMs: 0 };
  onRow(row);
  const finish = () => { work.transportFinished(); record(work.state); row.elapsedMs = Date.now() - startedAt; };
  const close = () => { work.transportClosed(); record(work.state); row.transportClosed = res.destroyed && !res.writableFinished; row.elapsedMs = Date.now() - startedAt; };
  const abort = () => { work.requestAborted(); record(work.state); };
  res.once('finish', finish);
  res.once('close', close);
  req.once('aborted', abort);
  return next();
}
