import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildReaderFixture, assertReaderFixture, seedReaderFixture, cleanupReaderFixture } from './admin-readers-fixture.mjs';
function memoryDatabase({ collision, seedFailure, deleteFailure, remainder } = {}) {
    const calls = [], rows = new Map();
    const models = ['tenant', 'supplier', 'productCategory', 'product', 'customer', 'order', 'orderItem', 'productBatch', 'inventoryTransaction', 'expense', 'user', 'role', 'rolePermission', 'userRole', 'permission'];
    const db = Object.fromEntries(models.map(model => {
        rows.set(model, []);
        const match = (row, where) => Object.entries(where).every(([key, value]) => value && typeof value === 'object' && 'in' in value ? value.in.includes(row[key]) : row[key] === value);
        return [model, {
                async count({ where }) { calls.push({ model, op: 'count', where }); if (model === collision && !calls.some(call => call.op === 'createMany'))
                    return 1; if (model === remainder && calls.some(call => call.op === 'deleteMany'))
                    return 1; return rows.get(model).filter(row => match(row, where)).length; },
                async createMany({ data }) { calls.push({ model, op: 'createMany', data }); if (model === seedFailure)
                    throw new Error('synthetic fixture seed failure'); rows.get(model).push(...data); return { count: data.length }; },
                async create({ data }) { calls.push({ model, op: 'create', data }); rows.get(model).push(data); return data; },
                async findFirst({ where }) { return rows.get(model).find(row => match(row, where)) ?? null; },
                async deleteMany({ where }) { assert.ok(where && Object.keys(where).length); calls.push({ model, op: 'deleteMany', where }); if (model === deleteFailure)
                    throw new Error('synthetic fixture deletion failure'); const before = rows.get(model); rows.set(model, before.filter(row => !match(row, where))); return { count: before.length - rows.get(model).length }; },
            }];
    }));
    return { db, calls, rows };
}
test('the actual fixture preserves receipt SQL CHECK and composite FKs', () => {
    const f = buildReaderFixture(randomUUID());
    assert.equal(assertReaderFixture(f), true);
    assert.equal(f.inventoryTransaction.find(row => row.batchId).costPriceAtReceipt, 1);
    const migration = fs.readFileSync(new URL('../prisma/migrations/20261006100000_atomic_batch_receipts/migration.sql', import.meta.url), 'utf8');
    assert.match(migration, /"cost_price_at_receipt" IS NOT NULL/);
    assert.match(migration, /"cost_price_at_receipt" >= 0/);
    assert.match(migration, /FOREIGN KEY \("batch_id", "product_id", "tenant_id"\)/);
});
for (const mutation of [
    f => { delete f.inventoryTransaction[0].costPriceAtReceipt; },
    f => { f.inventoryTransaction[0].costPriceAtReceipt = -1; },
    f => { f.inventoryTransaction[0].costPriceAtReceipt = Number.NaN; },
    f => { f.inventoryTransaction[0].quantity = 0; },
    f => { f.inventoryTransaction[0].type = 'OUT'; },
    f => { f.inventoryTransaction[0].tenantId = f.ids.tenantB; },
    f => { f.inventoryTransaction[0].productId = f.ids.productB; },
    f => { f.order[0].customerId = f.ids.customerB; },
    f => { f.product[0].supplierId = f.ids.supplierB; },
    f => { f.product[0].categoryId = f.ids.categoryB; },
    f => { f.product[0].id = randomUUID(); },
])
    test('actual seed data rejects invalid cost/FK or unowned identity: ' + mutation.toString(), () => {
        const f = buildReaderFixture(randomUUID());
        mutation(f);
        assert.throws(() => assertReaderFixture(f));
    });
test('fixture proves absent IDs before any insert and cleans only exact newly owned IDs', async () => {
    const f = buildReaderFixture(randomUUID()), { db, calls, rows } = memoryDatabase();
    const otherId = randomUUID();
    rows.get('permission').push({ id: otherId, action: 'read', resource: 'suppliers' });
    await seedReaderFixture(db, f, () => { });
    assert.equal(f.ownershipProven, true);
    assert.equal(calls.findIndex(call => call.op === 'createMany'), 12);
    assert.equal(f.createdPermissions.length, 2);
    assert.ok(Object.values(await cleanupReaderFixture(db, f)).every(value => value === 0));
    assert.deepEqual(rows.get('permission').map(row => row.id), [otherId]);
    assert.ok(calls.filter(call => call.op === 'deleteMany').every(call => Object.values(call.where).every(value => Array.isArray(value.in) && value.in.length > 0)));
});
test('existing ID collision cannot become cleanup authority', async () => {
    const f = buildReaderFixture(randomUUID()), { db, calls } = memoryDatabase({ collision: 'product' });
    await assert.rejects(seedReaderFixture(db, f, () => { }));
    assert.equal(f.ownershipProven, false);
    await assert.rejects(cleanupReaderFixture(db, f));
    assert.equal(calls.some(call => ['createMany', 'deleteMany'].includes(call.op)), false);
});
test('partial seed failure still allows exact-owned cleanup and preserves failure', async () => {
    const f = buildReaderFixture(randomUUID()), { db } = memoryDatabase({ seedFailure: 'inventoryTransaction' });
    await assert.rejects(seedReaderFixture(db, f, () => { }), /seed failure/);
    assert.equal(f.ownershipProven, true);
    assert.ok(Object.values(await cleanupReaderFixture(db, f)).every(value => value === 0));
});
test('a failed deletion cannot report cleanup success', async () => {
    const f = buildReaderFixture(randomUUID()), { db } = memoryDatabase({ deleteFailure: 'product' });
    await seedReaderFixture(db, f, () => { });
    await assert.rejects(cleanupReaderFixture(db, f), /deletion failure/);
});
test('a nonzero remainder cannot report cleanup success', async () => {
    const f = buildReaderFixture(randomUUID()), { db } = memoryDatabase({ remainder: 'orderItem' });
    await seedReaderFixture(db, f, () => { });
    await assert.rejects(cleanupReaderFixture(db, f), /left rows/);
});
test('constraint review inventory records every current migration byte', () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../prisma/migrations');
    const migrations = fs.readdirSync(root).filter(name => fs.statSync(path.join(root, name)).isDirectory()).sort().map(name => ({ path: `${name}/migration.sql`, sha256: createHash('sha256').update(fs.readFileSync(path.join(root, name, 'migration.sql'))).digest('hex') }));
    assert.ok(migrations.length >= 16);
    assert.ok(migrations.some(row => row.path.includes('private_receiving_drafts')));
});
test('fixture supplies all required Prisma scalar inputs and retains exact full migration inventory', () => {
    const f = buildReaderFixture(randomUUID());
    const schema = fs.readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
    for (const model of ['Tenant', 'Supplier', 'ProductCategory', 'Product', 'Customer', 'Order', 'OrderItem', 'ProductBatch', 'InventoryTransaction', 'Expense', 'User', 'Role']) {
        const body = schema.match(new RegExp(`model ${model} \\{([\\s\\S]*?)\\n\\}`))?.[1];
        assert.ok(body);
        const required = body.split('\n').map(line => line.trim()).filter(line => /^[A-Za-z]\w*\s+(String|Int|Float|Decimal|Boolean|DateTime|Json)\s/.test(line) && !/@default|@updatedAt/.test(line)).map(line => line.split(/\s+/)[0]);
        for (const row of f[model[0].toLowerCase() + model.slice(1)])
            for (const field of required)
                assert.ok(row[field] !== undefined && row[field] !== null, `${model}.${field} required`);
    }
    const inventory = JSON.parse(fs.readFileSync(new URL('../../infrastructure/verification/admin-readers-native/migration-constraints.json', import.meta.url), 'utf8'));
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../prisma/migrations');
    const names = fs.readdirSync(root).filter(name => fs.statSync(path.join(root, name)).isDirectory()).sort();
    assert.equal(inventory.length, names.length);
    for (const [index, name] of names.entries()) {
        assert.ok(inventory[index].path.endsWith(`/${name}/migration.sql`));
        assert.equal(inventory[index].sha256, createHash('sha256').update(fs.readFileSync(path.join(root, name, 'migration.sql'))).digest('hex'));
    }
});
