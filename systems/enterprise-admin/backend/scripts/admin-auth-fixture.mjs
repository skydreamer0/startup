import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const secrets = new WeakMap();
export const authActorKeys = ['allowed', 'denied', 'suspended'];
export const authPeriod = '2026-01';
export const authReadResources = ['dashboard', 'crm', 'analytics', 'reports'];
const ownedModels = ['tenant', 'user', 'role', 'expense'];
export async function buildAuthFixture(nonce, hashPassword) {
    assert.match(nonce, uuid);
    assert.equal(typeof hashPassword, 'function');
    const ids = Object.fromEntries(['tenant', 'expense', ...authActorKeys, ...authActorKeys.map(key => `${key}Role`)].map(key => [key, randomUUID()]));
    const f = { nonce, ids, ownershipProven: false, createdPermissions: [],
        tenant: [{ id: ids.tenant, slug: 'default', name: 'Synthetic Admin login tenant', plan: 'pro' }],
        role: authActorKeys.map(key => ({ id: ids[`${key}Role`], tenantId: ids.tenant, name: `Synthetic auth ${key} ${nonce}` })),
        user: authActorKeys.map(key => ({ id: ids[key], tenantId: ids.tenant, email: `${ids[key]}@auth.example.test`, fullName: `合成登入 ${key}`, status: key === 'suspended' ? 'suspended' : 'active' })),
        expense: [{ id: ids.expense, tenantId: ids.tenant, type: 'RENT', amount: 43, period: authPeriod, description: 'Synthetic auth read sentinel' }],
    };
    const credentials = new Map();
    for (const key of authActorKeys) {
        const password = randomBytes(32).toString('base64url');
        const passwordHash = await hashPassword(password);
        assert.match(passwordHash, /^\$argon2id\$v=19\$/);
        credentials.set(key, { password, passwordHash });
    }
    secrets.set(f, credentials);
    assertAuthFixture(f);
    return f;
}
export function authCredential(f, actor) {
    assert.ok(authActorKeys.includes(actor));
    const credential = secrets.get(f)?.get(actor);
    assert.ok(credential, 'Synthetic credential is not available');
    return { email: f.user.find(row => row.id === f.ids[actor]).email, ...credential };
}
export function assertAuthFixture(f) {
    assert.match(f.nonce, uuid);
    const values = Object.values(f.ids);
    assert.equal(values.length, 8); assert.equal(new Set(values).size, 8);
    values.forEach(value => assert.match(value, uuid));
    assert.deepEqual(f.tenant, [{ id: f.ids.tenant, slug: 'default', name: 'Synthetic Admin login tenant', plan: 'pro' }]);
    assert.equal(f.user.length, 3); assert.equal(f.role.length, 3);
    for (const key of authActorKeys) {
        const user = f.user.find(row => row.id === f.ids[key]);
        const role = f.role.find(row => row.id === f.ids[`${key}Role`]);
        assert.ok(user && role); assert.equal(user.tenantId, f.ids.tenant); assert.equal(role.tenantId, f.ids.tenant);
        assert.equal(user.email, `${user.id}@auth.example.test`); assert.equal(user.status, key === 'suspended' ? 'suspended' : 'active');
        assert.equal(Object.hasOwn(user, 'passwordHash'), false);
        const secret = authCredential(f, key); assert.ok(secret.password.length >= 40); assert.match(secret.passwordHash, /^\$argon2id\$v=19\$/);
    }
    assert.deepEqual(f.expense, [{ id: f.ids.expense, tenantId: f.ids.tenant, type: 'RENT', amount: 43, period: authPeriod, description: 'Synthetic auth read sentinel' }]);
    return true;
}
export async function seedAuthFixture(db, f, stage = () => {}) {
    assertAuthFixture(f); assert.equal(f.ownershipProven, false);
    stage('auth absent ownership');
    // Default resolution is existing product behavior, not a test header override.
    // A pre-existing default tenant aborts before acquiring cleanup ownership.
    assert.equal(await db.tenant.count({ where: { slug: 'default' } }), 0, 'Default tenant already exists');
    for (const model of ownedModels) assert.equal(await db[model].count({ where: { id: { in: f[model].map(row => row.id) } } }), 0);
    assert.equal(await db.user.count({ where: { email: { in: f.user.map(row => row.email) } } }), 0);
    f.ownershipProven = true;
    stage('auth tenant'); await db.tenant.createMany({ data: f.tenant });
    stage('auth users'); await db.user.createMany({ data: f.user.map(row => ({ ...row, passwordHash: authCredential(f, authActorKeys.find(key => f.ids[key] === row.id)).passwordHash })) });
    stage('auth roles'); await db.role.createMany({ data: f.role });
    stage('auth expense'); await db.expense.createMany({ data: f.expense });
    stage('auth persisted grant');
    for (const resource of authReadResources) {
        let permission = await db.permission.findFirst({ where: { action: 'read', resource } });
        if (!permission) {
            const id = randomUUID(); assert.equal(await db.permission.count({ where: { id } }), 0);
            f.createdPermissions.push(id);
            permission = await db.permission.create({ data: { id, action: 'read', resource, description: 'Owned synthetic Admin authentication acceptance' } });
        }
        for (const key of resource === 'reports' ? ['allowed'] : ['allowed', 'denied'])
            await db.rolePermission.create({ data: { roleId: f.ids[`${key}Role`], permissionId: permission.id } });
    }
    for (const key of authActorKeys) await db.userRole.create({ data: { userId: f.ids[key], roleId: f.ids[`${key}Role`] } });
}
export async function cleanupAuthFixture(db, f) {
    assertAuthFixture(f); assert.equal(f.ownershipProven, true, 'Auth fixture ownership is unproven');
    f.createdPermissions.forEach(id => assert.match(id, uuid));
    const userIds = f.user.map(row => row.id), roleIds = f.role.map(row => row.id);
    // Restrict every deletion to these absent-before IDs, including auth's only allowed new audit rows.
    await db.auditLog.deleteMany({ where: { tenantId: f.ids.tenant, userId: { in: userIds } } });
    await db.rolePermission.deleteMany({ where: { roleId: { in: roleIds } } });
    await db.userRole.deleteMany({ where: { userId: { in: userIds } } });
    for (const model of ['expense', 'role', 'user', 'tenant']) await db[model].deleteMany({ where: { id: { in: f[model].map(row => row.id) } } });
    if (f.createdPermissions.length) await db.permission.deleteMany({ where: { id: { in: f.createdPermissions } } });
    const remaining = {};
    for (const model of ownedModels) remaining[model] = await db[model].count({ where: { id: { in: f[model].map(row => row.id) } } });
    remaining.auditLog = await db.auditLog.count({ where: { tenantId: f.ids.tenant } });
    remaining.rolePermission = await db.rolePermission.count({ where: { roleId: { in: roleIds } } });
    remaining.userRole = await db.userRole.count({ where: { userId: { in: userIds } } });
    remaining.permission = f.createdPermissions.length ? await db.permission.count({ where: { id: { in: f.createdPermissions } } }) : 0;
    assert.ok(Object.values(remaining).every(value => value === 0), 'Auth fixture cleanup is incomplete');
    return remaining;
}

// Snapshots stay in memory until explicit redaction; neither credentials nor hashes are evidence.
export function redactAuthSnapshot(snapshot) {
    const out = structuredClone(snapshot);
    for (const row of out.users ?? []) { if (Object.hasOwn(row, 'password_hash')) row.password_hash = '[REDACTED]'; if (Object.hasOwn(row, 'totp_secret')) row.totp_secret = '[REDACTED]'; }
    return out;
}
export function assertAuthMutationScope(before, after, f) {
    assert.equal(Object.keys(before).length, 33); assert.deepEqual(Object.keys(after).sort(), Object.keys(before).sort());
    const ownedUsers = new Set(f.user.map(row => row.id));
    const beforeUsers = new Map(before.users.map(row => [row.id, row]));
    assert.equal(after.users.length, before.users.length);
    const authUserChanges = [];
    for (const user of after.users) {
        const old = beforeUsers.get(user.id); assert.ok(old);
        if (!ownedUsers.has(user.id) || user.id === f.ids.suspended) { assert.deepEqual(user, old); continue; }
        const stable = row => Object.fromEntries(Object.entries(row).filter(([key]) => !['last_login_at', 'failed_login_attempts', 'updated_at'].includes(key)));
        assert.deepEqual(stable(user), stable(old)); // Includes exact password hash and TOTP equality, without serializing either.
        assert.ok(Number.isInteger(user.failed_login_attempts) && user.failed_login_attempts >= 0);
        for (const name of ['last_login_at', 'updated_at']) if (user[name] !== old[name]) assert.ok(Number.isFinite(Date.parse(user[name])) && Date.parse(user[name]) >= Date.parse(old[name] ?? '1970-01-01'));
        authUserChanges.push({ id: user.id, lastLoginChanged: user.last_login_at !== old.last_login_at, failedLoginAttempts: user.failed_login_attempts });
    }
    const oldAudit = new Map(before.audit_logs.map(row => [row.id, row]));
    const afterAudit = new Map(after.audit_logs.map(row => [row.id, row]));
    assert.equal(afterAudit.size, after.audit_logs.length);
    for (const [id, row] of oldAudit) assert.deepEqual(afterAudit.get(id), row);
    const auditAdded = after.audit_logs.filter(row => !oldAudit.has(row.id));
    for (const row of auditAdded) {
        assert.equal(row.tenant_id, f.ids.tenant); assert.ok(ownedUsers.has(row.user_id)); assert.notEqual(row.user_id, f.ids.suspended);
        assert.ok(['LOGIN', 'LOGOUT'].includes(row.action)); assert.equal(row.resource_type, 'users'); assert.equal(row.resource_id, row.user_id);
        assert.equal(row.old_value, null); assert.equal(row.new_value, null);
    }
    for (const table of Object.keys(before).filter(table => !['users', 'audit_logs'].includes(table))) assert.ok(isDeepStrictEqual(before[table], after[table]), `Unexpected auth side effect in ${table}`);
    return { businessTablesUnchanged: 31, authUserChanges, auditAdded: auditAdded.map(row => ({ id: row.id, userId: row.user_id, action: row.action })) };
}
export function assertAuthAuditMatchesResponses(mutations, responses, f) {
    const counts = rows => rows.reduce((out,row)=>{const key=`${row.userId}/${row.action}`;out[key]=(out[key]??0)+1;return out;},{});
    const expected=responses.filter(row=>row.status===200&&['/auth/login','/auth/logout'].includes(row.endpoint)).map(row=>({userId:f.ids[row.actor],action:row.endpoint==='/auth/login'?'LOGIN':'LOGOUT'}));
    assert.deepEqual(counts(mutations.auditAdded),counts(expected),'Actual auth responses must match exactly the owned audit additions');
    for(const row of mutations.authUserChanges){assert.equal(row.failedLoginAttempts,0);assert.equal(row.lastLoginChanged,true);}
    return {auditResponsesMatched:true,auditCount:expected.length};
}
