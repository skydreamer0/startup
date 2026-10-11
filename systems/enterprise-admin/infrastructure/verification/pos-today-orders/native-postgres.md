# Issue #30 / #47: native today-orders boundary acceptance

This test-only supplement to PR #114 uses the existing owned Actions PostgreSQL
15 service and `scripts/order-sequence-ci.mjs`. It adds no workflow, environment,
provider, schema, migration, credential or database harness.

Two cases are appended to `order-sequence.integration.test.ts`:

- Persist real orders immediately before/at the Taipei start and immediately
  before/at the exclusive end. Confirm timestamp round trips and call the real
  `CheckoutService.getTodayOrders` with clocks at all four instants. Assert exact
  IDs in descending order, refunded/completed statuses, item/product shape and
  unchanged stored rows. Null businessDate represents historical rows and proves
  selection stays on createdAt. The database order delegate is not mocked.
- Persist two tenants and two shifts for one tenant. Verify unfiltered and
  shift-filtered reads, and reject both directions of a foreign tenant's shift.

The existing nine sequence cases and their fault-injection extension remain.
Only the runner's native expected count/title list and success text change:
11 native (nine sequence plus two today-orders), 21 command, 38 stock, five mock.
Its pure guard tests also reject omitted, skipped, failed or substituted cases.

## Existing execution route

`.github/workflows/ci.yml` runs `order-sequence-ci.mjs preflight`, the pure guard
checks, `order-sequence-ci.mjs run`, then `cleanup` on each PR's exact head,
including stacked PRs. The run loop invokes this native file without a name
filter, so both additions must execute and pass for acceptance. Artifacts contain
native.json, tests.json, source.json, source-hashes.json, cleanup-counts.json,
cleanup.json and accepted.json under the existing order-sequence artifact name.
All URL, service ownership, empty-database, source-head, network and cleanup
checks are unchanged. Synthetic tenant cleanup is unchanged; owned database
removal remains the final acceptance gate. Do not point this suite at any other
DB or run it without the existing ownership preflight.

## Evidence limits

At Draft publication, native runtime tests, backend build and lint have not run
locally: dependencies and an approved owned Actions service are unavailable here.
Pure runner controls, context validation and diff checks can run without a DB.
Exact-head GitHub CI and independent review must be checked separately; a skipped
local suite is not database evidence. This does not establish HTTP, browser,
physical-device, store, production or full Issue #30 acceptance. No production
DB is accessed, and release/merge/deployment gates remain open.
