import { randomUUID, createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { once } from 'node:events';
import type { Server } from 'node:http';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';

// Ordinary npm test never falls back to DATABASE_URL, reads an owner file,
// imports the app or opens a DB. Only the owned runner supplies this opt-in.
const databaseUrl = process.env.PHARMACY_GAP_DATABASE_URL;
const enabled = process.env.PHARMACY_GAP_ALLOW_SYNTHETIC === '1' && !!databaseUrl;
const requested =
  databaseUrl ||
  process.env.PHARMACY_GAP_ALLOW_SYNTHETIC ||
  process.env.PHARMACY_GAP_OUTPUT ||
  process.env.PHARMACY_GAP_EXPECTED_HEAD;
if (requested && !enabled) throw new Error('Incomplete pharmacy gap opt-in');
if (
  enabled &&
  (process.env.NODE_ENV !== 'test' ||
    process.versions.node.split('.')[0] !== '22' ||
    process.env.DATABASE_URL !== databaseUrl ||
    !process.env.PHARMACY_GAP_OUTPUT ||
    !path.isAbsolute(process.env.PHARMACY_GAP_OUTPUT) ||
    !/^[a-f0-9]{40}$/.test(process.env.PHARMACY_GAP_EXPECTED_HEAD || '') ||
    fs.readdirSync(process.cwd()).some((name) => name === '.env' || name.startsWith('.env.')))
) {
  throw new Error('Refuse an ambient or incomplete pharmacy gap environment');
}

describe.skipIf(!enabled)('owned pharmacy gap HTTP/PostgreSQL acceptance', () => {
  const output = process.env.PHARMACY_GAP_OUTPUT!;
  const owner = enabled
    ? JSON.parse(fs.readFileSync(path.join(output, 'ownership.json'), 'utf8'))
    : null;
  if (enabled) {
    const connection = new URL(databaseUrl!);
    if (
      connection.protocol !== 'postgresql:' ||
      connection.username !== 'gap_test' ||
      !connection.password ||
      connection.search ||
      connection.hash ||
      connection.hostname !== owner.dbHost ||
      connection.pathname !== `/${owner.database}` ||
      Number(connection.port) !== 5432 ||
      owner.dbPort !== 5432 ||
      owner.syntheticOnly !== true ||
      owner.transport !== 'owned-internal-network' ||
      owner.networkInternal !== true ||
      owner.onlyOwnedNetworkMembers !== true ||
      owner.noPublishedPorts !== true ||
      owner.noExistingDataMounts !== true ||
      !/^[a-f0-9]{64}$/.test(owner.dbContainerId) ||
      !/^[a-f0-9]{64}$/.test(owner.clientContainerId) ||
      !/^[a-f0-9]{64}$/.test(owner.networkId) ||
      owner.initialPublicTableCount !== 0 ||
      !/^pharmacy_gap_[a-f0-9]{32}$/.test(owner.database) ||
      owner.sourceHead !== process.env.PHARMACY_GAP_EXPECTED_HEAD ||
      !/^[a-f0-9]{40}$/.test(owner.sourceTree) ||
      owner.testSha256 !==
        createHash('sha256')
          .update(fs.readFileSync(new URL(import.meta.url)))
          .digest('hex')
    ) {
      throw new Error('Refuse an unowned pharmacy gap environment');
    }
  }
  let db: PrismaClient;
  let server: Server;
  let endpoint: string;
  const actors: Array<{ id: string; tenantId: string; token: string }> = [];
  const cases: Array<Record<string, unknown>> = [];
  const requests: Array<Record<string, unknown>> = [];
  const snapshots: Record<string, unknown> = {};
  const digest = (data: unknown) => createHash('sha256').update(JSON.stringify(data)).digest('hex');
  const safe = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(safe)
      : value && typeof value === 'object'
        ? Object.fromEntries(
            Object.entries(value)
              .filter(([key]) => !/password|token|secret/i.test(key))
              .map(([key, child]) => [key, safe(child)]),
          )
        : value;
  async function snapshot(label: string) {
    const tables = await db.$queryRawUnsafe<Array<{ tablename: string }>>(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations' ORDER BY tablename",
    );
    const result: Record<string, Array<Record<string, unknown>>> = {};
    for (const { tablename } of tables) {
      if (!/^[a-z_]+$/.test(tablename)) throw new Error('Unexpected table name');
      const rows = await db.$queryRawUnsafe<Array<{ row: Record<string, unknown> }>>(
        `SELECT row_to_json(t) AS row FROM "${tablename}" t`,
      );
      // Compare full rows in memory, including credential fields. Redact only
      // the persisted evidence, never the invariance assertions.
      result[tablename] = rows
        .map((row) => row.row)
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    }
    snapshots[label] = safe(result);
    return result;
  }
  function unchangedExcept(
    before: Record<string, Array<Record<string, unknown>>>,
    after: Record<string, Array<Record<string, unknown>>>,
    allowed: string[],
  ) {
    expect(Object.keys(after)).toEqual(Object.keys(before));
    for (const table of Object.keys(before))
      if (!allowed.includes(table)) expect(digest(after[table]), table).toBe(digest(before[table]));
  }
  async function api(actor: number, method: 'get' | 'post' | 'put', route: string, body?: unknown) {
    const a = actors[actor];
    const pending = request(endpoint)
      [method](`/api/v1/admin${route}`)
      .set('Authorization', `Bearer ${a.token}`);
    const response = body === undefined ? await pending : await pending.send(body);
    requests.push({
      actorId: a.id,
      tenantId: a.tenantId,
      method: method.toUpperCase(),
      route,
      status: response.status,
      bodySha256: digest(safe(response.body)),
    });
    return response;
  }
  beforeAll(async () => {
    ({ basePrisma: db } = await import('../lib/prisma'));
    const [identity] = await db.$queryRawUnsafe<
      Array<{ database: string; system_identifier: string }>
    >(
      'SELECT current_database() AS database, (SELECT system_identifier::text FROM pg_control_system()) AS system_identifier',
    );
    expect(identity).toEqual({
      database: owner.database,
      system_identifier: owner.systemIdentifier,
    });
    const before = await snapshot('before-fixtures');
    expect(Object.values(before).every((rows) => rows.length === 0)).toBe(true);
    const { default: app } = await import('../app');
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing owned HTTP port');
    endpoint = `http://127.0.0.1:${address.port}`;
    const { hashPassword } = await import('../lib/password');
    const password = randomUUID() + '-Synthetic1!';
    const passwordHash = await hashPassword(password);
    const permissions = [];
    for (const [action, resource] of [
      ['read', 'products'],
      ['create', 'products'],
      ['update', 'products'],
      ['release', 'product_batches'],
      ['manage', 'pos'],
      ['create', 'orders'],
      ['read', 'orders'],
    ]) {
      permissions.push(await db.permission.create({ data: { action, resource } }));
    }
    for (let i = 0; i < 2; i++) {
      const tenant = await db.tenant.create({
        data: { slug: `gap-${randomUUID()}`, name: '合成驗收租戶', plan: 'pro' },
      });
      const user = await db.user.create({
        data: {
          tenantId: tenant.id,
          email: `${randomUUID()}@gap.example.test`,
          fullName: '合成驗收人員',
          passwordHash,
        },
      });
      const role = await db.role.create({
        data: { tenantId: tenant.id, name: 'Synthetic existing-capability operator' },
      });
      await db.rolePermission.createMany({
        data: permissions.map((permission) => ({ roleId: role.id, permissionId: permission.id })),
      });
      await db.userRole.create({ data: { userId: user.id, roleId: role.id } });
      const response = await request(endpoint)
        .post('/api/v1/admin/auth/login')
        .set('x-tenant-id', tenant.id)
        .send({ email: user.email, password });
      expect(response.status).toBe(200);
      actors.push({ id: user.id, tenantId: tenant.id, token: response.body.data.accessToken });
      requests.push({
        actorId: user.id,
        tenantId: tenant.id,
        method: 'POST',
        route: '/auth/login',
        status: response.status,
        credentialsAndTokensOmitted: true,
      });
    }
  }, 30000);

  it('CAS loser can explicitly save its retained payload as revision three while immutable earlier revisions and all business rows remain unchanged', async () => {
    const id = randomUUID();
    const payload = (title: string) => ({
      title,
      lines: [
        {
          id: '4d1ac075-886e-430a-a1bd-a9f2ff6a3813',
          reviewed: false,
          fields: {
            productId: '',
            baseUnit: '',
            batchNumber: '',
            expiryDate: '',
            quantity: '待確認',
            note: 'synthetic only',
          },
        },
      ],
    });
    const r1 = payload('起始版本'),
      left = payload('甲保留內容'),
      right = payload('乙保留內容');
    const before = await snapshot('cas-before');
    expect(
      (await api(0, 'put', `/receiving-drafts/${id}`, { expectedRevision: 0, payload: r1 })).status,
    ).toBe(200);
    const responses = await Promise.all(
      [left, right].map((data) =>
        api(0, 'put', `/receiving-drafts/${id}`, { expectedRevision: 1, payload: data }),
      ),
    );
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    const winner = responses.findIndex((r) => r.status === 200),
      loser = 1 - winner;
    const current = await api(0, 'get', `/receiving-drafts/${id}`);
    expect(current.status).toBe(200);
    expect(current.body.data.revision).toBe(2);
    expect(current.body.data.payload).toEqual([left, right][winner]);
    // Explicit application-level choice: retain the losing payload and use the read-back revision.
    const next = await api(0, 'put', `/receiving-drafts/${id}`, {
      expectedRevision: current.body.data.revision,
      payload: [left, right][loser],
    });
    expect(next.status).toBe(200);
    expect(next.body.data.revision).toBe(3);
    expect(next.body.data.payload).toEqual([left, right][loser]);
    const history = await api(0, 'get', `/receiving-drafts/${id}/history`);
    expect(history.status).toBe(200);
    expect(history.body.data.map((r: { revision: number }) => r.revision)).toEqual([3, 2, 1]);
    for (const [revision, expected] of [
      [1, r1],
      [2, [left, right][winner]],
      [3, [left, right][loser]],
    ] as const) {
      const version = await api(0, 'get', `/receiving-drafts/${id}/history/${revision}`);
      expect(version.status).toBe(200);
      expect(version.body.data.payload).toEqual(expected);
    }
    const raw = await db.receivingDraftRevision.findMany({
      where: { draftId: id },
      orderBy: { revision: 'asc' },
    });
    expect(raw.map((r) => r.revision)).toEqual([1, 2, 3]);
    const after = await snapshot('cas-after');
    unchangedExcept(before, after, ['receiving_drafts', 'receiving_draft_revisions']);
    cases.push({
      name: 'CAS retained loser next revision',
      status: 'PASS',
      draftId: id,
      revisions: [1, 2, 3],
      winner,
      loser,
      raceStatuses: responses.map((r) => r.status),
      unchangedBusinessTables: Object.keys(before).filter(
        (n) => !['receiving_drafts', 'receiving_draft_revisions'].includes(n),
      ),
      evidenceLayer: 'real login HTTP API / PostgreSQL; no browser choice UI',
    });
  }, 30000);

  it('actual initial receipts feed audited release, FEFO checkout, same-command replay, money-only refund and general-order debit with durable trace conservation', async () => {
    const a = actors[1];
    const customer = await db.customer.create({ data: { tenantId: a.tenantId, phone: 'WALK_IN' } });
    const shift = await db.shift.create({ data: { tenantId: a.tenantId, staffId: a.id } });
    const productResponse = await api(1, 'post', '/inventory/products', {
      sku: `GAP-${randomUUID()}`,
      name: '合成入銷退登記串接商品',
      costPrice: 10,
      retailPrice: 20,
    });
    expect(productResponse.status).toBe(201);
    const productId = productResponse.body.data.id;
    expect((await db.product.findUniqueOrThrow({ where: { id: productId } })).stockQuantity).toBe(
      0,
    );
    const early = await api(1, 'post', '/product-batches', {
      productId,
      batchNumber: 'EARLY',
      expiryDate: '2098-01-01T00:00:00.000Z',
      quantity: 2,
      costPrice: 10,
    });
    const late = await api(1, 'post', '/product-batches', {
      productId,
      batchNumber: 'LATE',
      expiryDate: '2099-01-01T00:00:00.000Z',
      quantity: 3,
      costPrice: 10,
      status: 'RELEASED',
      reason: '合成驗收初次放行',
    });
    expect(early.status).toBe(201);
    expect(late.status).toBe(201);
    expect(early.body.data.status).toBe('QUARANTINE');
    const earlyId = early.body.data.id,
      lateId = late.body.data.id;
    const balance = async () => ({
      product: (await db.product.findUniqueOrThrow({ where: { id: productId } })).stockQuantity,
      early: (await db.productBatch.findUniqueOrThrow({ where: { id: earlyId } })).quantity,
      late: (await db.productBatch.findUniqueOrThrow({ where: { id: lateId } })).quantity,
    });
    expect(await balance()).toEqual({ product: 5, early: 2, late: 3 });
    const checkout = {
      commandId: randomUUID(),
      shiftId: shift.id,
      paymentMethod: 'CASH',
      cartItems: [{ productId, quantity: 3, discountRate: 0 }],
      orderDiscountAmount: 0,
    };
    const beforeReject = await snapshot('receipts-before-quarantine-rejection');
    const rejected = await api(1, 'post', '/pos/checkout', {
      ...checkout,
      commandId: randomUUID(),
      cartItems: [{ productId, quantity: 4, discountRate: 0 }],
    });
    expect(rejected.status).toBe(400);
    expect(digest(await snapshot('receipts-after-quarantine-rejection'))).toBe(
      digest(beforeReject),
    );
    expect(
      (
        await api(1, 'post', `/product-batches/${earlyId}/status`, {
          status: 'RELEASED',
          reason: '合成檢驗後放行',
        })
      ).status,
    ).toBe(200);
    const sale = await api(1, 'post', '/pos/checkout', checkout);
    expect(sale.status).toBe(201);
    const orderId = sale.body.data.id;
    expect(Number(sale.body.data.totalAmount)).toBe(60);
    expect(await balance()).toEqual({ product: 2, early: 0, late: 2 });
    const allocations = await db.saleBatchAllocation.findMany({
      where: { orderId },
      orderBy: { quantity: 'desc' },
    });
    expect(allocations.map((r) => ({ batchId: r.batchId, quantity: r.quantity }))).toEqual([
      { batchId: earlyId, quantity: 2 },
      { batchId: lateId, quantity: 1 },
    ]);
    const beforeReplay = await snapshot('sale-before-replay');
    const replay = await api(1, 'post', '/pos/checkout', checkout);
    expect(replay.status).toBe(201);
    expect(replay.body).toEqual(sale.body);
    expect(digest(await snapshot('sale-after-replay'))).toBe(digest(beforeReplay));
    const refund = await api(1, 'post', `/pos/orders/${orderId}/refund`, {
      reason: '合成退款登記，未收回實物',
    });
    expect(refund.status).toBe(200);
    expect(refund.body.data.status).toBe('refunded');
    expect(await balance()).toEqual({ product: 2, early: 0, late: 2 });
    const afterRefund = await snapshot('after-money-only-refund');
    unchangedExcept(beforeReplay, afterRefund, ['orders']);
    const oldOrder = beforeReplay.orders.find((r) => r.id === orderId),
      newOrder = afterRefund.orders.find((r) => r.id === orderId);
    if (!oldOrder || !newOrder) throw new Error('Missing owned order snapshot');
    for (const key of Object.keys(oldOrder))
      if (!['status', 'discount_note', 'updated_at'].includes(key))
        expect(newOrder[key], key).toEqual(oldOrder[key]);
    const replayRefunded = await api(1, 'post', '/pos/checkout', checkout);
    expect(replayRefunded.status).toBe(201);
    expect(replayRefunded.body).toEqual(sale.body);
    expect(digest(await snapshot('after-refunded-command-replay'))).toBe(digest(afterRefund));
    const general = await api(1, 'post', '/orders', {
      customerId: customer.id,
      items: [{ productId, quantity: 1 }],
    });
    expect(general.status).toBe(201);
    expect(general.body.data.status).toBe('pending');
    expect(await balance()).toEqual({ product: 1, early: 0, late: 1 });
    const beforeTrace = await snapshot('before-readonly-joined-trace');
    for (const id of [earlyId, lateId]) {
      const trace = await api(1, 'get', `/product-batches/${id}`);
      expect(trace.status).toBe(200);
      expect(trace.body.data.receiptMovements).toHaveLength(1);
      const expected = await db.saleBatchAllocation.findMany({
        where: { batchId: id },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      expect(
        trace.body.data.saleAllocations.map(
          (r: { id: string; orderId: string; quantity: number }) => ({
            id: r.id,
            orderId: r.orderId,
            quantity: r.quantity,
          }),
        ),
      ).toEqual(expected.map((r) => ({ id: r.id, orderId: r.orderId, quantity: r.quantity })));
    }
    expect(digest(await snapshot('after-readonly-joined-trace'))).toBe(digest(beforeTrace));
    const movements = await db.inventoryTransaction.findMany({ where: { tenantId: a.tenantId } });
    const inQty = movements.filter((r) => r.type === 'IN').reduce((sum, r) => sum + r.quantity, 0);
    const outQty = movements
      .filter((r) => r.type === 'OUT')
      .reduce((sum, r) => sum + r.quantity, 0);
    expect(inQty).toBe(5);
    expect(outQty).toBe(4);
    expect(movements).toHaveLength(4);
    expect(await db.order.count({ where: { tenantId: a.tenantId } })).toBe(2);
    expect(await db.checkoutCommand.count({ where: { tenantId: a.tenantId } })).toBe(1);
    expect(await db.orderPayment.count({ where: { tenantId: a.tenantId } })).toBe(1);
    expect(await db.productBatchChange.count({ where: { tenantId: a.tenantId } })).toBe(2);
    cases.push({
      name: 'Initial receipts through sale/refund/general order/trace',
      status: 'PASS',
      productId,
      earlyId,
      lateId,
      posOrderId: orderId,
      generalOrderId: general.body.data.id,
      initialReceiptQuantity: 5,
      posSold: 3,
      generalOrderSold: 1,
      moneyOnlyRefundStockChange: 0,
      finalBalance: await balance(),
      movementCount: 4,
      orderCount: 2,
      commandCount: 1,
      paymentCount: 1,
      releaseAuditCount: 2,
      evidenceLayer:
        'real login HTTP API / PostgreSQL; no browser, physical return or dispatch/ack',
    });
  }, 30000);

  afterAll(async () => {
    const cleanup = { serverClosed: false, prismaDisconnected: false };
    try {
      if (server) {
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
        cleanup.serverClosed = true;
      }
    } finally {
      try {
        if (db) {
          try {
            await snapshot('after-http-close');
          } finally {
            await db.$disconnect();
            cleanup.prismaDisconnected = true;
          }
        }
      } finally {
        fs.writeFileSync(
          path.join(output, 'journey.json'),
          JSON.stringify({ sourceHead: owner.sourceHead, cases, requests, cleanup }, null, 2),
          { flag: 'wx' },
        );
        fs.writeFileSync(
          path.join(output, 'raw-snapshots-redacted.json'),
          JSON.stringify(snapshots, null, 2),
          { flag: 'wx' },
        );
      }
    }
  }, 30000);
});
