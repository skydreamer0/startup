# Additional isolated HTTP/PostgreSQL acceptance

Refs #204/#205 and #31/#37. Test-only candidate; not application behavior,
financial policy, browser acceptance or release approval. The existing
pharmacy-gap-native runner and tests remain unchanged.

## Scope

- Real login/API and PostgreSQL: a saved private draft cannot be read through
  detail/history/version/list or overwritten by another tenant or another actor
  in the same tenant. A read-only actor cannot create or overwrite. Every raw
  business row is compared before/after all denied operations.
- Real close/confirm races: an independent transaction holds the target row;
  two unchanged application HTTP handlers reach UPDATE and are observed waiting
  on native PostgreSQL locks through pg_stat_activity. Release must yield
  exactly 200/409, preserve the winning cash/notes/timestamp and reject later
  and cross-tenant writes. All other table rows and financial amounts remain
  unchanged. This does not settle refund/accounting/cutoff policy.

## Ownership and reproduction

Use the same isolated Linux UID/GID1000 host, Node22.23.4, npm11.21.0,
exact pinned Docker images, empty owned DB, archived committed backend,
Prisma generation and no-.env prerequisites documented in
[the original runner](../pharmacy-gap-native/README.md). No CI identity is
required or fabricated. Do not run on a production Docker host.

`backend/scripts/pharmacy-extra-native.py` is a separate copied producer with
unchanged ownership, source, internal-network, no-published-port, nonprivileged
container, read-only application mount, explicit opt-in and cleanup checks.
Its differences from the original runner are the PHARMACY_EXTRA opt-in prefix,
new test-file target/hash and the exact two new case titles. The shared
pharmacy-gap label still prevents overlapping owned jobs. No guard was removed
or relaxed. Original evidence/runner/test bytes are preserved.

Run `probe`, then only after its successful cleanup run `test` with its receipt,
using the original documented arguments and the new script path. Each mode
creates a separate fresh DB and must prove removal of its containers, anonymous
volume and network. Preserve failed attempts. New source requires a new commit,
archive, source identity and standalone probe; never reuse old-head acceptance.

No-opt-in collection must skip both cases without reading an owner file or DB.
Partial opt-in fails before app import. Explicit type check:

```
cd systems/enterprise-admin/backend
node node_modules/typescript/bin/tsc -p tsconfig.pharmacy-extra-native.json
npm test -- src/__tests__/pharmacy-extra.native.test.ts
```

A skipped no-opt-in run is a safety control, not native success. Runtime results
must identify their precise source SHA/tree and retain ownership, case, snapshot
and cleanup receipts. Independent review remains required.

## Still outside this slice

Browser cross-actor/tenant flows, native window-close and pending/unknown recovery,
Safari/touch/physical devices, full writer/data-flow AC01, business policy and
release gates remain open. No original issue checkbox or activation changes.
