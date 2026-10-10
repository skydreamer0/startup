# Issue #30: bounded retry after confirmed checkout transaction abort

Status: Draft follow-up based on master `d5dcc6c22e3bd78d8efc68f120a8546ae615534a`.
The original Issue #30, #44/#45 command recovery and #84 numbering remain intact.
No merge, deployment, schema, auth, money or refund-policy change is authorized here.

## Minimal design and side-effect audit

`CheckoutService.checkout` validates/reads using the supplied `tx`, calls
`InventoryPostingService.debitSale`, allocates the order number, writes the order,
items and payment **records**, then `recordSale` writes movements and allocations.
All these writes and the command claim/result use the caller-owned transaction.
There is no provider payment, printing, notification, network call or other external
irreversible operation in this callback. Generated row UUIDs are rolled back along
with the failed transaction. Future callbacks must preserve this requirement.

Parse the payload and compute tenant/kind/commandId identity and hash once. Re-run
that same claim/post/result transaction only after the previous transaction promise
rejects with a confirmed abort. At most three total attempts; delays are 10ms and
20ms outside the transaction. Replay still precedes current business checks and
returns the saved JSON result. Exhaustion throws the last original error.

The allowlist is Prisma `P2034`, or `P2010` with SQLSTATE `40001`/`40P01`.
Native PostgreSQL exposed an additional Prisma **6.19.3** ORM behavior: `40P01`
arrives as `PrismaClientUnknownRequestError`, with no structured error metadata.
Only this exact client version's complete ConnectorError/PostgresError diagnostic,
with server code `40P01` and severity ERROR, is accepted. A version upgrade or a
changed diagnostic fails closed until independently reverified. Free-text deadlock
mentions, other UnknownRequestErrors, P2028/timeouts, connection failures, payload
conflicts and COMMAND_UNKNOWN are propagated unchanged. They do not prove failure;
existing query/resend of the original intent remains the recovery contract.

References: [Prisma 6.19 engine error definitions](https://github.com/prisma/prisma-engines/blob/6.19.0/libs/user-facing-errors/src/query_engine/mod.rs),
[PostgreSQL 15 abort retry](https://www.postgresql.org/docs/15/mvcc-serialization-failure-handling.html).

## Native acceptance and isolation

The separate `.github/workflows/checkout-abort-retry.yml` uses a new dedicated
GitHub-hosted PG15 service and composes the unchanged `order-sequence-ci.mjs` runner.
Its preflight still requires true Actions identity, exact clean source head/tree,
loopback-only binding, exclusive network, no bind mounts, no ambient .env, an empty
owned DB, and exact equal synthetic URL opt-ins. No local Actions identity is faked.
The original 9 numbering, 21 command/rollback, 38 stock and 5 mock cases run unchanged.
The extension adds seven native retry cases, rejects omitted/substituted/failed/skipped
cases, records code/test hashes and raw logs, and accepts only after the original
runner proves zero business rows and removes the registered owned database.
Neither `.github/workflows/ci.yml` nor the original harness/tests are modified.

Seven added cases:
- Inject PostgreSQL 40001 and 40P01 twice at the **final command update**, after
  order/payment/movement/allocation/stock writes. Third attempt succeeds; replay
  returns identical JSON and never posts again.
- Exhaust each SQLSTATE at exactly three attempts; all sale/claim/counter writes
  roll back, status stays UNKNOWN and later resend of the same command succeeds.
- A nonretry server P0001 at the same late stage propagates after one attempt and
  rolls back completely.
- Six concurrent identical resends during a 40001 abort commit just one sale.
- A real two-transaction advisory-lock deadlock after all sale writes aborts the
  checkout victim. The same command retries and commits once.

The 40001 tests inject a real server transaction abort; they do not claim a naturally
occurring Serializable anomaly under the unchanged Read Committed isolation.
A test-only sequence counts attempts across rollback and is removed afterward;
it is never part of business schema or production side effects. Every case checks
command/order/item/payment/movement/allocation counts, product and lot quantities,
and counter sequence. The tests reuse the original synthetic command fixtures and
cleanup contract without editing the original 21-case file.

## Evidence and remaining gates

The first local native run was **4 passed / 3 failed / 0 skipped**: Prisma's unknown
request encoding of ORM deadlocks was not in the initial allowlist. Keep that RED
report/log, followed by the corrected run, in the bundled local evidence. An earlier
build failed because the workspace's preloaded generated Prisma client was stale;
regenerating from the unchanged schema and installing the canonical backend lock
resolved that preparation failure. No deployed DB connection was used.

Local execution is in the cloud workspace with Node22, a separately created labeled
PG15 container on an exclusive network and loopback port, and copied source excluding
all ambient .env files. Its ownership and cleanup records are distinct from GitHub
Actions acceptance. The local bundle is supporting evidence, not exact-head CI proof. `local-manifest.json`
records final source hashes and report counts; `local-evidence.zip` preserves raw RED/GREEN
reports/logs, migrations, ownership and cleanup. Corrected local native 7/7, original
native 68/68, new retry mocks 21/21 and original checkout mocks 5/5 passed. Build/lint,
agent context and ten harness/date control tests passed. All local business tables
were verified zero before only the registered DB/container/network were removed.

Exact PR source head, Actions runs/artifact links and independent nonauthor review
are recorded in the Draft PR. Passing native tests or CI does not complete #30,
financial rules, full G1/G2/G4, browser/device/hardware acceptance or production rollout.
No new browser/UI behavior is introduced; broader UI/device acceptance is NOT RUN.
