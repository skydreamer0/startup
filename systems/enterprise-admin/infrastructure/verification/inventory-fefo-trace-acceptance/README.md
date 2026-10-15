# Inventory FEFO to batch trace acceptance (#29)

This test-only acceptance closes one integration gap in the existing #29 slices:
the native PostgreSQL stock suite verifies FEFO allocations through the service,
while the existing real-HTTP trace suite verifies batch tenant scope, read-only
behavior, and the 100-row cap using a single source batch. This scenario connects
those paths: one actual POS checkout spans two eligible lots in FEFO order, then
the real batch detail API returns the persisted allocations with tenant checks,
read-only snapshots, and a latest-100 boundary on the later lot.

## Scope and limits

- Adds only `backend/src/__tests__/inventory-fefo-trace.integration.test.ts` and
  this verification note.
- Uses the unchanged Express app, posting services, tenant/RBAC middleware,
  Prisma schema, and migrations.
- Creates two released synthetic lots: one unit in the earlier-expiring lot and
  131 in the later lot. A real checkout allocates one unit from each in expiry
  order; 130 additional general orders create 131 total sale allocations on the
  later lot. Its batch detail response must return the newest 100 while reporting
  the actual total of 131.
- Cross-tenant batch reads return 404; missing product-read permission returns
  403. Raw public business-table snapshots before and after all trace reads must
  match exactly.
- This does not add older-than-cap paging, physical returns, all-writer cutover,
  ledger reconstruction, real-store opening stock, UI/device acceptance, or any
  broader #29 / #37 gate. Existing #110 already covers the 132-allocation
  single-batch HTTP boundary; this scenario specifically joins that boundary to
  an actual multi-lot FEFO posting.

## Isolated native PostgreSQL execution

Install the backend with its standalone `package-lock.json` under Node 22 and
npm 11.21.0 (`npm ci`). Run the acceptance only against a newly created,
task-owned PostgreSQL container, with its host port published only on
`127.0.0.1` and a fresh empty database named
`inventory_fefo_trace_<32 lowercase hex chars>`.
Never pass an ambient, production, preview, or previously existing database URL.
The test requires an explicit matching `DATABASE_URL`, opt-in flag, and absolute
ownership receipt path. The receipt must identify the actual database,
container loopback port and host binding, PostgreSQL system identifier, container
ID, and exact source head/tree. Run the Node test container in the same isolated
network namespace as PostgreSQL so its server identity query also sees
`127.0.0.1:5432`.

Apply only the repository's existing migrations to that new empty database. Run
the Node 22 test process in the PostgreSQL container's isolated network
namespace, with `DATABASE_URL` explicitly set to the task-owned database on
`127.0.0.1:5432`, then run from `backend/`:

```bash
INVENTORY_FEFO_TRACE_DATABASE_URL="$DATABASE_URL" \
INVENTORY_FEFO_TRACE_ALLOW_SYNTHETIC=1 \
INVENTORY_FEFO_TRACE_OWNERSHIP_FILE=/absolute/path/ownership.json \
INVENTORY_FEFO_TRACE_EVIDENCE_FILE=/absolute/path/inventory-fefo-trace.json \
INVENTORY_FEFO_TRACE_SNAPSHOTS_FILE=/absolute/path/read-only-snapshots.json \
INVENTORY_FEFO_TRACE_LIFECYCLE_FILE=/absolute/path/afterAll.json \
npm test -- src/__tests__/inventory-fefo-trace.integration.test.ts
```

Set `DATABASE_URL` to the same exact synthetic URL before the command. If the
checkout's backend directory contains `.env`, make a temporary source copy that
omits dotenv files and run there; this test deliberately refuses to run from a
directory where it could inherit ambient credentials or database settings.

Create the later-expiring lot first and the earlier-expiring lot second so
creation order differs from FEFO order. Require the original POS allocations to
persist as one unit in each lot. Before the 130 extra one-unit orders, read both
batch details and compare each returned allocation ID, batch ID, quantity, and
order ID with those persisted POS rows. Snapshot all public business tables
before and after these reads. Then independently verify the later batch reports
131 total allocations and returns the newest 100, with another before/after
snapshot around pagination and authorization reads. Keep both actual snapshot
pairs, Vitest JSON with `assertionResults`, the process exit result, an afterAll
shutdown marker, and owner-runner database/container cleanup output.

The test is opt-in. Ordinary backend unit CI skips it; the dedicated
`Inventory FEFO trace PostgreSQL acceptance` job in
`.github/workflows/inventory-fefo-trace.yml` runs it on the exact PR head.

Run `node systems/enterprise-admin/backend/scripts/inventory-fefo-trace-native.mjs`
from a clean committed checkout with Node 22, Git, tar and a working Linux Docker
engine. The runner archives the exact committed source (without ambient dotenv
or node_modules), installs the locked backend with npm 11.21.0 in Node 22,
generates Prisma, builds and lints. It creates a uniquely owned PG15 container
on a dedicated network with loopback-only published port, verifies an empty DB
and actual server identity, then applies the existing migrations. The native
test runs in that container's network namespace with synthetic-only environment.

The runner requires one passing assertion with zero skips, both read-only
snapshot pairs across at least 28 tables, the 100/131 trace, exact source
provenance, listener closure and both Prisma disconnects. It drops only its own
database and verifies catalog count zero, then removes its containers/network.
Raw logs, snapshots, lifecycle, ownership and cleanup JSON are retained in a
unique temporary output directory; CI uploads only JSON/log evidence, not the
source archive or installed dependencies. A cleanup failure fails acceptance.
`inventory-fefo-trace-native.test.mjs` checks rejection of skipped/empty reports,
unclosed pools, stale provenance, changed/missing tables and wrong trace caps.

Local Windows attempt on 2026-10-13 could not start Docker's Linux engine because
Docker Desktop could not access its stale analytics socket. No database was
created and no local native pass is claimed. The dedicated job's exact-head
result is the native acceptance source; browser/hardware and broader #29 remain
separate gates.

## Local execution record — 2026-10-11 UTC

- Base: `master@94a2184bec6e3221e3efaa427bc75d1ef4435c9b`, rechecked against
  `origin/master` before handoff. Tested source: `bdb3cc7c146ff0b42394e50774622cbd38154c5b`,
  tree `bd45f37dd1223113e9bbf19563657ccc20390c34`.
- Standard backend lockfile install: Node 22.23.3 / npm 11.21.0; `npm ci`
  added 433 packages, audited 434, and reported zero vulnerabilities. npm warned
  that six dependency install scripts were not covered by its `allowScripts`
  policy; no approval/configuration was added. The documented explicit Prisma
  generate command succeeded.
- Passed: `npm run db:generate`, `npm run build`, `npm run lint`, and the isolated
  native acceptance above (1/1, zero skips). The actual receipt and checkout
  flowed through the unchanged Express app and PostgreSQL 15; the task database
  used a unique name and was reachable only from the private test-container
  network plus a host mapping on `127.0.0.1`.
- Full backend suite: 42/51 test files passed, 9 files skipped; **372 passed,
  82 skipped, 0 failed**. The 82 skipped tests remain skips and are not counted as
  acceptance. The opt-in FEFO trace file is run separately above so the rest of
  the suite cannot race its required initially-empty-database check. Repository
  synthetic seed data was used only inside the disposable task database for the
  standard API tests.
- Superseded setup attempts are retained in the task transcript: a run without
  `DATABASE_URL` produced 38 DB-fixture failures before connecting; an early
  suite run had seed/vector-path setup failures; and an earlier trace preflight
  correctly stopped on the wrong Docker address before seeding. The corrected
  final runs above are separate results. No suite failure was reclassified as a
  pass.
- No Actions/CI result, browser/device test, real-store check, migration against
  a non-disposable database, issue closure, PR publication, merge, or deployment
  is claimed. The full #29 acceptance remains open.
- Teardown verified: the named synthetic database was dropped (catalog count
  zero), and its exact task-owned PostgreSQL container was removed and no longer
  inspectable. No other database/container was targeted.

## Revision 2 independent review rerun — 2026-10-11 UTC

- Preserved the first candidate and review archive in history; revision 2 is a
  new local commit on `test/inventory-fefo-trace-acceptance-rev2-20261011`.
  Base remains `master@94a2184bec6e3221e3efaa427bc75d1ef4435c9b`. The exact
  tested source is `a31c4986a4042f404dd35d4f38d545b2f132c7a8`, tree
  `ec1255d8579a67bb9b157fbe3c3d717542de49bb`, and test blob
  `c33dadf2c891977733eb68b4c1a7354952558f9e`, taken from Git objects before
  the native run.
- Build and lint passed under Node 22.23.3. One explicit native acceptance run
  then passed 1/1 with zero skips/failures under Node 22.23.3 / npm 11.21.0 and
  PostgreSQL 15.19. Vitest JSON retained the passing `assertionResults`; its
  process exit code was 0, and the afterAll marker confirms the loopback HTTP
  listener closed and Prisma disconnected.
- The later-expiring lot was created first, followed by the earlier-expiring
  lot. The first POS checkout persisted one allocation to each, ordered by
  expiry. Before creating the additional 130 orders, both HTTP detail reads
  returned the exact original allocation IDs, batch IDs, quantities, and order
  ID. After the additional orders, the separate paging check returned 100 of
  131 allocations; cross-tenant and insufficient-permission reads returned 404
  and 403.
- Both read-only phases captured complete before/after snapshots of all 28
  public business tables; each pair compares equal. The ZIP includes the full
  serialized snapshots, Vitest native JSON and raw output, exit receipt,
  afterAll marker, PostgreSQL ownership receipt, migration output, and raw
  database/container teardown log.
- A setup-only attempt before the passing run queried the server identity over
  a local socket, yielding empty host/port fields. Vitest was not started in
  that attempt. Its migration output and cleanup log are retained separately;
  the dedicated database and container were removed (catalog count zero,
  container absent). The successful run used a corrected TCP identity probe.
- The test remains opt-in and no workflow/runner wiring was changed. No CI run,
  full backend suite, browser/device check, real-store check, PR, push, merge, or
  deployment is claimed for revision 2. The earlier full suite's 372 passed / 82
  skipped / 0 failed counts belong only to the first candidate and are not this
  revision's gate.
