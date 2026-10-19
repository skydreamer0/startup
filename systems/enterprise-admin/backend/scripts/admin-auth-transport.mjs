import assert from 'node:assert/strict';
import { authActorKeys, authCredential, authReadResources } from './admin-auth-fixture.mjs';
export const authApiPrefix = '/api/v1/admin';
export const authGetEndpoints = ['/auth/me','/tenants/me/plan','/dashboard/kpis','/crm/metrics','/analytics/kpis','/analytics/trends','/analytics/bonus-gate','/analytics/heatmap','/analytics/reorder-forecast','/reports/cashflow','/reports/cashflow/trend'];
export function authRequestPolicy(request, origin) {
    const url = new URL(request.url());
    const method = request.method(), resourceType = request.resourceType();
    const local = url.origin === origin;
    const api = url.pathname.startsWith(`${authApiPrefix}/`);
    const endpoint = api ? url.pathname.slice(authApiPrefix.length) : null;
    const transport = ['fetch','xhr'].includes(resourceType);
    const knownEndpoint = authGetEndpoints.includes(endpoint) || ['/auth/login','/auth/logout','/auth/refresh'].includes(endpoint);
    const pagePath = ['/login','/dashboard','/reports/cashflow'].includes(url.pathname);
    const assetPath = /^\/assets\/[A-Za-z0-9_.-]+$/.test(url.pathname) || url.pathname === '/favicon.ico';
    const frontEnd = (resourceType === 'document' && pagePath) || (['script','stylesheet','image','font','other'].includes(resourceType) && assetPath);
    const allowed = local && (api ? transport && ((method === 'GET' && authGetEndpoints.includes(endpoint)) || (method === 'POST' && ['/auth/login','/auth/logout','/auth/refresh'].includes(endpoint) && !url.search)) : method === 'GET' && frontEnd);
    // Query strings and unknown paths are never copied into auth artifacts.
    const safePath = api ? (knownEndpoint ? url.pathname : authApiPrefix + '/[unrecognized]') : ((pagePath || assetPath) ? url.pathname : '/[unrecognized]');
    return { allowed, api, method, endpoint: api ? (knownEndpoint ? endpoint : '[unrecognized]') : null, path: safePath + (url.search ? '?[redacted]' : ''), resourceType };
}
export function createAuthBudget(now = () => performance.now()) {
    const start = now(); let api = 0, analytics = 0;
    const check = () => assert.ok(now() - start < 180000, 'Auth whole-flow deadline exceeded');
    return { check, request(endpoint) { check(); assert.ok(++api <= 160, 'Auth API ceiling exceeded'); if (endpoint.startsWith('/analytics/')) assert.ok(++analytics <= 60, 'Auth analytics ceiling exceeded'); }, receipt: () => ({ elapsedMs: now()-start, deadlineMs:180000, apiRequests:api,maxApiRequests:160,analyticsRequests:analytics,maxAnalyticsRequests:60 }) };
}
export function authDispatchActor(request, endpoint, fixture, tokenActors) {
    if (endpoint === '/auth/login') {
        let body; try { body = request.postDataJSON(); } catch { return null; }
        return authActorKeys.find(key => body?.email === authCredential(fixture,key).email) ?? null;
    }
    if (endpoint === '/auth/refresh') {
        let body; try { body = request.postDataJSON(); } catch { return null; }
        return tokenActors.get(body?.refreshToken) ?? null;
    }
    const header = request.headers().authorization;
    return typeof header === 'string' && header.startsWith('Bearer ') ? tokenActors.get(header.slice(7)) ?? null : null;
}
export function projectAuthResponse(endpoint, status, body, actor, fixture, tokenActors) {
    const safe = { status, actor };
    if (status !== 200) { safe.errorCode = ['AUTH_FAILED','TOKEN_INVALID','UNAUTHORIZED','FORBIDDEN','INVALID_TOKEN','TOKEN_EXPIRED','TENANT_REQUIRED','PLAN_UPGRADE_REQUIRED','RATE_LIMIT_EXCEEDED'].includes(body?.error?.code) ? body.error.code : 'UNRECOGNIZED'; return safe; }
    if (endpoint === '/auth/login' || endpoint === '/auth/refresh') {
        assert.ok(authActorKeys.includes(actor)); assert.equal(typeof body?.data?.accessToken,'string');
        tokenActors.set(body.data.accessToken,actor);
        if (endpoint === '/auth/login') {
            assert.equal(typeof body.data.refreshToken,'string'); tokenActors.set(body.data.refreshToken,actor);
            assert.equal(body.data.user?.id,fixture.ids[actor]); safe.userId=body.data.user.id;
        }
        safe.actualTokenIssued=true;
    } else if (endpoint === '/auth/me') {
        assert.ok(authActorKeys.includes(actor)); assert.equal(body?.data?.id,fixture.ids[actor]);
        assert.ok(Array.isArray(body.data.permissions)); const expected=(actor==='allowed'?authReadResources:authReadResources.filter(resource=>resource!=='reports')).map(resource=>`read:${resource}`).sort();assert.deepEqual([...body.data.permissions].sort(),expected);safe.userId=body.data.id; safe.permissions=expected;
    } else if (endpoint === '/reports/cashflow') {
        assert.equal(typeof body?.data?.period,'string');assert.match(body.data.period,/^\d{4}-(0[1-9]|1[0-2])$/);
        if(body.data.period==='2026-01'){assert.equal(body.data.operatingInflows,0); assert.equal(body.data.operatingOutflows,43); assert.equal(body.data.investingOutflows,0); assert.equal(body.data.netCashFlow,-43);}
        safe.period=body.data.period;safe.operatingOutflows=body.data.operatingOutflows;safe.netCashFlow=body.data.netCashFlow;
    }
    return safe;
}
export function createAuthRouteHandler({ origin, fixture, tokenActors, state, budget, pace, network, responses, forbidden, pending, contextId }) {
    return async route => {
        const request=route.request(), url=new URL(request.url()), policy=authRequestPolicy(request,origin);
        const entry={contextId,requestId:++state.nextRequestId,...policy,actor:policy.api?authDispatchActor(request,policy.endpoint,fixture,tokenActors):null};
        network.push(entry);
        if (!policy.allowed) {
            if (['fonts.googleapis.com','fonts.gstatic.com'].includes(url.hostname) && request.method()==='GET') {entry.externalFontBlocked=true;await route.abort();return;}
            forbidden.push(entry);await route.abort();return;
        }
        if (!policy.api) {await route.continue();return;}
        budget.request(policy.endpoint);
        // Capture intent and actor before queueing; only one exact report response may be replaced.
        const synthetic401 = state.faultOnce === true && policy.method==='GET' && policy.endpoint==='/reports/cashflow' && url.searchParams.get('period')==='2026-01';
        if(synthetic401)state.faultOnce=false;
        const hold=policy.endpoint==='/auth/refresh'?state.holdRefresh:null;
        const work=(async()=>{
            if(policy.endpoint.startsWith('/analytics/')) {const admission=await pace(()=>!!request.failure());entry.pacing=admission;if(!admission.admitted){entry.cancelled=true;await route.abort().catch(()=>{});return;}}
            if(request.failure()){entry.cancelled=true;await route.abort().catch(()=>{});return;}
            if(synthetic401){entry.synthetic401=true;entry.status=401;responses.push({...entry,status:401,errorCode:'SYNTHETIC_EXPIRED_ACCESS'});await route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({success:false,error:{code:'SYNTHETIC_EXPIRED_ACCESS',message:'Synthetic expired access'}})});return;}
            const actual=await route.fetch({timeout:25000}),status=actual.status();entry.status=status;
            const body=await actual.json();const projection=projectAuthResponse(policy.endpoint,status,body,entry.actor,fixture,tokenActors);
            responses.push({contextId,requestId:entry.requestId,path:entry.path,method:entry.method,endpoint:policy.endpoint,...projection});
            if(hold){hold.browserRequest=request;assert.equal(status,200);assert.equal(projection.actualTokenIssued,true);entry.heldActualResponse=true;hold.responseReadyAt=performance.now();hold.ready.resolve({contextId,requestId:entry.requestId,actor:entry.actor,status});await hold.release.promise;hold.releasedAt=performance.now();entry.holdReleased=true;hold.releaseObserved=true;}
            try{await route.fulfill({response:actual});}catch(error){if(!request.failure())throw error;entry.cancelled=true;}
        })();
        const outcome=work.then(()=>true,async()=>{const cancelled=!!request.failure();if(cancelled){entry.cancelled=true;}else{entry.transportFailed=true;state.transportFailure=true;}await route.abort().catch(()=>{});return cancelled;});
        pending.push(outcome);await outcome;
    };
}
