import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const keyNames = ['tenantA', 'tenantB', 'tenantEmpty', 'supplierA', 'supplierA2', 'supplierB', 'categoryA', 'categoryB', 'productA', 'productA2', 'productLinked', 'productB', 'customerA', 'customerB', 'orderA', 'orderA2', 'orderB', 'itemA', 'itemA2', 'itemA3', 'itemLinked', 'itemForeign', 'itemB', 'batchA', 'receiptA', 'receiptForeign', 'expenseA', 'expenseB', 'readerA', 'readerB', 'readerEmpty', 'denied', 'inactive', 'roleA', 'roleB', 'roleEmpty', 'roleDenied', 'roleInactive'];
export const readerPeriod = '2026-01';
export const readerPermissionResources = ['reports', 'analytics', 'suppliers'];
export function buildReaderFixture(nonce) {
    assert.match(nonce, uuid);
    const ids = Object.fromEntries(keyNames.map(key => [key, randomUUID()]));
    const createdAt = new Date('2026-01-10T12:00:00Z');
    const fixture = { nonce, ids, period: readerPeriod, createdPermissions: [], ownershipProven: false,
        tenant: ['tenantA', 'tenantB', 'tenantEmpty'].map(key => ({ id: ids[key], slug: ids[key], name: `Synthetic reader ${key}`, plan: 'pro' })),
        supplier: [
            { id: ids.supplierA, tenantId: ids.tenantA, name: '合成同名供應商', contactName: '合成甲聯絡', deliveryReliability: null, defectRate: null },
            { id: ids.supplierA2, tenantId: ids.tenantA, name: '合成第二供應商', contactName: '合成乙聯絡', deliveryReliability: 90, defectRate: 2 },
            { id: ids.supplierB, tenantId: ids.tenantB, name: '合成同名供應商', contactName: 'FOREIGN_READER_CONTACT', deliveryReliability: 20, defectRate: 80 },
        ],
        productCategory: [
            { id: ids.categoryA, tenantId: ids.tenantA, name: '合成讀取分類' },
            { id: ids.categoryB, tenantId: ids.tenantB, name: 'FOREIGN_READER_CATEGORY' },
        ],
        product: [
            { id: ids.productA, tenantId: ids.tenantA, sku: 'READER-SAME-SKU', name: '合成讀取商品甲', costPrice: 1, retailPrice: 10, stockQuantity: 5, categoryId: ids.categoryA, supplierId: ids.supplierA },
            { id: ids.productA2, tenantId: ids.tenantA, sku: 'READER-SECOND', name: '合成讀取商品乙', costPrice: 3, retailPrice: 8, stockQuantity: 0, categoryId: ids.categoryA, supplierId: ids.supplierA2 },
            // Deliberately malformed legacy links permitted by the old simple FKs.
            // Read protection must not disclose these foreign category/supplier names.
            { id: ids.productLinked, tenantId: ids.tenantA, sku: 'READER-LEGACY-LINK', name: '合成未知關聯商品', costPrice: 1, retailPrice: 5, stockQuantity: 0, categoryId: ids.categoryB, supplierId: ids.supplierB },
            { id: ids.productB, tenantId: ids.tenantB, sku: 'READER-SAME-SKU', name: 'FOREIGN_READER_PRODUCT', costPrice: 900, retailPrice: 1000, stockQuantity: 0, categoryId: ids.categoryB, supplierId: ids.supplierB },
        ],
        customer: [{ id: ids.customerA, tenantId: ids.tenantA, name: 'Synthetic reader A' }, { id: ids.customerB, tenantId: ids.tenantB, name: 'Synthetic reader B' }],
        order: [
            { id: ids.orderA, tenantId: ids.tenantA, customerId: ids.customerA, orderNumber: `READER-${nonce}-A`, status: 'completed', totalAmount: 57, paymentStatus: 'paid', createdAt },
            { id: ids.orderA2, tenantId: ids.tenantA, customerId: ids.customerA, orderNumber: null, status: 'completed', totalAmount: 10, paymentStatus: 'paid', createdAt },
            { id: ids.orderB, tenantId: ids.tenantB, customerId: ids.customerB, orderNumber: `READER-${nonce}-B`, status: 'completed', totalAmount: 10000, paymentStatus: 'paid', createdAt },
        ],
        orderItem: [
            { id: ids.itemA, orderId: ids.orderA, productId: ids.productA, quantity: 2, unitPrice: 10 },
            { id: ids.itemA2, orderId: ids.orderA, productId: ids.productA2, quantity: 4, unitPrice: 8 },
            { id: ids.itemA3, orderId: ids.orderA2, productId: ids.productA, quantity: 1, unitPrice: 10 },
            { id: ids.itemLinked, orderId: ids.orderA, productId: ids.productLinked, quantity: 1, unitPrice: 5 },
            // Deliberately mixed-tenant old relation. No write API creates this row.
            { id: ids.itemForeign, orderId: ids.orderA, productId: ids.productB, quantity: 1, unitPrice: 7777 },
            { id: ids.itemB, orderId: ids.orderB, productId: ids.productB, quantity: 10, unitPrice: 1000 },
        ],
        productBatch: [{ id: ids.batchA, tenantId: ids.tenantA, productId: ids.productA, batchNumber: 'READER-RECEIPT', quantity: 5, status: 'QUARANTINE', costPrice: 1, expiryDate: new Date('2099-01-01T00:00:00Z') }],
        inventoryTransaction: [
            { id: ids.receiptA, tenantId: ids.tenantA, productId: ids.productA, batchId: ids.batchA, type: 'IN', quantity: 5, costPriceAtReceipt: 1, createdAt },
            // Unknown legacy receipt: nullable batch is retained, foreign product is excluded from estimates.
            { id: ids.receiptForeign, tenantId: ids.tenantA, productId: ids.productB, type: 'IN', quantity: 3, createdAt },
        ],
        expense: [{ id: ids.expenseA, tenantId: ids.tenantA, type: 'RENT', amount: 7, period: readerPeriod, description: '合成讀取支出' }, { id: ids.expenseB, tenantId: ids.tenantB, type: 'OTHER', amount: 999, period: readerPeriod, description: 'FOREIGN_READER_EXPENSE' }],
    };
    const actors = [['readerA', 'roleA', 'tenantA'], ['readerB', 'roleB', 'tenantB'], ['readerEmpty', 'roleEmpty', 'tenantEmpty'], ['denied', 'roleDenied', 'tenantA'], ['inactive', 'roleInactive', 'tenantA']];
    fixture.actors = actors.map(([user, role, tenant]) => ({ userId: ids[user], roleId: ids[role], tenantId: ids[tenant], key: user, grants: user === 'denied' ? [] : readerPermissionResources }));
    fixture.user = fixture.actors.map(actor => ({ id: actor.userId, tenantId: actor.tenantId, email: `${actor.userId}@reader.example.test`, fullName: '合成唯讀使用者', passwordHash: 'synthetic-non-login-placeholder', status: actor.key === 'inactive' ? 'suspended' : 'active' }));
    fixture.role = fixture.actors.map(actor => ({ id: actor.roleId, tenantId: actor.tenantId, name: `Synthetic reader ${actor.key}` }));
    assertReaderFixture(fixture);
    return fixture;
}
export function assertReaderFixture(f) {
    assert.match(f.nonce, uuid);
    assert.equal(f.period, readerPeriod);
    assert.deepEqual(Object.keys(f.ids).sort(), [...keyNames].sort());
    for (const value of Object.values(f.ids))
        assert.match(value, uuid);
    assert.equal(new Set(Object.values(f.ids)).size, keyNames.length);
    const modelKeys = { tenant: ['tenantA', 'tenantB', 'tenantEmpty'], supplier: ['supplierA', 'supplierA2', 'supplierB'], productCategory: ['categoryA', 'categoryB'], product: ['productA', 'productA2', 'productLinked', 'productB'], customer: ['customerA', 'customerB'], order: ['orderA', 'orderA2', 'orderB'], orderItem: ['itemA', 'itemA2', 'itemA3', 'itemLinked', 'itemForeign', 'itemB'], productBatch: ['batchA'], inventoryTransaction: ['receiptA', 'receiptForeign'], expense: ['expenseA', 'expenseB'], user: ['readerA', 'readerB', 'readerEmpty', 'denied', 'inactive'], role: ['roleA', 'roleB', 'roleEmpty', 'roleDenied', 'roleInactive'] };
    for (const [model, keys] of Object.entries(modelKeys))
        assert.deepEqual(f[model].map(row => row.id).sort(), keys.map(key => f.ids[key]).sort());
    const tenantIds = new Set(f.tenant.map(row => row.id));
    assert.deepEqual([...tenantIds].sort(), [f.ids.tenantA, f.ids.tenantB, f.ids.tenantEmpty].sort());
    for (const model of ['supplier', 'productCategory', 'product', 'customer', 'order', 'productBatch', 'inventoryTransaction', 'expense', 'user', 'role']) {
        for (const row of f[model]) {
            assert.match(row.id, uuid);
            assert.ok(tenantIds.has(row.tenantId));
        }
    }
    const products = new Map(f.product.map(row => [row.id, row]));
    const orders = new Map(f.order.map(row => [row.id, row]));
    const batches = new Map(f.productBatch.map(row => [row.id, row]));
    for (const row of f.orderItem) {
        assert.ok(orders.has(row.orderId));
        assert.ok(products.has(row.productId));
        assert.ok(Number.isInteger(row.quantity) && row.quantity > 0);
        if (row.id !== f.ids.itemForeign)
            assert.equal(orders.get(row.orderId).tenantId, products.get(row.productId).tenantId);
    }
    for (const row of f.inventoryTransaction) {
        assert.ok(products.has(row.productId));
        if (row.id !== f.ids.receiptForeign)
            assert.equal(products.get(row.productId).tenantId, row.tenantId);
        if (row.batchId !== undefined && row.batchId !== null) {
            const batch = batches.get(row.batchId);
            assert.ok(batch);
            assert.equal(batch.productId, row.productId);
            assert.equal(batch.tenantId, row.tenantId);
            assert.equal(row.type, 'IN');
            assert.ok(Number.isInteger(row.quantity) && row.quantity > 0);
            assert.ok(Number.isFinite(row.costPriceAtReceipt) && row.costPriceAtReceipt >= 0, 'receipt SQL CHECK requires a nonnegative cost snapshot');
        }
    }
    for (const row of f.order) {
        assert.equal(f.customer.find(customer => customer.id === row.customerId)?.tenantId, row.tenantId);
        assert.ok(Number.isFinite(row.totalAmount));
    }
    for (const row of f.product) {
        const supplier = f.supplier.find(s => s.id === row.supplierId), category = f.productCategory.find(c => c.id === row.categoryId);
        assert.ok(supplier && category);
        if (row.id !== f.ids.productLinked) {
            assert.equal(supplier.tenantId, row.tenantId);
            assert.equal(category.tenantId, row.tenantId);
        }
    }
    for (const actor of f.actors) {
        assert.equal(f.user.find(u => u.id === actor.userId)?.tenantId, actor.tenantId);
        assert.equal(f.role.find(r => r.id === actor.roleId)?.tenantId, actor.tenantId);
    }
    return true;
}
const createModels = ['tenant', 'supplier', 'productCategory', 'product', 'customer', 'order', 'orderItem', 'productBatch', 'inventoryTransaction', 'expense', 'user', 'role'];
export async function seedReaderFixture(db, f, recordStage) {
    assertReaderFixture(f);
    assert.equal(f.ownershipProven, false);
    recordStage('fixture absent-ID ownership');
    for (const model of createModels)
        assert.equal(await db[model].count({ where: { id: { in: f[model].map(row => row.id) } } }), 0);
    f.ownershipProven = true;
    for (const model of createModels) {
        recordStage(`fixture ${model}`);
        await db[model].createMany({ data: f[model] });
    }
    recordStage('fixture grants');
    for (const resource of readerPermissionResources) {
        let permission = await db.permission.findFirst({ where: { action: 'read', resource } });
        if (!permission) {
            const id = randomUUID();
            assert.equal(await db.permission.count({ where: { id } }), 0);
            f.createdPermissions.push(id);
            permission = await db.permission.create({ data: { id, action: 'read', resource, description: 'Owned synthetic reader acceptance' } });
        }
        for (const actor of f.actors.filter(row => row.grants.includes(resource)))
            await db.rolePermission.create({ data: { roleId: actor.roleId, permissionId: permission.id } });
    }
    for (const actor of f.actors)
        await db.userRole.create({ data: { userId: actor.userId, roleId: actor.roleId } });
}
export async function cleanupReaderFixture(db, f) {
    assertReaderFixture(f);
    assert.equal(f.ownershipProven, true, 'Reader fixture ownership is unproven');
    for (const id of f.createdPermissions)
        assert.match(id, uuid);
    const userIds = f.user.map(row => row.id), roleIds = f.role.map(row => row.id);
    await db.rolePermission.deleteMany({ where: { roleId: { in: roleIds } } });
    await db.userRole.deleteMany({ where: { userId: { in: userIds } } });
    for (const model of ['orderItem', 'inventoryTransaction', 'order', 'productBatch', 'product', 'expense', 'customer', 'supplier', 'productCategory', 'role', 'user', 'tenant']) {
        await db[model].deleteMany({ where: { id: { in: f[model].map(row => row.id) } } });
    }
    if (f.createdPermissions.length)
        await db.permission.deleteMany({ where: { id: { in: f.createdPermissions } } });
    const remaining = {};
    for (const model of createModels)
        remaining[model] = await db[model].count({ where: { id: { in: f[model].map(row => row.id) } } });
    remaining.rolePermission = await db.rolePermission.count({ where: { roleId: { in: roleIds } } });
    remaining.userRole = await db.userRole.count({ where: { userId: { in: userIds } } });
    remaining.permission = f.createdPermissions.length ? await db.permission.count({ where: { id: { in: f.createdPermissions } } }) : 0;
    assert.ok(Object.values(remaining).every(value => value === 0), 'Reader fixture cleanup left rows');
    return remaining;
}
