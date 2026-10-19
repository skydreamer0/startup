# Product-scoped batch trace: owned native acceptance

Scope: #29/#31/#37, based on integration #153 at `3599b489921fe001e137d1c2d2d130571ab6dd3d`. A separate stacked change connects actual product → scoped batch row → existing read-only receipt/sale trace, with a mandatory journey in the existing SKU/package native worker. No workflow, required-check, API, schema, dependency, permission or deployment setting changes.

## Regression and reproduction

New `admin-ui/src/__tests__/productBatchTraceJourney.test.tsx` first fails all four cases on the base without the scoped trace entry. It covers accessible opening/focus return, cancelled old-product reads, changed identity and revoked permission. A refetch regression independently failed when fetching/success notifications coalesced. Selection now invalidates on the query cache's synchronous matching fetch action, rather than transient observer state or a possibly equal timestamp. Controls cover updated rows, structurally shared same-millisecond results, failed reads and unrelated-product reads. Existing `productBatchNavigation.test.tsx` and `batchTrace.test.tsx` remain applicable. Run through the existing frozen pnpm workspace and Admin test command. The existing Admin type/build check remains required.

`backend/scripts/admin-trace-native.test.mjs` validates receipts and negative cleanup behavior, including setup failure with successful cleanup and cleanup failure that must reject. These are controls, not native PG/browser proof.

`backend/scripts/package-browser-acceptance.mjs` invokes `admin-trace-native.mjs` after its unchanged GitHub-hosted Node22, exact clean HEAD, owned loopback PostgreSQL15, previous native-worker evidence and official sandboxed Chrome guards. Use existing natural PR CI. Never spoof ownership, substitute an ambient database, disable sandboxing, add credentials or rerun an old successful SHA just for this evidence.

## Native journey contract

- Fresh generated synthetic product/batch/customer/order/allocation and reader identities, with a second tenant and denied role. Fixture JWTs omit embedded permissions to exercise unchanged middleware database role lookup. Tokens are never saved. Failure diagnostics retain only fixed operation stage and allowlisted exception class/code, never raw message, stack or Prisma metadata. Linked IN receipt fixtures carry explicit synthetic cost1, as required by the unchanged SQL receipt CHECK. Setup directly seeds fixtures; login, receipt posting and sale posting are not asserted.
- At1366/1024/390: actual product pagination and low-stock filter, scoped signed batch quantities, native keyboard horizontal scrolling to the negative quantity, visible keyboard focus/Enter on trace, real receipt and latest100/total132 allocations. Compare ordered IDs, quantities, links, timestamps and Taipei dates with DB/API. Timestamp ties exercise the ID tiebreaker. The current catalog has no separate sort control; existing server order is used.
- Back/Forward/reload, dialog focus trap/return, authentic response held at outer HTTP transport and released after cancellation while product B's empty trace is current. Held body is real; injected500 is explicitly synthetic and recovers through real HTTP.
- Actual role403 and cross-tenant404 in the trace UI hide old rows and recover. Missing UUID404, foreign-batch404 and unauthenticated401 are real browser fetch probes, not login/logout UI acceptance.
- Application traffic is GET-only to the owned local API/static origin. Unexpected methods/origins abort and fail. All public business tables are snapshotted before/after the read-only journey; exact equality is mandatory. Parent all-table-zero and owned-process/database cleanup gates remain intact.

## Evidence and acceptance state

Before exact-head hosted execution and independent receipt/pixel review, native status is **NOT_RUN**. Node24 supplemental JSDOM/type checks and guards do not establish Node22/frozen-install, Chrome, JWT/API or PostgreSQL behavior. UI-test counts cannot pass this native gate.

Required artifacts:
- Parent `source.json`, `source-hashes.json`, `captures.json`, API ledger and final report: exact head/tree/run/attempt/runtime; all-table `before-counts.json`/`after-counts.json`; owned process/DB cleanup.
- `admin-trace-native.json`, `admin-trace-responses.json` (raw API bodies/hashes), `admin-trace-negative-http.json`.
- Equal `admin-trace-before.json`/`admin-trace-after.json`: complete raw tables including fixture rows, not an empty-schema claim during the journey.
- `admin-trace-fixture-cleanup.json`: fixture deletion and zero generated-identity remainder. Cleanup errors emit failed status and force rejection, never inferred success.
- Original CJK PNGs: signed quantity, visibly focused trace entry and source dialog at each viewport; actual denied/cross-tenant states at390. Pixel review is separate from geometry assertions.

The source dialog scrolls;132 allocations are intentionally truncated to100 by the existing API. DOM/API assertions cover all100 returned rows, while a viewport screenshot cannot show all100. Touch/soft keyboard, Safari/iPad, native200% zoom, pharmacy devices, genuine inventory, login UI and operational #31 acceptance remain **NOT_RUN**. No mother Issue is closed by this package.

## First hosted attempt and consolidated correction

PR154 head `32214c1e8bf8cea473800bcf6edee77a91e8a45f`, run39210396292 attempt1, failed before the new trace browser journey. The linked receipt fixture omitted `costPriceAtReceipt`; the existing `20261006100000_atomic_batch_receipts` SQL CHECK requires it to be non-null/nonnegative. Original stage-only diagnostics discarded the inner DB exception, so no exact original SQL error code is claimed. A local negative control now captures the actual runner createMany input and rejects the missing cost against that unchanged constraint. The corrected fixture supplies synthetic cost1; schema and guard remain unchanged.

That failed attempt still recorded successful generated-fixture cleanup, all33 parent tables zero and quiescent owned browser processes; the SKU cleanup reports owned DB deletion. No trace cases or GET journey were accepted. `databaseGrantLookup` now stays false until an actual successful trace read. A separate Admin CSS contract failed on the comma inside `:is(th, td)`; two explicit fully-scoped selectors retain equivalent styling without weakening the original test. The final corrected head requires fresh native evidence and independent pixels; these corrections alone do not pass it.
