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
const databaseUrl = process.env.PHARMACY_EXTRA_DATABASE_URL;
const enabled = process.env.PHARMACY_EXTRA_ALLOW_SYNTHETIC === '1' && !!databaseUrl;
const requested =
  databaseUrl ||
  process.env.PHARMACY_EXTRA_ALLOW_SYNTHETIC ||
  process.env.PHARMACY_EXTRA_OUTPUT ||
  process.env.PHARMACY_EXTRA_EXPECTED_HEAD;
if (requested && !enabled) throw new Error('Incomplete pharmacy gap opt-in');
if (
  enabled &&
  (process.env.NODE_ENV !== 'test' ||
    process.versions.node.split('.')[0] !== '22' ||
    process.env.DATABASE_URL !== databaseUrl ||
    !process.env.PHARMACY_EXTRA_OUTPUT ||
    !path.isAbsolute(process.env.PHARMACY_EXTRA_OUTPUT) ||
    !/^[a-f0-9]{40}$/.test(process.env.PHARMACY_EXTRA_EXPECTED_HEAD || '') ||
    fs.readdirSync(process.cwd()).some((name) => name === '.env' || name.startsWith('.env.')))
) {
  throw new Error('Refuse an ambient or incomplete pharmacy gap environment');
}

describe.skipIf(!enabled)('owned pharmacy gap HTTP/PostgreSQL acceptance', () => {
  const output = process.env.PHARMACY_EXTRA_OUTPUT!;
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
      owner.sourceHead !== process.env.PHARMACY_EXTRA_EXPECTED_HEAD ||
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
  async function api(actor: number, method: 'get' | 'post' | 'put' | 'patch', route: string, body?: object) {
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
      ['read', 'shifts'],
      ['manage', 'shifts'],
    ]) {
      permissions.push(await db.permission.create({ data: { action, resource } }));
    }
    for (let i = 0; i < 4; i++) {
      const tenant = i >= 2 ? { id: actors[0].tenantId } : await db.tenant.create({
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
        data: { tenantId: tenant.id, name: `Synthetic existing-capability operator ${i}` },
      });
      await db.rolePermission.createMany({
        data: permissions.filter((permission) => i !== 3 || permission.action === 'read').map((permission) => ({ roleId: role.id, permissionId: permission.id })),
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

  it('private draft APIs reject other actors and tenants and read-only writes without persistence changes', async () => {
    const id = randomUUID();
    const payload = { title: 'Private synthetic draft', lines: [] };
    expect((await api(0, 'put', `/receiving-drafts/${id}`, { expectedRevision: 0, payload })).status).toBe(200);
    const before = await snapshot('isolation-before-denials');
    for (const actor of [1, 2]) {
      for (const suffix of ['', '/history', '/history/1']) {
        const response = await api(actor, 'get', `/receiving-drafts/${id}${suffix}`);
        expect(response.status).toBe(404);
        expect(JSON.stringify(response.body)).not.toContain(payload.title);
      }
      const listing = await api(actor, 'get', `/receiving-drafts?ownerId=${actors[0].id}&tenantId=${actors[0].tenantId}`);
      expect(listing.status).toBe(200);
      expect(JSON.stringify(listing.body)).not.toContain(id);
      expect((await api(actor, 'put', `/receiving-drafts/${id}`, { expectedRevision: 1, payload: { ...payload, title: 'Forbidden overwrite' } })).status).toBe(404);
    }
    expect((await api(3, 'put', `/receiving-drafts/${randomUUID()}`, { expectedRevision: 0, payload })).status).toBe(403);
    expect((await api(3, 'put', `/receiving-drafts/${id}`, { expectedRevision: 1, payload })).status).toBe(403);
    const own = await api(0, 'get', `/receiving-drafts/${id}/history/1`);
    expect(own.status).toBe(200);
    expect(own.body.data.payload).toEqual(payload);
    const after = await snapshot('isolation-after-denials');
    unchangedExcept(before, after, []);
    cases.push({ name: 'Actor tenant read-only HTTP isolation', status: 'PASS', draftId: id,
      foreignTenantActor: 1, sameTenantOtherActor: 2, sameTenantReadOnlyActor: 3,
      unchangedTables: Object.keys(before), evidenceLayer: 'real login HTTP/API/PostgreSQL; not browser' });
  }, 30000);

  // A real PG row lock forces both HTTP handlers past their initial reads and
  // blocks both native UPDATEs. pg_stat_activity is the overlap witness; simply
  // launching Promise.all without observing this state would not prove a race.
  async function raceBehindRowLock(table: 'shifts' | 'daily_settlements', id: string, send: () => ReturnType<typeof api>[]) {
    let release!: () => void;
    let acquired!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const ready = new Promise<void>((resolve) => { acquired = resolve; });
    const holder = db.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(`SELECT id FROM "${table}" WHERE id=$1 FOR UPDATE`, id);
      acquired();
      await gate;
    }, { timeout: 15000 });
    // Do not leave a failed lock transaction as an unhandled promise.
    await Promise.race([ready, holder.then(() => { throw new Error('Lock holder exited before ready'); })]);
    const requestsInFlight = Promise.all(send());
    let waiting = 0;
    try {
      const deadline = Date.now() + 8000;
      while (Date.now() < deadline) {
        const rows = await db.$queryRawUnsafe<Array<{ count: number }>>(
          `SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE $1`,
          `UPDATE "public"."${table}"%`,
        );
        waiting = rows[0].count;
        if (waiting >= 2) break;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    } finally {
      release();
      await holder;
    }
    const responses = await requestsInFlight;
    expect(waiting, `${table}: two genuine UPDATEs must wait on the held row`).toBe(2);
    return { responses, waiting };
  }

  it('native close and confirm races preserve the first winner and reject cross-tenant and later writes', async () => {
    const a = actors[0];
    const shift = await db.shift.create({ data: { tenantId: a.tenantId, staffId: a.id, openingCash: 0, notes: 'Original notes' } });
    const settlement = await db.dailySettlement.create({ data: { tenantId: a.tenantId, shiftId: shift.id, date: new Date('2026-11-12T00:00:00.000Z'), totalSales: 0, notes: 'Synthetic only' } });
    const baseline = await snapshot('transition-before');
    const closes = [{ closingCash: 10, notes: 'Winner candidate A' }, { closingCash: 99, notes: 'Winner candidate B' }];
    const closeRace = await raceBehindRowLock('shifts', shift.id, () => closes.map((body) => api(0, 'patch', `/shifts/${shift.id}/close`, body)));
    expect(closeRace.responses.map((r) => r.status).sort()).toEqual([200, 409]);
    const winner = closeRace.responses.findIndex((r) => r.status === 200);
    const closed = await db.shift.findUniqueOrThrow({ where: { id: shift.id } });
    expect(closed.status).toBe('CLOSED');
    expect(Number(closed.closingCash)).toBe(closes[winner].closingCash);
    expect(closed.notes).toBe(closes[winner].notes);
    expect(closed.closedAt).not.toBeNull();
    expect((await api(0, 'patch', `/shifts/${shift.id}/close`, { closingCash: 777, notes: 'late overwrite' })).status).toBe(400);
    expect((await api(1, 'patch', `/shifts/${shift.id}/close`, { closingCash: 888 })).status).toBe(404);
    expect(await db.shift.findUniqueOrThrow({ where: { id: shift.id } })).toEqual(closed);
    const confirmRace = await raceBehindRowLock('daily_settlements', settlement.id, () => [api(0, 'post', `/daily-settlements/${settlement.id}/confirm`), api(0, 'post', `/daily-settlements/${settlement.id}/confirm`)]);
    expect(confirmRace.responses.map((r) => r.status).sort()).toEqual([200, 409]);
    const confirmed = await db.dailySettlement.findUniqueOrThrow({ where: { id: settlement.id } });
    expect(confirmed.confirmedAt).not.toBeNull();
    const confirmWinner = confirmRace.responses.find((r) => r.status === 200)!;
    expect(confirmWinner.body.data.confirmedAt).toBe(confirmed.confirmedAt!.toISOString());
    expect((await api(0, 'post', `/daily-settlements/${settlement.id}/confirm`)).status).toBe(400);
    expect((await api(1, 'post', `/daily-settlements/${settlement.id}/confirm`)).status).toBe(404);
    expect(await db.dailySettlement.findUniqueOrThrow({ where: { id: settlement.id } })).toEqual(confirmed);
    const after = await snapshot('transition-after');
    unchangedExcept(baseline, after, ['shifts', 'daily_settlements']);
    // Existing amounts/associations are invariant, not newly approved financial policy.
    expect({ ...confirmed, confirmedAt: settlement.confirmedAt }).toEqual(settlement);
    expect({ ...closed, status: shift.status, closingCash: shift.closingCash, closedAt: shift.closedAt, notes: shift.notes }).toEqual(shift);
    cases.push({ name: 'Native close confirm contention', status: 'PASS', shiftId: shift.id, settlementId: settlement.id,
      closeStatuses: closeRace.responses.map((r) => r.status), confirmStatuses: confirmRace.responses.map((r) => r.status),
      overlap: { closeBlockedUpdates: closeRace.waiting, confirmBlockedUpdates: confirmRace.waiting },
      winnerPreserved: true, amountsUnchanged: true, evidenceLayer: 'real HTTP and native PostgreSQL locks; no mocked persistence' });
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
