# ADR-018: Durable POS checkout command recovery

## Status

Proposed — bounded #30 slice; Draft PR only. No production deployment or gate approval.

## Decision

- Require a caller-generated UUID commandId before the first POS submission.
  Identity is (tenantId, POS_CHECKOUT, commandId), enforced by PostgreSQL unique
  index. The command model participates in the existing tenant allowlist.
- Parse/default direct service calls just like HTTP. Hash an explicit business
  field allowlist with SHA-256 and normalization version 1. Missing discount is
  zero, missing/empty payments are equivalent, missing/empty notes are equivalent;
  optional scope IDs remain distinct from explicit defaults. Preserve item and
  payment order and separate discount lines. Exclude commandId and adminPin.
- Claim with createMany(skipDuplicates), equivalent to INSERT ON CONFLICT DO
  NOTHING, inside the same Read Committed transaction as existing inventory
  posting, order/items, payment records, movements, allocations and final result.
  A contender waits for the owner; on committed success it checks the hash and
  returns the saved JSON response before checking current shift/price/stock.
  A different hash returns 409 without extra business writes. Never catch a
  unique violation and query an aborted transaction.
- PENDING exists only inside that transaction. Rollback/crash removes the claim
  as well as every side effect. A waiting caller may then acquire the key; a
  rolled-back attempt does not permanently bind the key. SUCCEEDED commits the
  original JSON snapshot, orderId and timestamp together. Composite foreign key
  and CHECK constrain tenant/order/result identity. Single-method checkout also
  writes one payment record; these records do not execute provider transfers.
- Authenticated manage:pos result lookup is tenant scoped. Missing/uncommitted
  results return UNKNOWN, never proof of failure. Query or resend the same key
  and intent. Refunds/metadata changes do not rebuild the original response.
  Lookup includes the saved payloadHash; POS verifies the version-1 digest before
  confirming a recovered result. Backend/browser normalization contract vectors
  live in `infrastructure/api/checkout-command-hash-v1.json`.
- POS persists a frozen intent before sending. Recovery survives modal closure,
  refresh and authentication renewal; persistence failures block sending. Pending,
  unknown and conflict intents cannot be silently cleared or replaced. Credentials
  are never part of the saved command or hash.
  Known conflict remains frozen through query disconnection, 500, 401/403,
  UNKNOWN and successful lookup, including refresh and reauthentication. Query
  errors update the message without downgrading the persisted conflict; even a
  matching result hash cannot automatically resolve an already known conflict.
  `GET /pos/checkout-context` resolves tenant/user through the existing auth and
  manage:pos boundary; persisted keys do not contain the rotating access token.

## Migration and limits

### Draft follow-up: confirmed transaction abort retry (#30)

The command orchestrator may attempt the same identity/payload hash transaction
up to three times, with 10/20ms delays after completed rollback. The checkout
callback is restricted to the supplied transaction; no external payment, printing
or notification may be replayed. Read Committed isolation and claim/result replay
semantics remain unchanged. Exhaustion preserves the last original error.

Retry only Prisma P2034 or raw P2010 SQLSTATE 40001/40P01. Native PG15 exposed that
Prisma 6.19.3 returns ORM 40P01 as an UnknownRequestError containing only the complete
engine server diagnostic; accept that exact version/diagnostic shape conservatively.
Generic unknown outcomes, connection errors, timeouts and unrelated failures do
not retry automatically. Version/diagnostic changes fail closed pending new native
acceptance. The isolated evidence, side-effect audit and dedicated workflow are in
`../verification/checkout-command/abort-retry/README.md`; this remains a Draft slice
and does not complete #30 or any production gate.

20261006110000_checkout_commands is additive: it does not touch legacy quantities,
payments, orders or invent historical commands. Backend and POS contract updates
must ship together in a future approved deployment; legacy checkout clients without
commandId are rejected. Keep command results for as long as replays are possible;
no expiry/delete API or retention change is introduced.

This slice does not close #30, #29, #31 or #37 or pass G1/G2/G4. Unique order numbers,
business date, exact money, historical costs, refund reconciliation, all-writer
authority and full offline synchronization remain pending. The existing daily
last-order+1 sequence can still collide for different commands on different stock.
No automatic retry of unrelated failures, financial-provider execution or production
data access is added.

## Reference

[PostgreSQL 15 INSERT / ON CONFLICT](https://www.postgresql.org/docs/15/sql-insert.html).
