import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAuthFixture, authCredential, assertAuthFixture, seedAuthFixture, cleanupAuthFixture, redactAuthSnapshot, assertAuthMutationScope, assertAuthAuditMatchesResponses } from './admin-auth-fixture.mjs';
const fakeHash = async () => '$argon2id$v=19$m=1,t=1,p=1$synthetic$not_a_real_password_hash';
const fixture = () => buildAuthFixture(randomUUID(), fakeHash);
function fakeDb({ collision = false, failCreate = null, remaining = null, existingPermission = true } = {}) {
    const calls = [], db = {};
    for (const model of ['tenant','user','role','expense','permission','auditLog','rolePermission','userRole']) db[model] = {
        count: async arg => { calls.push([model, 'count', arg]); if (model === 'tenant' && arg.where.slug) return collision ? 1 : 0; return remaining === model && calls.some(x => x[1] === 'deleteMany') ? 1 : 0; },
        createMany: async arg => { calls.push([model, 'createMany', arg]); if (model === failCreate) throw new Error('synthetic seed failure'); return { count: arg.data.length }; },
        create: async arg => { calls.push([model, 'create', arg]); return { ...arg.data }; },
        deleteMany: async arg => { calls.push([model, 'deleteMany', arg]); return { count: 1 }; },
        findFirst: async arg => existingPermission ? { id: `existing-shared-read-${arg.where.resource}` } : null,
    };
    return { db, calls };
}
function snapshots(f) {
    const tables = ['tenants','users','roles','permissions','role_permissions','user_roles','audit_logs','expenses',...Array.from({length:25},(_,i)=>`business_${i}`)];
    const before = Object.fromEntries(tables.map(name => [name, []]));
    before.users = f.user.map(row => ({ id: row.id, tenant_id: row.tenantId, email: row.email, password_hash: authCredential(f, ['allowed','denied','suspended'].find(key => f.ids[key] === row.id)).passwordHash, totp_secret: null, status: row.status, last_login_at: null, failed_login_attempts: 0, updated_at: '2026-01-01T00:00:00.000Z' }));
    before.expenses = [{id:f.ids.expense, amount:'43', tenant_id:f.ids.tenant}];
    const after = structuredClone(before);
    after.users[0].last_login_at = '2026-01-01T00:01:00.000Z'; after.users[0].updated_at = after.users[0].last_login_at;
    after.audit_logs.push({ id:randomUUID(), tenant_id:f.ids.tenant, user_id:f.ids.allowed, action:'LOGIN', resource_type:'users', resource_id:f.ids.allowed, old_value:null, new_value:null });
    return { before, after };
}
test('fixture satisfies exact tenant/role/user/expense shapes without serializing random credentials', async () => {
    const f = await fixture(); assertAuthFixture(f);
    const serialized = JSON.stringify(f);
    for (const key of ['allowed','denied','suspended']) { const c=authCredential(f,key); assert.ok(!serialized.includes(c.password)); assert.ok(!serialized.includes(c.passwordHash)); }
    assert.equal(new Set(['allowed','denied','suspended'].map(k=>authCredential(f,k).password)).size,3);
});
test('seed binds valid hashes only to owned users and persisted report grant only to allowed role', async () => {
    const f=await fixture(), {db,calls}=fakeDb(); await seedAuthFixture(db,f);
    const users=calls.find(x=>x[0]==='user'&&x[1]==='createMany')[2].data; assert.equal(users.length,3); assert.ok(users.every(x=>x.passwordHash.startsWith('$argon2id$')));
    assert.deepEqual(calls.filter(x=>x[0]==='rolePermission'&&x[1]==='create'&&x[2].data.permissionId==='existing-shared-read-reports').map(x=>x[2].data),[{roleId:f.ids.allowedRole,permissionId:'existing-shared-read-reports'}]);
    assert.equal(calls.filter(x=>x[0]==='userRole'&&x[1]==='create').length,3);
    await cleanupAuthFixture(db,f); assert.equal(calls.some(x=>x[0]==='permission'&&x[1]==='deleteMany'),false);
});
test('preexisting default aborts before ownership and refuses cleanup', async () => {
    const f=await fixture(),{db,calls}=fakeDb({collision:true}); await assert.rejects(seedAuthFixture(db,f),/Default tenant already exists/); assert.equal(f.ownershipProven,false); await assert.rejects(cleanupAuthFixture(db,f),/ownership is unproven/); assert.ok(calls.every(x=>x[1]==='count'));
});
test('partial seed still has exact owned cleanup, never unscoped or shared permission deletion', async () => {
    const f=await fixture(),{db,calls}=fakeDb({failCreate:'role'}); await assert.rejects(seedAuthFixture(db,f)); assert.equal(f.ownershipProven,true); await cleanupAuthFixture(db,f);
    for(const [model,op,arg] of calls.filter(x=>x[1]==='deleteMany')) {assert.ok(arg.where); if(model==='auditLog'){assert.equal(arg.where.tenantId,f.ids.tenant);assert.deepEqual(arg.where.userId.in,f.user.map(x=>x.id));}else assert.ok(arg.where.id?.in||arg.where.roleId?.in||arg.where.userId?.in);}
});
test('new permission is removed by its proven absent ID; nonzero cleanup fails', async () => {
    const f=await fixture(),{db,calls}=fakeDb({existingPermission:false}); await seedAuthFixture(db,f); await cleanupAuthFixture(db,f); assert.equal(f.createdPermissions.length,4); assert.deepEqual(calls.find(x=>x[0]==='permission'&&x[1]==='deleteMany')[2],{where:{id:{in:f.createdPermissions}}});
    const g=await fixture(), bad=fakeDb({remaining:'user'}); await seedAuthFixture(bad.db,g); await assert.rejects(cleanupAuthFixture(bad.db,g),/cleanup is incomplete/);
});
test('mutation oracle accepts only auth fields and exact own LOGIN/LOGOUT rows; serialization redacts hashes and TOTP', async () => {
    const f=await fixture(),{before,after}=snapshots(f); const receipt=assertAuthMutationScope(before,after,f); assert.equal(receipt.businessTablesUnchanged,31); assert.equal(receipt.auditAdded.length,1);
    const redacted=redactAuthSnapshot(after); assert.equal(redacted.users[0].password_hash,'[REDACTED]');assert.equal(redacted.users[0].totp_secret,'[REDACTED]');assert.ok(after.users[0].password_hash.startsWith('$argon2id$'));
});
for(const [name,change] of [
 ['password hash',s=>s.after.users[0].password_hash='changed'],
 ['role',s=>s.after.roles.push({id:randomUUID()})],
 ['expense',s=>s.after.expenses[0].amount='44'],
 ['suspended login',s=>s.after.users[2].last_login_at='2026-01-01T00:01:00Z'],
 ['negative attempts',s=>s.after.users[0].failed_login_attempts=-1],
 ['foreign audit',s=>s.after.audit_logs[0].tenant_id=randomUUID()],
 ['mutation audit',s=>s.after.audit_logs[0].action='UPDATE_USER_ROLE'],
 ['audit secret payload',s=>s.after.audit_logs[0].new_value='unexpected'],
 ['audit foreign resource',s=>s.after.audit_logs[0].resource_id=randomUUID()],
 ['user addition',s=>s.after.users.push({...s.after.users[0],id:randomUUID()})],
 ['timestamp regression',s=>s.after.users[0].updated_at='2000-01-01T00:00:00Z'],
]) test(`mutation oracle rejects ${name}`,async()=>{const f=await fixture(),s=snapshots(f);change(s);assert.throws(()=>assertAuthMutationScope(s.before,s.after,f));});
test('existing audit rows cannot disappear or change',async()=>{const f=await fixture(),s=snapshots(f);const old={id:randomUUID(),action:'EXISTING'};s.before.audit_logs.push(old);assert.throws(()=>assertAuthMutationScope(s.before,s.after,f));s.after.audit_logs.push({...old,action:'CHANGED'});assert.throws(()=>assertAuthMutationScope(s.before,s.after,f));});
test('malformed fixture tenant relation and expense policy fail before writes',async()=>{const f=await fixture();f.expense[0].amount=-43;assert.throws(()=>assertAuthFixture(f));f.expense[0].amount=43;f.role[0].tenantId=randomUUID();assert.throws(()=>assertAuthFixture(f));});

test('audit reconciliation requires exact real login/logout counts and reset failed attempts',async()=>{const f=await fixture(),s=snapshots(f);s.after.users[1].last_login_at='2026-01-01T00:01:00.000Z';const m=assertAuthMutationScope(s.before,s.after,f);const responses=[{endpoint:'/auth/login',status:200,actor:'allowed'}];assert.equal(assertAuthAuditMatchesResponses(m,responses,f).auditCount,1);assert.throws(()=>assertAuthAuditMatchesResponses(m,[...responses,{endpoint:'/auth/logout',status:200,actor:'allowed'}],f));m.authUserChanges[0].failedLoginAttempts=1;assert.throws(()=>assertAuthAuditMatchesResponses(m,responses,f));});

test('fixture review inventory binds all sixteen complete migrations and their SQL CHECK/FK counts',()=>{const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../..');const inventory=JSON.parse(fs.readFileSync(path.join(root,'systems/enterprise-admin/infrastructure/verification/admin-auth-handover/migration-constraints.json')));assert.equal(inventory.length,16);let checks=0,fks=0;for(const row of inventory){const bytes=fs.readFileSync(path.join(root,row.path));assert.equal(createHash('sha256').update(bytes).digest('hex'),row.sha256);const text=bytes.toString();assert.equal((text.match(/\bCHECK\s*\(/g)??[]).length,row.checks);assert.equal((text.match(/FOREIGN KEY/g)??[]).length,row.foreignKeys);checks+=row.checks;fks+=row.foreignKeys;}assert.equal(checks,12);assert.equal(fks,64);});
