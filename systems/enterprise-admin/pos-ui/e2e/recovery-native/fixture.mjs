import assert from 'node:assert/strict';
import { digest } from './contract.mjs';
export async function seedFixture(db, { tenantId, userId, shiftId }, markStage = (_part) => {}) {
  markStage('tenant'); await db.tenant.create({ data: { id: tenantId, slug: tenantId, name: 'Synthetic checkout recovery tenant', plan: 'pro' } });
  const email = `${userId}@recovery-browser.example.test`;
  markStage('user'); await db.user.create({ data: { id: userId, tenantId, email, fullName: '合成恢復收銀員', passwordHash: 'not-a-login-hash', status: 'active' } });
  markStage('customer'); await db.customer.create({ data: { tenantId, phone: 'WALK_IN' } });
  markStage('product'); const product = await db.product.create({ data: { tenantId, sku: 'SYNTHETIC-RECOVERY', name: '合成結帳與退款驗收商品', stockQuantity: 5, safetyStock: 1, costPrice: 10, retailPrice: 20 } });
  markStage('batch'); const batch = await db.productBatch.create({ data: { tenantId, productId: product.id, batchNumber: 'SYNTHETIC-RECOVERY-LOT', quantity: 5, costPrice: 10, status: 'RELEASED', expiryDate: new Date('2099-01-01') } });
  markStage('shift'); await db.shift.create({ data: { id: shiftId, tenantId, staffId: userId, status: 'OPEN', openingCash: 0 } });
  return { tenantId, userId, shiftId, productId: product.id, batchId: batch.id, email };
}
export const cleanupOrder = Object.freeze(['checkoutCommand','saleBatchAllocation','order','inventoryTransaction','orderNumberCounter','shift','customer','productBatch','product','user','tenant']);
export async function cleanupFixture(db, tenantId, httpDrained) {
  assert.equal(httpDrained, true, 'Never delete fixtures before owned HTTP is settled');
  assert.match(tenantId, /^[a-f0-9-]{36}$/);
  for (const model of cleanupOrder) await db[model].deleteMany({ where: model === 'tenant' ? { id: tenantId } : { tenantId } });
}
export function observeResponse({ res, identity, snapshot, pending, record, onError }) {
  const json = res.json.bind(res);
  res.json = body => {
    let settle;
    const task = new Promise(resolve => { settle = resolve; }); pending.add(task);
    let terminal, resolveTerminal, emitting = false;
    const terminalPromise = new Promise(resolve => { resolveTerminal = resolve; });
    const finish = () => {
      if (terminal) return;
      terminal = { error: emitting ? null : new Error('Real API response finished before owned JSON emission') };
      resolveTerminal(terminal);
    };
    const close = () => {
      if (terminal) return;
      terminal = { error: new Error('Real API response closed before finish') };
      resolveTerminal(terminal);
    };
    // Observe before the first await: client close may happen during DB snapshot.
    res.once('finish', finish); res.once('close', close);
    if (res.destroyed) close(); else if (res.writableFinished) finish();
    void (async () => {
      try {
        const status = res.statusCode, current = await snapshot(body, status);
        if (terminal?.error) throw terminal.error;
        if (res.destroyed) throw new Error('Real API response closed before finish');
        const row = { ...identity, status, sha256: digest(body), body, snapshot: current };
        emitting = true; json(body);
        const outcome = await terminalPromise;
        if (outcome.error) throw outcome.error;
        record(row);
      } catch (error) {
        onError(terminal?.error ?? error);
        if (!res.destroyed && !res.writableEnded) res.status(500).end();
      } finally {
        res.removeListener('finish', finish); res.removeListener('close', close);
        // Snapshot work is still owned even if the socket closed earlier.
        pending.delete(task); settle();
      }
    })();
    return res;
  };
}
export async function drainHttp(server, pending, timeoutMs = 20_000) {
  let timer;
  try {
    await Promise.race([
      (async () => {
        if (server) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
        await Promise.all([...pending]); assert.equal(pending.size, 0);
      })(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Owned HTTP did not drain before cleanup')), timeoutMs); }),
    ]);
    return true;
  } finally { clearTimeout(timer); }
}
// Actual parent finalization: every independent terminal action is attempted once.
// The parent keeps the first error; a diagnostic or disconnect failure cannot erase it.
export async function finalizeFixture(actions, fail) {
  for (const [stage, action] of Object.entries(actions)) {
    try { await action(); } catch (error) { fail(error, stage); }
  }
}
