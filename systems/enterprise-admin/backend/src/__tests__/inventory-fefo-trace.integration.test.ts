import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';

// This exact HTTP → Prisma → PostgreSQL acceptance is opt-in and never falls
// back to an ambient DATABASE_URL. The owner supplies a fresh loopback database.
const databaseUrl = process.env.INVENTORY_FEFO_TRACE_DATABASE_URL;
const ownershipFile = process.env.INVENTORY_FEFO_TRACE_OWNERSHIP_FILE;
const snapshotsFile = process.env.INVENTORY_FEFO_TRACE_SNAPSHOTS_FILE;
const lifecycleFile = process.env.INVENTORY_FEFO_TRACE_LIFECYCLE_FILE;
const syntheticOptIn = process.env.INVENTORY_FEFO_TRACE_ALLOW_SYNTHETIC === '1';

if (databaseUrl) {
  const url = new URL(databaseUrl);
  if (url.protocol !== 'postgresql:' || url.hostname !== '127.0.0.1' || url.port !== '5432'
    || url.username !== 'test' || url.password || url.search || url.hash
    || !/^\/inventory_fefo_trace_[a-f0-9]{32}$/.test(url.pathname)
    || process.env.DATABASE_URL !== databaseUrl
    || process.env.NODE_ENV !== 'test'
    || !syntheticOptIn
    || !ownershipFile || !path.isAbsolute(ownershipFile)) {
    throw new Error('Inventory FEFO trace acceptance requires its exact owned synthetic loopback database');
  }
  if (!snapshotsFile || !path.isAbsolute(snapshotsFile)
    || !lifecycleFile || !path.isAbsolute(lifecycleFile)) {
    throw new Error('Inventory FEFO trace acceptance requires absolute snapshot and lifecycle evidence paths');
  }
  if (requireEnvFile()) {
    throw new Error('Inventory FEFO trace acceptance refuses a backend .env file');
  }
}

function requireEnvFile() {
  return existsSync(path.resolve(process.cwd(), '.env'));
}

type OwnershipReceipt = {
  database: string;
  host: '127.0.0.1';
  port: number;
  publishedAddress: '127.0.0.1';
  publishedPort: number;
  systemIdentifier: string;
  dataDirectory: string;
  containerId: string;
  sourceHead: string;
  sourceTree: string;
  testBlob: string;
  syntheticOnly: true;
};

type Envelope = {
  success: boolean;
  data: Record<string, unknown>;
};

describe.skipIf(!databaseUrl)('inventory FEFO and batch trace over owned HTTP/PostgreSQL', () => {
  let prisma: PrismaClient | undefined;
  let server: Server | undefined;
  let base = '';

  function requirePrisma() {
    if (!prisma) throw new Error('The explicitly opted-in synthetic Prisma client is unavailable');
    return prisma;
  }

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl! } }, log: [] });
    const db = requirePrisma();
    const receipt = JSON.parse(readFileSync(ownershipFile!, 'utf8')) as OwnershipReceipt;
    const identity = await db.$queryRaw<Array<{ database: string; host: string; port: number; system: string; directory: string }>>`
      SELECT current_database() AS database, host(inet_server_addr()) AS host,
        inet_server_port() AS port,
        (SELECT system_identifier::text FROM pg_control_system()) AS system,
        current_setting('data_directory') AS directory`;
    expect(identity).toHaveLength(1);
    expect(identity[0]).toMatchObject({
      database: receipt.database,
      host: '127.0.0.1',
      port: receipt.port,
      system: receipt.systemIdentifier,
      directory: receipt.dataDirectory,
    });
    expect(receipt.syntheticOnly).toBe(true);
    expect(receipt.publishedAddress).toBe('127.0.0.1');
    expect(receipt.publishedPort).toBeGreaterThan(0);
    expect(receipt.containerId).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.sourceHead).toMatch(/^[a-f0-9]{40}$/);
    expect(receipt.sourceTree).toMatch(/^[a-f0-9]{40}$/);
    expect(receipt.testBlob).toMatch(/^[a-f0-9]{40}$/);

    const tables = await db.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
      ORDER BY tablename`;
    expect(tables.length).toBeGreaterThanOrEqual(28);
    for (const { tablename } of tables) expect(tablename).toMatch(/^[a-z_]+$/);
    const counts = await Promise.all(tables.map(async ({ tablename }) => {
      const rows = await db.$queryRawUnsafe<Array<{ count: bigint }>>(`SELECT count(*) AS count FROM "${tablename}"`);
      return rows[0].count;
    }));
    expect(counts.every((count) => count === 0n)).toBe(true);

    const { default: app } = await import('../app');
    server = await new Promise<Server>((resolve, reject) => {
      const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
      instance.once('error', reject);
    });
    const address = server.address();
    expect(address && typeof address !== 'string' && address.address).toBe('127.0.0.1');
    if (!address || typeof address === 'string') throw new Error('Expected an owned loopback HTTP listener');
    base = `http://127.0.0.1:${address.port}`;
  }, 30_000);

  afterAll(async () => {
    if (server) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
    let prismaDisconnected = !prisma;
    if (prisma) {
      await prisma.$disconnect();
      prismaDisconnected = true;
    }
    if (lifecycleFile) {
      const receipt = JSON.parse(readFileSync(ownershipFile!, 'utf8')) as OwnershipReceipt;
      writeFileSync(lifecycleFile, `${JSON.stringify({
        event: 'afterAll-complete',
        serverClosed: !server || !server.listening,
        prismaDisconnected,
        sourceHead: receipt.sourceHead,
        sourceTree: receipt.sourceTree,
        testBlob: receipt.testBlob,
      }, null, 2)}\n`);
    }
  });

  it('persists FEFO split, enforces tenant-scoped read access, and returns a read-only capped trace', async () => {
    const db = requirePrisma();
    const { signAccessToken } = await import('../lib/jwt');
    const tenantA = await db.tenant.create({ data: { name: 'Synthetic FEFO tenant A', slug: `fefo-a-${randomUUID()}`, plan: 'pro' } });
    const tenantB = await db.tenant.create({ data: { name: 'Synthetic FEFO tenant B', slug: `fefo-b-${randomUUID()}`, plan: 'pro' } });
    const [userA, userB] = await Promise.all([tenantA, tenantB].map((tenant, index) => db.user.create({ data: {
      tenantId: tenant.id,
      email: `synthetic-fefo-${index}-${randomUUID()}@example.test`,
      fullName: 'Synthetic acceptance actor',
      passwordHash: 'not-a-login-hash',
    } })));
    const token = (index: 0 | 1, permissions = ['read:products', 'create:products', 'release:product_batches', 'manage:pos', 'create:orders', 'read:orders']) => {
      const user = index === 0 ? userA : userB;
      const tenant = index === 0 ? tenantA : tenantB;
      return signAccessToken({ userId: user.id, email: user.email, tenantId: tenant.id, plan: 'pro', permissions });
    };
    const customer = await db.customer.create({ data: { tenantId: tenantA.id, phone: 'WALK_IN' } });
    const shift = await db.shift.create({ data: { tenantId: tenantA.id, staffId: userA.id } });
    const product = await db.product.create({ data: {
      tenantId: tenantA.id,
      sku: `SYN-FEFO-${randomUUID()}`,
      name: 'Synthetic FEFO trace product',
      costPrice: 10,
      retailPrice: 20,
      stockQuantity: 0,
    } });
    const prefix = '/api/v1/admin';

    async function request(route: string, expectedStatus: number, bearer?: string, body?: object) {
      const response = await fetch(`${base}${route}`, {
        method: body ? 'POST' : 'GET',
        headers: {
          ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(15_000),
      });
      const payload = await response.json() as Envelope;
      expect(response.status, `${route} returned ${JSON.stringify(payload)}`).toBe(expectedStatus);
      return payload;
    }

    const batch = async (batchNumber: string, expiryDate: string, quantity: number) => {
      const response = await request(`${prefix}/product-batches`, 201, token(0), {
        productId: product.id,
        batchNumber,
        expiryDate,
        quantity,
        costPrice: 10,
        status: 'RELEASED',
        reason: 'Synthetic inventory FEFO acceptance receipt',
      });
      return response.data as { id: string };
    };

    // Create the later-expiring lot first so insertion/FIFO order disagrees with FEFO.
    const later = await batch(`LATER-${randomUUID()}`, '2099-02-01T00:00:00.000Z', 131);
    const early = await batch(`EARLY-${randomUUID()}`, '2099-01-01T00:00:00.000Z', 1);
    const checkout = await request(`${prefix}/pos/checkout`, 201, token(0), {
      commandId: randomUUID(),
      shiftId: shift.id,
      customerId: customer.id,
      paymentMethod: 'CASH',
      cartItems: [{ productId: product.id, quantity: 2 }],
    });
    const orderId = checkout.data.id as string;
    const originalAllocations = await db.saleBatchAllocation.findMany({
      where: { tenantId: tenantA.id, orderId },
      orderBy: [{ expiryDateAtSale: 'asc' }, { id: 'asc' }],
    });
    expect(originalAllocations.map(({ batchId, quantity }) => ({ batchId, quantity }))).toEqual([
      { batchId: early.id, quantity: 1 },
      { batchId: later.id, quantity: 1 },
    ]);

    const tableNames = await db.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
      ORDER BY tablename`;
    async function snapshot() {
      const rows: Record<string, unknown> = {};
      for (const { tablename } of tableNames) {
        rows[tablename] = await db.$queryRawUnsafe(`SELECT to_jsonb(t) AS row FROM "${tablename}" t ORDER BY to_jsonb(t)::text`);
      }
      return JSON.parse(JSON.stringify(rows)) as Record<string, unknown>;
    }

    const beforeInitialDetailReads = await snapshot();
    const earlyInitialTrace = await request(`${prefix}/product-batches/${early.id}`, 200, token(0));
    const laterInitialTrace = await request(`${prefix}/product-batches/${later.id}`, 200, token(0));
    const initialTraceAllocations = [earlyInitialTrace.data, laterInitialTrace.data].flatMap((data) =>
      (data as { saleAllocations: Array<{ id: string; batchId: string; quantity: number; order: { id: string } }> }).saleAllocations
        .map(({ id, batchId, quantity, order }) => ({ id, batchId, quantity, orderId: order.id })));
    expect(initialTraceAllocations).toEqual(originalAllocations.map(({ id, batchId, quantity, orderId }) => ({
      id,
      batchId,
      quantity,
      orderId,
    })));
    const afterInitialDetailReads = await snapshot();
    expect(afterInitialDetailReads).toEqual(beforeInitialDetailReads);

    for (let index = 0; index < 130; index += 1) {
      const sale = await request(`${prefix}/orders`, 201, token(0), {
        customerId: customer.id,
        items: [{ productId: product.id, quantity: 1 }],
      });
      expect(typeof sale.data.id).toBe('string');
    }

    expect(await db.saleBatchAllocation.count({ where: { tenantId: tenantA.id, batchId: early.id } })).toBe(1);
    expect(await db.saleBatchAllocation.count({ where: { tenantId: tenantA.id, batchId: later.id } })).toBe(131);
    expect((await db.productBatch.findUniqueOrThrow({ where: { id: early.id } })).quantity).toBe(0);
    expect((await db.productBatch.findUniqueOrThrow({ where: { id: later.id } })).quantity).toBe(0);
    expect((await db.product.findUniqueOrThrow({ where: { id: product.id } })).stockQuantity).toBe(0);

    const beforePaginationReads = await snapshot();
    const laterTrace = await request(`${prefix}/product-batches/${later.id}`, 200, token(0));
    const trace = laterTrace.data as {
      saleAllocations: Array<{ id: string; batchId: string; order: { id: string } }>;
      receiptMovements: Array<{ quantity: number; type: string }>;
      _count: { saleAllocations: number };
    };
    expect(trace._count.saleAllocations).toBe(131);
    expect(trace.saleAllocations).toHaveLength(100);
    const expectedLatest = await db.saleBatchAllocation.findMany({
      where: { tenantId: tenantA.id, batchId: later.id },
      take: 100,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    expect(trace.saleAllocations.map(({ id }) => id)).toEqual(expectedLatest.map(({ id }) => id));
    expect(trace.receiptMovements).toHaveLength(1);
    expect(trace.receiptMovements[0]).toMatchObject({ quantity: 131, type: 'IN' });

    await request(`${prefix}/product-batches/${later.id}`, 404, token(1));
    await request(`${prefix}/product-batches/${later.id}`, 403, token(0, []));
    const afterPaginationReads = await snapshot();
    expect(afterPaginationReads).toEqual(beforePaginationReads);

    const ownership = JSON.parse(readFileSync(ownershipFile!, 'utf8')) as OwnershipReceipt;
    const report = {
      acceptance: 'passed',
      sourceHead: ownership.sourceHead,
      sourceTree: ownership.sourceTree,
      testBlob: ownership.testBlob,
      database: ownership.database,
      batchCreationOrder: ['later-expiry', 'earlier-expiry'],
      fefoSplit: originalAllocations.map(({ batchId, quantity, id, orderId }) => ({ batchId, quantity, allocationId: id, orderId })),
      initialDetailAllocations: initialTraceAllocations,
      tracePagination: { total: trace._count.saleAllocations, returned: trace.saleAllocations.length, order: 'createdAt desc, id desc' },
      authorization: { crossTenantStatus: 404, missingPermissionStatus: 403 },
      readOnly: {
        initialDetailReadsUnchanged: true,
        paginationAndAuthorizationReadsUnchanged: true,
        businessTables: tableNames.length,
      },
      syntheticOnly: true,
    };
    const reportPath = process.env.INVENTORY_FEFO_TRACE_EVIDENCE_FILE;
    if (reportPath) {
      if (!path.isAbsolute(reportPath)) throw new Error('Evidence path must be absolute');
      writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    }
    writeFileSync(snapshotsFile!, `${JSON.stringify({
      source: { head: ownership.sourceHead, tree: ownership.sourceTree, testBlob: ownership.testBlob },
      businessTableCount: tableNames.length,
      initialDetailReads: { before: beforeInitialDetailReads, after: afterInitialDetailReads },
      paginationAndAuthorizationReads: { before: beforePaginationReads, after: afterPaginationReads },
    }, null, 2)}\n`);
    expect(report).toMatchObject({
      acceptance: 'passed',
      tracePagination: { total: 131, returned: 100 },
      readOnly: { initialDetailReadsUnchanged: true, paginationAndAuthorizationReadsUnchanged: true },
    });
  }, 120_000);
});
