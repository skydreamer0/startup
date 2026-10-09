import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { PrismaClient, type Prisma } from '@prisma/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// BEGIN inventory provenance opt-in guard.
// Explicit opt-in only. No ambient DATABASE_URL, external server, schema override,
// password, reused nonempty database, or automatic dependency installation.
const databaseUrl = process.env.INVENTORY_PROVENANCE_DATABASE_URL;
const embeddedPath = process.env.INVENTORY_PROVENANCE_PGLITE_PATH;
if (databaseUrl && embeddedPath) throw new Error('Select native PostgreSQL OR embedded PGlite');
if (databaseUrl) {
  const url = new URL(databaseUrl);
  const ownedSkuUrl = 'postgresql://test@127.0.0.1:55435/checkout_http_recovery_pos_lookup_ci';
  const ownedSkuFixture = databaseUrl === ownedSkuUrl;
  if (url.protocol !== 'postgresql:' || url.hostname !== '127.0.0.1' || !url.port
    || url.username !== 'test' || url.password || url.search || url.hash
    || (!ownedSkuFixture && !/^\/checkout_http_recovery_inventory_provenance_[a-z0-9_]+$/.test(url.pathname))
    || process.env.DATABASE_URL !== databaseUrl
    || process.env.INVENTORY_PROVENANCE_ALLOW_SYNTHETIC !== '1') {
    throw new Error('Inventory provenance requires an explicit empty owned synthetic loopback database');
  }
  if (ownedSkuFixture) {
    const env = process.env;
    if (env.NODE_ENV !== 'test' || env.POS_PRODUCT_LOOKUP_DATABASE_URL !== ownedSkuUrl
      || env.GITHUB_ACTIONS !== 'true' || env.RUNNER_ENVIRONMENT !== 'github-hosted'
      || !path.isAbsolute(env.RUNNER_TEMP || '') || !/^\d+$/.test(env.GITHUB_RUN_ID || '')
      || !/^\d+$/.test(env.GITHUB_RUN_ATTEMPT || '') || !/^[a-f0-9]{40}$/.test(env.SKU_QA_HEAD || '')
      || !/^[a-f0-9]{64}$/.test(env.SKU_QA_CONTAINER || '')
      || !/^github_network_[a-f0-9]+$/.test(env.SKU_QA_NETWORK || '')) {
      throw new Error('Inventory provenance requires the existing owned SKU Actions fixture');
    }
    const proofFile = path.join(env.RUNNER_TEMP!, `sku-qa-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}`, 'ownership.json');
    if (env.INVENTORY_PROVENANCE_OWNERSHIP_FILE !== proofFile) throw new Error('Inventory provenance ownership path mismatch');
    const proof = JSON.parse(readFileSync(proofFile, 'utf8'));
    const git = (ref: string) => execFileSync('git', ['rev-parse', ref], { cwd: path.resolve(__dirname, '../../../../..'), encoding: 'utf8' }).trim();
    if (proof.head !== env.SKU_QA_HEAD || proof.head !== git('HEAD') || proof.tree !== git('HEAD^{tree}')
      || proof.runId !== env.GITHUB_RUN_ID || proof.attempt !== env.GITHUB_RUN_ATTEMPT
      || proof.database !== 'checkout_http_recovery_pos_lookup_ci' || proof.node !== process.version
      || proof.syntheticOnly !== true || !Array.isArray(proof.initialPublicTables) || proof.initialPublicTables.length !== 0
      || proof.service?.container !== env.SKU_QA_CONTAINER || proof.service?.network !== env.SKU_QA_NETWORK
      || JSON.stringify(proof.service?.bindings) !== JSON.stringify({ '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '55435' }] })) {
      throw new Error('Inventory provenance ownership identity mismatch');
    }
  }
}
if (embeddedPath && !path.isAbsolute(embeddedPath)) throw new Error('Existing PGlite module path must be absolute');
// END inventory provenance opt-in guard.

type Row = { section: string; tenant_id: string; product_id: string; record_id: string; details: Record<string, unknown> };
type Embedded = {
  query<T>(sql: string): Promise<{ rows: T[] }>;
  exec(sql: string): Promise<unknown>;
  close(): Promise<void>;
};
const diagnostic = readFileSync(path.resolve(__dirname, '../../prisma/diagnostics/preflight-inventory-provenance.sql'), 'utf8');
const migrations = path.resolve(__dirname, '../../prisma/migrations');
const engine = databaseUrl ? 'native PostgreSQL' : embeddedPath ? 'embedded PGlite (NOT native PostgreSQL)' : 'NOT RUN: no explicit SQL engine';

describe.skipIf(!databaseUrl && !embeddedPath)(`Inventory provenance exact SQL: ${engine}`, () => {
  let native: PrismaClient | undefined;
  let embedded: Embedded | undefined;
  let tenant: string;
  const ownedTenants: string[] = [];
  const quote = (value: string | number) => `'${String(value).replace(/'/g, "''")}'`;
  const sql = async <T = Record<string, unknown>>(statement: string): Promise<T[]> => native
    ? native.$queryRawUnsafe<T[]>(statement) : (await embedded!.query<T>(statement)).rows;
  const insert = async (table: string, fields: Record<string, string | number>) => {
    const id = randomUUID();
    await sql(`INSERT INTO ${table} (id, ${Object.keys(fields).join(', ')}) VALUES (${quote(id)}, ${Object.values(fields).map(quote).join(', ')}) RETURNING id`);
    return id;
  };
  const createTenant = async () => {
    const id = await insert('tenants', { name: 'Synthetic provenance', slug: randomUUID() });
    ownedTenants.push(id);
    return id;
  };
  const product = (stock = 0, tenantId = tenant) => insert('products', {
    tenant_id: tenantId, sku: 'SAME-SKU', name: 'Synthetic product', stock_quantity: stock,
    cost_price: 1, retail_price: 2, updated_at: '2026-10-09',
  });
  const batch = (productId: string, quantity: number, status = 'QUARANTINE', expiry = '2099-01-01', tenantId = tenant) => insert('product_batches', {
    tenant_id: tenantId, product_id: productId, batch_number: randomUUID(), quantity, status, expiry_date: expiry, cost_price: 1,
  });
  const movement = (productId: string, type: string, quantity: number, fields: Record<string, string | number> = {}) => insert('inventory_transactions', {
    tenant_id: tenant, product_id: productId, type, quantity, ...fields,
  });
  const receipt = (productId: string, batchId: string, quantity: number) => movement(productId, 'IN', quantity, {
    batch_id: batchId, reference_id: batchId, cost_price_at_receipt: 1,
  });
  const orderItem = async (productId: string, quantity: number, tenantId = tenant) => {
    const customerId = await insert('customers', { tenant_id: tenantId, updated_at: '2026-10-09' });
    const orderId = await insert('orders', {
      tenant_id: tenantId, customer_id: customerId, total_amount: 1, status: 'completed', updated_at: '2026-10-09',
    });
    const itemId = await insert('order_items', { order_id: orderId, product_id: productId, quantity, unit_price: 1 });
    return { orderId, itemId };
  };
  const allocation = (productId: string, batchId: string, movementId: string, item: { orderId: string; itemId: string }, quantity: number) => insert('sale_batch_allocations', {
    tenant_id: tenant, product_id: productId, batch_id: batchId, movement_id: movementId,
    order_id: item.orderId, order_item_id: item.itemId, quantity, expiry_date_at_sale: '2099-01-01',
  });
  const setupReadOnly = async (tx: Prisma.TransactionClient) => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '30s'");
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '5s'");
  };
  const report = async (): Promise<Row[]> => {
    if (native) return native.$transaction(async (tx) => {
      await setupReadOnly(tx);
      return tx.$queryRawUnsafe<Row[]>(diagnostic);
    }, { isolationLevel: 'RepeatableRead', timeout: 35000 });
    await embedded!.exec("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL statement_timeout = '30s'; SET LOCAL lock_timeout = '5s';");
    try { return (await embedded!.query<Row>(diagnostic)).rows; }
    finally { await embedded!.exec('ROLLBACK'); }
  };
  const row = (rows: Row[], section: string, id: string) => {
    const found = rows.filter(r => r.section === section && r.record_id === id);
    expect(found).toHaveLength(1);
    return found[0].details;
  };
  const fingerprint = async () => {
    const tables = await sql<{ tablename: string }>("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename");
    return Promise.all(tables.map(async ({ tablename }) => {
      if (!/^[a-z_]+$/.test(tablename)) throw new Error('Unexpected table name');
      return [tablename, await sql(`SELECT to_jsonb(t)::text AS row FROM "${tablename}" t ORDER BY to_jsonb(t)::text COLLATE "C"`)];
    }));
  };

  beforeAll(async () => {
    if (embeddedPath) {
      const { PGlite } = createRequire(__filename)(embeddedPath) as { PGlite: new () => Embedded };
      embedded = new PGlite(); // New in-memory database only. No file-backed store.
      for (const directory of readdirSync(migrations).sort()) {
        const file = path.join(migrations, directory, 'migration.sql');
        if (existsSync(file)) await embedded.exec(readFileSync(file, 'utf8'));
      }
    } else {
      native = new PrismaClient({ datasources: { db: { url: databaseUrl! } } });
      const applied = await sql<{ migration_name: string }>('SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name');
      expect(applied.map(r => r.migration_name)).toEqual(readdirSync(migrations).filter(d => existsSync(path.join(migrations, d, 'migration.sql'))).sort());
      const tables = await sql<{ tablename: string }>("SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'");
      for (const { tablename } of tables) {
        if (!/^[a-z_]+$/.test(tablename)) throw new Error('Unexpected table name');
        expect(await sql(`SELECT count(*)::text AS count FROM "${tablename}"`)).toEqual([{ count: '0' }]);
      }
    }
    console.info('SQL engine identity:', engine, await sql('SELECT version() AS version'));
  }, 30000);
  beforeEach(async () => { tenant = await createTenant(); });
  afterEach(async () => {
    if (!ownedTenants.length) return;
    const ids = ownedTenants.map(quote).join(', ');
    // Delete across all owned tenants per table so malformed legacy cross-tenant
    // links are removed before their referenced products. Never touch other rows.
    for (const table of ['checkout_commands', 'order_number_counters', 'sale_batch_allocations', 'inventory_transactions', 'orders', 'product_batches', 'products', 'shifts', 'customers', 'users', 'tenants']) {
      const column = table === 'tenants' ? 'id' : 'tenant_id';
      await sql(`DELETE FROM ${table} WHERE ${column} IN (${ids}) RETURNING ${column}`);
    }
    ownedTenants.length = 0;
  });
  afterAll(async () => {
    try {
      if (!native && !embedded) return;
      const tables = await sql<{ tablename: string }>("SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' ORDER BY tablename");
      for (const { tablename } of tables) {
        if (!/^[a-z_]+$/.test(tablename)) throw new Error('Unexpected table name');
        expect(await sql(`SELECT count(*)::text AS count FROM "${tablename}"`)).toEqual([{ count: '0' }]);
      }
      console.info(`Synthetic cleanup: ${tables.length} business tables contain zero rows`);
    } finally {
      await native?.$disconnect();
      await embedded?.close();
    }
  });

  it('returns no invented inventory rows for an empty tenant', async () => {
    expect(await report()).toEqual([]);
  });

  it('flags order quantity mismatch even when OUT and its allocation are balanced', async () => {
    const p = await product(); const b = await batch(p, 0);
    const item = await orderItem(p, 3); const out = await movement(p, 'OUT', 2, { reference_id: item.orderId });
    await allocation(p, b, out, item, 2);
    const rows = await report();
    expect(row(rows, 'movement', out)).toMatchObject({ out_allocation_difference: '0', issues: [] });
    expect(row(rows, 'order_item', item.itemId)).toMatchObject({ difference: '1', issues: ['ORDER_ITEM_ALLOCATION_QUANTITY_MISMATCH'] });
  });

  it('reports two linked receipt lots, a split sale and unchanged stock after a money-only refund state', async () => {
    const p = await product(1);
    const a = await batch(p, 0, 'RELEASED'); const b = await batch(p, 1, 'RELEASED');
    const inA = await receipt(p, a, 3); const inB = await receipt(p, b, 2);
    const item = await orderItem(p, 4); const out = await movement(p, 'OUT', 4, { reference_id: item.orderId });
    await allocation(p, a, out, item, 3); await allocation(p, b, out, item, 1);
    const before = await report();
    expect(row(before, 'product', p)).toMatchObject({ product_quantity: '1', batch_quantity: '1', difference: '0', history_status: 'UNKNOWN_NO_VERIFIED_OPENING_BASELINE' });
    expect(row(before, 'movement', out)).toMatchObject({ allocated_quantity: '4', out_allocation_difference: '0', issues: [] });
    expect(row(before, 'batch', a)).toMatchObject({ linked_in_quantity: '3', linked_sale_quantity: '3', difference_from_linked_evidence: '0' });
    expect(row(before, 'batch', b)).toMatchObject({ linked_in_quantity: '2', linked_sale_quantity: '1', difference_from_linked_evidence: '0' });
    await sql(`UPDATE orders SET status = 'refunded' WHERE id = ${quote(item.orderId)} RETURNING id`);
    const after = await report();
    expect(after.filter(r => r.section !== 'order_item')).toEqual(before.filter(r => r.section !== 'order_item'));
    expect(row(after, 'order_item', item.itemId).order_status).toBe('refunded');
    expect(after.filter(r => r.section === 'movement' && r.details.type === 'IN').map(r => r.record_id).sort()).toEqual([inA, inB].sort());
  });

  it('retains legacy product 9 versus batch 4 as difference 5 and unknown receipt source', async () => {
    const p = await product(9); const b = await batch(p, 4);
    const rows = await report();
    expect(row(rows, 'product', p)).toMatchObject({ product_quantity: '9', batch_quantity: '4', difference: '5' });
    expect(row(rows, 'batch', b).issues).toContain('UNKNOWN_RECEIPT_SOURCE');
    expect(rows.some(r => r.section === 'movement')).toBe(false);
  });

  it('never calls equal source-less balances historically reconciled', async () => {
    const p = await product(4); const b = await batch(p, 4);
    const rows = await report();
    expect(row(rows, 'product', p)).toMatchObject({ difference: '0', quantity_status: 'CURRENT_QUANTITIES_EQUAL_HISTORY_UNVERIFIED', history_status: 'UNKNOWN_NO_VERIFIED_OPENING_BASELINE' });
    expect(row(rows, 'batch', b).issues).toContain('UNKNOWN_RECEIPT_SOURCE');
  });

  it('includes released, quarantined, blocked, expired and zero-quantity lots in physical totals', async () => {
    const p = await product(10);
    await batch(p, 1, 'RELEASED'); await batch(p, 2, 'QUARANTINE'); await batch(p, 3, 'BLOCKED');
    await batch(p, 4, 'RELEASED', '2000-01-01'); await batch(p, 0);
    const rows = await report();
    expect(row(rows, 'product', p)).toMatchObject({ batch_quantity: '10', batch_count: '5', difference: '0' });
    expect(rows.filter(r => r.section === 'batch')).toHaveLength(5);
  });

  it('keeps identical SKUs and malformed legacy links isolated by tenant', async () => {
    const p = await product(2); await batch(p, 2);
    const second = await createTenant(); const other = await product(8, second); await batch(other, 8, 'BLOCKED', '2000-01-01', second);
    const wrongBatch = await batch(p, 99, 'QUARANTINE', '2099-01-01', second);
    const wrongMovement = await movement(p, 'OUT', 99, { tenant_id: second });
    const wrongItem = await orderItem(p, 99, second);
    const rows = await report();
    expect(row(rows, 'product', p)).toMatchObject({ batch_quantity: '2', difference: '0' });
    expect(row(rows, 'product', other)).toMatchObject({ batch_quantity: '8', difference: '0' });
    for (const [section, id] of [['batch', wrongBatch], ['movement', wrongMovement], ['order_item', wrongItem.itemId]]) {
      expect(row(rows, section, id).issues).toContain('PRODUCT_TENANT_LINK_MISSING');
      expect(rows.find(r => r.record_id === id)?.tenant_id).toBe(second);
    }
  });

  it('preaggregates multiple receipts and multiple sales without join multiplication', async () => {
    const p = await product(5); const b = await batch(p, 5);
    await receipt(p, b, 4); await receipt(p, b, 6);
    for (const quantity of [2, 3]) {
      const item = await orderItem(p, quantity); const out = await movement(p, 'OUT', quantity, { reference_id: item.orderId });
      await allocation(p, b, out, item, quantity);
    }
    expect(row(await report(), 'batch', b)).toMatchObject({ linked_in_quantity: '10', linked_in_count: '2', linked_sale_quantity: '5', linked_sale_count: '2', difference_from_linked_evidence: '0' });
  });

  it('shows zero products, stock without batches, unlinked IN, old OUT and old order items', async () => {
    const p = await product();
    expect(row(await report(), 'product', p)).toMatchObject({ batch_quantity: '0', batch_count: '0', difference: '0' });
    await sql(`UPDATE products SET stock_quantity = 5 WHERE id = ${quote(p)} RETURNING id`);
    const incoming = await movement(p, 'IN', 5); const outgoing = await movement(p, 'OUT', 2);
    const item = await orderItem(p, 2); const rows = await report();
    expect(row(rows, 'product', p).issues).toContain('STOCK_WITHOUT_BATCH');
    expect(row(rows, 'movement', incoming).issues).toContain('UNKNOWN_RECEIPT_SOURCE');
    expect(row(rows, 'movement', outgoing).issues).toEqual(expect.arrayContaining(['UNKNOWN_ORDER_SOURCE', 'UNKNOWN_SALE_ALLOCATION', 'OUT_ALLOCATION_QUANTITY_MISMATCH']));
    expect(row(rows, 'order_item', item.itemId).issues).toContain('UNKNOWN_ORDER_ITEM_ALLOCATION');
  });

  it.each([1, 3])('reports missing or excess allocation quantity %i against OUT and order quantity 2', async (allocated) => {
    const p = await product(); const b = await batch(p, 0);
    const item = await orderItem(p, 2); const out = await movement(p, 'OUT', 2, { reference_id: item.orderId });
    await allocation(p, b, out, item, allocated);
    const rows = await report();
    expect(row(rows, 'movement', out)).toMatchObject({ allocated_quantity: String(allocated), out_allocation_difference: String(2 - allocated) });
    expect(row(rows, 'movement', out).issues).toContain('OUT_ALLOCATION_QUANTITY_MISMATCH');
    expect(row(rows, 'order_item', item.itemId).issues).toContain('ORDER_ITEM_ALLOCATION_QUANTITY_MISMATCH');
  });

  it.each(['IN', 'OUT'])('excludes allocations with invalid %s provenance from linked batch evidence', async (type) => {
    const p = await product(); const b = await batch(p, 0); const item = await orderItem(p, 2);
    const m = await movement(p, type, 2, { reference_id: randomUUID() });
    const a = await allocation(p, b, m, item, 2); const rows = await report();
    expect(row(rows, 'allocation', a)).toMatchObject({ source_linked: false, issues: ['UNLINKED_SALE_ALLOCATION'] });
    expect(row(rows, 'batch', b)).toMatchObject({ linked_sale_quantity: '0', unlinked_allocation_count: '1' });
    expect(row(rows, 'movement', m).issues).toContain('UNLINKED_SALE_ALLOCATION');
  });

  it('retains unsupported types including ADJUSTMENT without assigning a direction', async () => {
    const p = await product();
    for (const type of ['ADJUSTMENT', 'TRANSFER', 'mystery']) {
      const id = await movement(p, type, 7); const details = row(await report(), 'movement', id);
      expect(details).toMatchObject({ type, quantity: '7', out_allocation_difference: null });
      expect(details.issues).toContain('UNKNOWN_UNSUPPORTED_MOVEMENT_TYPE');
    }
  });

  it('reports negative balances and nonpositive legacy movements without hiding them', async () => {
    const p = await product(-3); const b = await batch(p, -2);
    const m = await movement(p, 'OUT', -1); const zero = await movement(p, 'IN', 0);
    const rows = await report();
    expect(row(rows, 'product', p).issues).toEqual(expect.arrayContaining(['NEGATIVE_PRODUCT_QUANTITY', 'NEGATIVE_BATCH_QUANTITY']));
    expect(row(rows, 'batch', b).issues).toContain('NEGATIVE_BATCH_QUANTITY');
    for (const id of [m, zero]) expect(row(rows, 'movement', id).issues).toContain('NONPOSITIVE_MOVEMENT_QUANTITY');
  });

  it('uses exact numeric sums and subtraction beyond signed 32-bit limits', async () => {
    const p = await product(-2147483648);
    const b = await batch(p, 2147483647); await batch(p, 2147483647);
    await receipt(p, b, 2147483647); await receipt(p, b, 2147483647);
    const rows = await report();
    expect(row(rows, 'product', p)).toMatchObject({ batch_quantity: '4294967294', difference: '-6442450942' });
    expect(row(rows, 'batch', b)).toMatchObject({ linked_in_quantity: '4294967294', difference_from_linked_evidence: '-2147483647' });
  });

  it('keeps every stored row unchanged and report ordering stable across repeated runs', async () => {
    const p = await product(9); const b = await batch(p, 4); await receipt(p, b, 4);
    await movement(p, 'ADJUSTMENT', 5);
    const before = await fingerprint(); const first = await report(); const second = await report();
    expect(second).toEqual(first); expect(await fingerprint()).toEqual(before);
    const keys = first.map(r => [r.tenant_id, r.product_id, r.section, r.record_id].join('/'));
    expect(keys).toEqual([...keys].sort());
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('enforces READ ONLY at the engine boundary', async () => {
    const p = await product();
    if (native) {
      await expect(native.$transaction(async tx => {
        await setupReadOnly(tx);
        await tx.$executeRawUnsafe(`UPDATE products SET stock_quantity = 1 WHERE id = ${quote(p)}`);
      }, { isolationLevel: 'RepeatableRead' })).rejects.toThrow(/read.only/i);
    } else {
      await embedded!.exec('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      try { await expect(embedded!.exec(`UPDATE products SET stock_quantity = 1 WHERE id = ${quote(p)}`)).rejects.toThrow(/read.only/i); }
      finally { await embedded!.exec('ROLLBACK'); }
    }
    expect(row(await report(), 'product', p).product_quantity).toBe('0');
  });

  it.skipIf(!databaseUrl)('native only: holds one repeatable-read snapshot while another connection commits', async () => {
    const p = await product(4); const b = await batch(p, 4);
    const writer = new PrismaClient({ datasources: { db: { url: databaseUrl! } } });
    try {
      await native!.$transaction(async tx => {
        await setupReadOnly(tx);
        const before = await tx.$queryRawUnsafe<Row[]>(diagnostic);
        await writer.$transaction(async write => {
          await write.$executeRawUnsafe(`UPDATE products SET stock_quantity = 7 WHERE id = ${quote(p)}`);
          await write.$executeRawUnsafe(`UPDATE product_batches SET quantity = 7 WHERE id = ${quote(b)}`);
        });
        expect(await tx.$queryRawUnsafe<Row[]>(diagnostic)).toEqual(before);
      }, { isolationLevel: 'RepeatableRead', timeout: 35000 });
      expect(row(await report(), 'product', p)).toMatchObject({ product_quantity: '7', batch_quantity: '7', difference: '0' });
    } finally { await writer.$disconnect(); }
  });

  it.skipIf(!databaseUrl)('native only: reports actual receipt, two-lot checkout and money-only refund service writes', async () => {
    const { basePrisma, prisma } = await import('../lib/prisma');
    const { tenantContext } = await import('../lib/tenant.context');
    const { InventoryPostingService } = await import('../lib/inventory-posting');
    const { CheckoutService } = await import('../modules/pos/checkout.service');
    try {
      const p = await product();
      const staff = await basePrisma.user.create({ data: { tenantId: tenant, email: `${tenant}@synthetic.test`, fullName: 'Synthetic', passwordHash: 'not-a-login-hash' } });
      const shift = await basePrisma.shift.create({ data: { tenantId: tenant, staffId: staff.id } });
      await basePrisma.customer.create({ data: { tenantId: tenant, phone: 'WALK_IN' } });
      await tenantContext.run({ tenantId: tenant, plan: 'pro' }, async () => {
        for (const [quantity, expiryDate] of [[3, '2099-01-01T00:00:00.000Z'], [2, '2099-02-01T00:00:00.000Z']] as const) {
          await prisma.$transaction(tx => InventoryPostingService.receiveBatch(tx, {
            productId: p, batchNumber: randomUUID(), quantity, expiryDate, costPrice: 1, status: 'RELEASED',
          }));
        }
        const order = await CheckoutService.checkout({ commandId: randomUUID(), shiftId: shift.id, paymentMethod: 'CASH', orderDiscountAmount: 0, cartItems: [{ productId: p, quantity: 4, discountRate: 0 }] });
        const before = await report();
        await CheckoutService.refundOrder(order.id, 'Synthetic money-only refund');
        const after = await report();
        expect(row(after, 'product', p)).toMatchObject({ product_quantity: '1', batch_quantity: '1', difference: '0' });
        expect(after.filter(r => r.section !== 'order_item')).toEqual(before.filter(r => r.section !== 'order_item'));
        expect(after.filter(r => r.section === 'allocation').map(r => r.details.quantity).sort()).toEqual(['1', '3']);
        expect(after.filter(r => r.section === 'movement' && r.details.type === 'IN')).toHaveLength(2);
      });
    } finally { await basePrisma.$disconnect(); }
  });
});
