# Original checkout recovery and money-only refund acceptance

Package `STARTUP-POS-RECOVERY-NATIVE-20261019` continues [#31](https://github.com/skydreamer0/startup/issues/31) and [#49](https://github.com/skydreamer0/startup/issues/49), on PR156 head `54c468813d29128968e388a77db793c4e8a430d2`. The broader issues remain open. Financial and identity semantics come from the existing checkout command contract and [ADR018](../../../infrastructure/adr/adr_018_checkout_command_recovery.md); this package does not define a new payment/refund policy.

## Product change

Only the existing order lookup/refund dialog boundary changes: named dialogs and controls, native keyboard order disclosure, initial/trapped/returned focus, scoped background inert/scroll ownership, bounded dialog dimensions, pending dismissal/double-submit protection, and a surviving toolbar focus target through the lookup-to-refund transition. Window POS shortcuts cannot act behind these two dialogs. IME Escape/Enter retain their default behavior. Existing amounts, reason payload, full-order money-only refund, HTTP API, permission, frozen command and cart contracts remain unchanged.

The true original-source probes found missing dialog semantics, pointer-only order disclosure, ignored idle Escape and a dismissible pending backdrop. Restoring the exact three original runtime files produced 11 failing focused assertions, with eight unaffected cases passing; these are overlapping assertions, not 11 independent defects. The new 390px layout is still a native acceptance target, not an inferred old computed-layout failure.

## Native journeys (all still NOT_RUN in the local source handoff)

Three isolated synthetic tenants use the unchanged real Express/JWT/RBAC/tenant/controller/service/Prisma application and the existing owned PostgreSQL 15 service:

1. **Query and refund:** begin at 1366×768; the genuine checkout commits and returns 201, then the driver drops only that browser response. Reload restores the same frozen intent; a genuine command GET confirms its original result/hash. At 390×844, a new cart draft remains intact through keyboard lookup, cancellation with zero refund requests, reopen and a genuine full-order refund. A 390×480 viewport tests a short visible dialog, not a real software keyboard. Pending state uses a held genuine 200 response, after the transaction has completed; Escape, Enter and backdrop cannot dismiss or duplicate it. Stock remains 4, no physical return is invented, focus returns to the toolbar.
2. **Same-intent retry:** 1024×768; the genuine first 201 is lost, reload restores it and the production API replays precisely the same command/payload. One order, item, payment, movement, allocation, command and daily sequence row result.
3. **Conflict:** 390×844; the driver first sends a genuine competing quantity-two intent under the same command, then the browser's quantity-one intent receives the production 409. A later real successful command GET cannot downgrade the known conflict or make a replacement command. This uses synthetic competing intent, not a fabricated API conflict response.

There are exactly five checkout HTTP POSTs and one refund POST, producing three orders. All payments are synthetic CASH records; there is no provider, print, device, deployment or real-store transaction. Fourteen success PNGs and six separately named focused-control geometry receipts are mandatory. Screenshots remain subject to independent original-pixel review.

The scoped order controls retain the existing POS 44px target requirement. Their visible focus uses a 2px blue outline, not a new 3px product requirement. Native checks require actual computed size, active element, center hit-test, outline and all four visible edges, including positive outline offset. Observation is bounded to 3 seconds, requires two stable valid readings and rejects late reads. JSDOM does not prove these dimensions or native focus scrolling.

## Evidence and write boundary

- Exact checkout head/tree, clean tracked source, pinned brand bytes, Node 22, installed Chrome/CJK, no `.env`, GitHub-hosted runner and original Docker ownership are checked before starting. Database must be the exact loopback owned fixture and empty before seeding.
- Each case gets one tenant, active user, OPEN shift, WALK_IN customer and released five-unit product batch (cost 10, price 20, expiry 2099). No historical order, movement, package, audit or receiving revision is seeded.
- The outer test guard accepts finite known paths and exact synthetic actor. POSTs are limited by case, ordinal, phase, shift, product, quantity and the original command/result identity. Only the expected refund reason and original returned order ID can pass.
- The actual Playwright route callback checks origin/port/method/resource/path/query, redirects, status, JSON and exact token identity. Tokens and headers are not written to evidence. The actual server snapshots method/path/phase before Express routing mutates request state. Browser/server request IDs and actual response SHA256s must agree.
- Actual response snapshots bind tenant/product/batch/cashier/shift, command ID/result/hash, amounts, quantities and raw table rows. Every checkout/refund order scalar is compared to the persisted order, each wire item to its persisted raw row, and checkout payments to persisted payments. A correctly rehashed response and stored command result cannot substitute another identity, status or amount. Retry/conflict are exact snapshot no-ops. Refund may change only order status/note/update time, preserving product/batch/payment/movement/allocation/command/counter rows. All other raw business tables remain equal.
- On finish or error, contexts mark ending, abort all registered request controllers and release response holds before close. Queued requests and post-prime continuations recheck ending/cancellation before any new API dispatch; already-dispatched real responses still undergo status/JSON validation. The response observer attaches finish/close listeners before awaiting its DB snapshot, retains any early close error, and keeps the snapshot pending until it really settles. The real HTTP server must drain before after-snapshot or fixture deletion. Cleanup removes only recorded synthetic tenant IDs, in FK order. A drain failure denies deletion. Disconnect, private-bootstrap removal, immutable reports and signal disposal are independently attempted once; later failures cannot replace the first failure.
- PNGs are captured as buffers then written with `wx`, as are JSON receipts. No screenshot path overwrite, repeated evidence name or final report rewrite is allowed. Failed-stage captures precede context close and cannot erase the primary error. The runner publishes only after owned processes are quiescent and the private bootstrap is removed. The subsequent original SKU cleanup must additionally prove the database absent; fixture-zero alone does not prove database removal.

## Bounded cost and canonical wiring

The existing selected SKU job gains one step (maximum 5 minutes), after stock and before medicine/package, plus a quiescent artifact upload. The 14 jobs, four stable required names and their selected-child aggregates, path planner, permissions, credentials, prior steps, and existing 20-minute SKU job timeout are unchanged. This package does not enable Actions in other repositories or modify billing.

The dispatch cap is 180 actual API attempts, with 550ms spacing (at most 110/minute), beneath unchanged POS 120/minute and app 300/minute settings. Canceled queued requests consume no dispatch slot and are never replayed. At maximum count, spacing consumes 98.45 seconds; this is not a prediction of total runtime. Native execution has a hard 180-second global deadline, each case 90 seconds, each HTTP call 20 seconds and server drain 20 seconds. The surrounding 5-minute step includes source/type/collection/build and cleanup. Existing job 20-minute limit remains the ultimate cap; slow infrastructure can fail closed rather than silently extend it. Prior run timing is not a guarantee.

Canonical commands, from `systems/enterprise-admin`, are:

```sh
node --test pos-ui/e2e/recovery-native/*.test.mjs
node pos-ui/e2e/recovery-native/run.mjs
```

Do not launch the native runner against an arbitrary or populated database. It deliberately rejects local emulation of its ownership variables. There are no new dependency or lock changes. Canonical CI installs the existing backend/POS dependencies separately; the new control tests use Node built-ins and repository modules, and native child paths resolve from the actual backend/POS directory.

## Local evidence and limitations

The author ran the five related real React/QueryClient suites (80 initial passing cases plus two subsequent page handoff cases), focused restored-source controls, product/browser TypeScript, actual Playwright collection (three cases), real Node HTTP/callback/writer/finalizer/oracle controls and existing 51 selective-CI controls. These are supplemental Node 24/shared-existing-dependency results. The handoff records every exact command, hash, failure and restoration. No chart, service or production-auth substitute is introduced into the native package.

Local complete backend type-check and actual POS build are **not passed**: the materialized checkout lacks some unchanged backend imports and existing dependencies, and the existing local mapping lacks `@tailwindcss/vite`. No stubs or lock changes hide those failures. Browser collection initially exposed a config/test ESM loader interaction; removing the config's contract import fixed collection, and a source guard binds the literal deadline to the contract value. Native Node 22/Chrome/PostgreSQL and pixel evidence remain **NOT_RUN** until the new exact-head canonical run.

The R1 independent source review found three acceptance-tool gaps: response money/identity was not fully bound to DB values, teardown could admit a queued/post-prime POST, and a client close during the awaited snapshot could be missed. R2 corrects all three in the actual oracle, callback and server observer. Exact R1 runtime controls reproduce 14 oracle false acceptances, two extra-dispatch failures and three response-lifecycle failures. These are synthetic/Node-loopback counterexamples, not a native production failure diagnosis. Collection now explicitly uses the list reporter, produces no native JSON report, and still enumerates the same three cases.

Still outside this bounded slice: employee barcode/PIN login UI, tenant-selection UI, full POS responsive redesign, 200% zoom, physical touch/software keyboard, iPad/Safari, hardware scan/camera/printing, split/provider payments, offline queue, editable held-cart persistence, production database and deployment. The three cases are different journeys at specified viewports, not three independent runs of every journey. Existing PR153–156 evidence stays valid only within its original scope; this package does not close #31/#49 or widen the prior acceptance.
