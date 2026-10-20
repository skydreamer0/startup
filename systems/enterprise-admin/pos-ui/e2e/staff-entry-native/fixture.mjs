import assert from 'node:assert/strict';
import { seedFixture as seedProduct } from '../recovery-native/fixture.mjs';
import { digest, loginPath, safeResponse, cases, allowedRequest, loginAttempt, requestLimit } from './contract.mjs';
export { drainHttp, finalizeFixture } from '../recovery-native/fixture.mjs';
export async function seedFixture(db, ids, markStage = (_stage) => {}) {
  const fixture = await seedProduct(db, ids, markStage);
  markStage('existing-default-tenant'); await db.tenant.update({ where: { id: ids.tenantId }, data: { slug: 'default' } });
  const codes = { active: `SYNTHETIC-A-${ids.userId}`, inactive: `SYNTHETIC-I-${ids.userId}`, unknown: `SYNTHETIC-X-${ids.userId}` };
  const fullName = '合成員工碼收銀員';
  markStage('active-employee'); await db.user.update({ where: { id: ids.userId }, data: { fullName, employeeCode: codes.active } });
  markStage('inactive-employee'); await db.user.create({ data: { id: ids.inactiveId, tenantId: ids.tenantId, email: `${ids.inactiveId}@staff-entry.example.test`, passwordHash: 'not-a-login-hash', fullName: '合成停用員工', status: 'suspended', employeeCode: codes.inactive } });
  markStage('existing-permission'); await db.permission.create({ data: { id: ids.permissionId, action: 'manage', resource: 'pos' } });
  markStage('role'); await db.role.create({ data: { id: ids.roleId, tenantId: ids.tenantId, name: 'Synthetic existing POS permission' } });
  markStage('role-permission'); await db.rolePermission.create({ data: { roleId: ids.roleId, permissionId: ids.permissionId } });
  markStage('user-role'); await db.userRole.create({ data: { userId: ids.userId, roleId: ids.roleId } });
  return { ...fixture, ...ids, codes, fullName };
}
export async function cleanupFixture(db, ids, httpDrained) {
  assert.equal(httpDrained, true, 'Never remove fixtures while owned HTTP can still run');
  for (const key of ['tenantId','roleId','permissionId','userId','inactiveId']) assert.match(ids[key], /^[a-f0-9-]{36}$/);
  await db.userRole.deleteMany({ where: { roleId: ids.roleId } });
  await db.rolePermission.deleteMany({ where: { roleId: ids.roleId, permissionId: ids.permissionId } });
  await db.role.deleteMany({ where: { id: ids.roleId, tenantId: ids.tenantId } });
  await db.permission.deleteMany({ where: { id: ids.permissionId } });
  for (const model of ['shift','customer','productBatch','product','user']) await db[model].deleteMany({ where: { tenantId: ids.tenantId } });
  await db.tenant.deleteMany({ where: { id: ids.tenantId } });
}
// Synchronous body projection before sending, with finish/close listeners
// registered before invoking the real response. No raw token is retained.
export function observeResponse({ res, identity, verifyLogin, pending, record, onError }) {
  const json = res.json.bind(res);
  let settle; const task = new Promise(resolve => { settle = resolve; }); pending.add(task);
  let done = false, emitted = false, closed = false, row;
  function complete() {
    if (done) return; done = true;
    res.removeListener('finish', finish); res.removeListener('close', close);
    pending.delete(task); settle();
  }
  function finish() {
    if (done) return;
    if (!emitted || !row) onError(new Error('Real API finished without an observed JSON body'));
    else if (!closed) record(row);
    complete();
  }
  function close() {
    if (done) return; closed = true;
    onError(new Error('Real staff-entry response closed before finish'));
    // A closed socket does NOT prove the production async handler has stopped.
    // Keep ownership until it attempts JSON/end, or the bounded drain fails closed.
    if (emitted) complete();
  }
  res.once('finish', finish); res.once('close', close);
  res.json = body => {
    emitted = true;
    try {
      if (closed || res.destroyed || res.writableFinished) throw new Error('Response already terminated');
      const safe = safeResponse(identity.path, res.statusCode, body);
      const verified = identity.path === loginPath && res.statusCode === 200 ? verifyLogin(body.data.accessToken, body.data.user) : {};
      row = { ...identity, ...verified, status: res.statusCode, body: safe, sha256: digest(safe) };
      return json(body);
    } catch (error) {
      onError(error); complete();
      if (!res.destroyed && !res.writableEnded) res.status(500).end();
      return res;
    }
  };
}

export function createGuard({ fixture, nonce, verifyAccessToken, issued, pending, requests, rejected, onError }) {
  const identities = new Set(), attempts = Object.fromEntries(cases.map(row => [row.id, []]));
  return (req, res, next) => {
    // Snapshot known path and method before the production app's nested routers.
    const id = req.get('x-staff-qa-request') ?? '', caseId = req.get('x-staff-qa-case') ?? '', method = req.method, pathname = req.path;
    const query = Object.keys(req.query);
    if (!cases.some(row => row.id === caseId) || !allowedRequest(method, pathname) || req.get('x-tenant-id')
        || query.some(key => !['q','categoryId','inStockOnly','limit'].includes(key)) || method === 'POST' && query.length
        || !id.startsWith(`${nonce}:`) || identities.has(id) || identities.size >= requestLimit) {
      rejected.push('Request outside exact owned staff-entry scope'); res.status(405).json({ success: false }); return;
    }
    let attempt = null, verifiedSubject = null, issuedByRealLogin = false;
    try {
      if (method === 'POST') {
        assert.equal(pathname, loginPath); assert.equal(req.get('authorization'), undefined);
        attempt = loginAttempt(req.body, fixture); assert.equal(attempt, ['inactive','unknown','active'][attempts[caseId].length]); assert.ok(attempt);
        attempts[caseId].push(attempt);
      } else {
        const authorization = req.get('authorization') ?? ''; assert.ok(authorization.startsWith('Bearer '));
        const token = authorization.slice(7); assert.ok(issued.has(token)); const payload = verifyAccessToken(token); assert.equal(payload.userId, fixture.userId);
        verifiedSubject = payload.userId; issuedByRealLogin = true;
      }
    } catch { rejected.push('Request identity or login sequence outside owned scope'); res.status(405).json({ success: false }); return; }
    identities.add(id);
    observeResponse({ res, identity: { id, caseId, method, path: pathname, attempt, verifiedSubject, issuedByRealLogin }, pending,
      verifyLogin: (token, user) => {
        const payload = verifyAccessToken(token); assert.equal(payload.userId, fixture.userId); assert.equal(user.id, fixture.userId); assert.equal(user.fullName, fixture.fullName);
        issued.add(token); return { verifiedSubject: payload.userId, issuedByRealLogin: true };
      }, record: row => requests.push(row), onError });
    next();
  };
}
