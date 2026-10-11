# General-order trace: owned local HTTP / PostgreSQL acceptance

This test-only supplement targets the existing batch trace gap in Issue 31 and
PR 108. Its product baseline is `7500af3ac984f3886db54bdb175f9eeab2ec67ae`, tree
`230593349461b23e89b3e4f1762c1fbb9b223392`, including the nullable-order fix on
PR 107. It changes no product handler, frontend, schema, dependency, workflow or
security policy. It does not complete either Issue 31 or the overall CI gate.

## Scope

The owner runner initializes a new disposable PostgreSQL cluster in the explicit
output directory, binds only 127.0.0.1, and creates a unique empty database. It
never falls back to an ambient DATABASE_URL. No user computer, existing database,
production/preview service or browser is used. Synthetic temporary JWT secrets
exist only in the subprocess environment and are not saved in the evidence.

1. A real HTTP client/server/native-PG smoke proves same-executor connectivity.
2. The unchanged Express app's `/ready` endpoint verifies the migrated database.
3. An actual receipt POST creates 200 units and the source IN record.
4. A general-order POST sells two units and persists a null order number.
5. An actual POS checkout sells one unit with a numbered order. The batch GET
   contains both allocations, their receipt and count; quantities are 197.
6. The general-order GET returns the matching real allocation and batch.
7. Missing permission, cross-tenant identity, missing authentication, mismatched
   tenant header and missing batch reads reject without database changes.
8. 130 further general-order POSTs produce 132 real allocations. GET returns the
   latest 100 in declared order, reports 132, preserves the receipt and leaves 67
   units. A fresh Prisma client confirms durable links afterward.

The suite groups these checks into eight acceptance cases. Every read-only group
compares all public business-table rows before and after. Raw JSON response bodies
and their SHA256 values, empty/final database snapshots, database/system identity,
source hashes, statuses and cleanup receipts are saved. JWT headers are omitted.
The initial mixed two-row case and the later capped case are separate; the latter
contains recent null-number general orders, not the older numbered POS order.

## Run

Requirements: an explicitly approved local PostgreSQL installation, Python 3,
Node with this backend's installed dependencies and generated Prisma 6.19.3
client. Never pass a production or preview database URL. Installation is outside
this runner; it never downloads binaries or changes system settings.

From `systems/enterprise-admin/backend`:

    node --import tsx --test scripts/general-order-trace-guards.test.ts
    python scripts/general-order-trace-owned.py --pg-bin /absolute/owned/pg/bin --output /absolute/new/evidence-directory

The output directory must not already exist. The runner uses a scrubbed child
environment, fails before connections on invalid local ownership, and checks the
server's data directory and system identifier. The guard suite includes rejected
remote/ambient/existing-local URLs, invalid identities, a changed marker and a
present dotenv file. It is not a proof against a malicious local OS user.

Cleanup keeps append-only audit rows intact, drops only the proven-owned database,
verifies its absence, stops that cluster, checks the postmaster PID is gone, then
removes only its owned directory. Failure logs and evidence remain. An interrupted
host may prevent final cleanup; absence of a receipt is never treated as success.

## Local evidence and limits

The initial execution used PostgreSQL 15.19 compiled from the official
https://ftp.postgresql.org/pub/source/v15.19/ source archive, verified against its
published SHA256, and installed only in the assistant workspace. Node 24.19.0 and
existing dependency bytes were used; this is not a fresh Node22 frozen install or
an Actions run. The runtime was not installed on the user's computer.

Preserved preparation failures:
- Attempt 1: PostgreSQL bound TCP, then stopped because the filesystem Unix socket
  path exceeded 107 bytes. The local runner now disables Unix sockets and uses
  explicit loopback TCP. No database was created in that failed startup.
- Attempt 2: smoke passed and owned cleanup passed; the suite stopped at identity
  validation because `inet_server_addr()::text` renders `/32`. The query now uses
  PostgreSQL `host(inet_server_addr())` for the exact host comparison.
- Attempt 3: eight acceptance cases and owned cleanup passed. Later ownership
  guard additions are not covered by that earlier result; the final frozen source
  must have its own run and independent review.

HTTP / API / native PostgreSQL acceptance is distinct from browser/UI acceptance.
This suite does not exercise frontend parsing, fallback rendering, screenshots,
focus, 1024px, native zoom, hardware, iPad/Safari, a real login UI, production
migration or the overall pharmacy gates. PR 108's existing Chrome synthetic-HTTP
acceptance remains separate. PR 109 and its exhausted retry budget are untouched.
No new workflow, manual Actions rerun, deployment or merge is part of this run.
