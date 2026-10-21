import assert from 'node:assert/strict';
import { seedFixture as seedStaff, cleanupFixture, observeResponse } from '../staff-entry-native/fixture.mjs';
import { cases, allowedRequest, loginPath, loginAttempt, requestLimit } from './contract.mjs';
export { cleanupFixture, drainHttp, finalizeFixture } from '../staff-entry-native/fixture.mjs';
export async function seedFixture(db, ids, markStage = (_stage) => {}) {
 const f=await seedStaff(db,ids,markStage);
 const firstName='合成版面商品 01';
 markStage('first-layout-product');await db.product.update({where:{id:f.productId},data:{name:firstName,sku:'LAYOUT-01'}});
 const products=[{id:f.productId,batchId:f.batchId,name:firstName,sku:'LAYOUT-01'}];
 for(let i=2;i<=12;i++){
  const suffix=String(i).padStart(2,'0'),name=i===12?'合成版面商品 12 超長商品名稱用以驗證多行顯示與取消後保留':'合成版面商品 '+suffix,sku='LAYOUT-'+suffix;
  markStage('product-'+suffix);const p=await db.product.create({data:{tenantId:ids.tenantId,sku,name,stockQuantity:5,safetyStock:1,costPrice:10,retailPrice:20}});
  markStage('batch-'+suffix);const b=await db.productBatch.create({data:{tenantId:ids.tenantId,productId:p.id,batchNumber:'LAYOUT-LOT-'+suffix,quantity:5,costPrice:10,status:'RELEASED',expiryDate:new Date('2099-01-01')}});
  products.push({id:p.id,batchId:b.id,name,sku});
 }
 return {...f,products};
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
      rejected.push('Request outside exact owned layout scope'); res.status(405).json({ success: false }); return;
    }
    let attempt = null, verifiedSubject = null, issuedByRealLogin = false;
    try {
      if (method === 'POST') {
        assert.equal(pathname, loginPath); assert.equal(req.get('authorization'), undefined);
        attempt = loginAttempt(req.body, fixture); assert.equal(attempt, ['active'][attempts[caseId].length]); assert.ok(attempt);
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
