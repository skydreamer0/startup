# Isolated Admin financial/inventory readers

Package: `STARTUP-READERS-NATIVE-20261019`, related to Issues #30/#31/#37.
Base: PR #154 head `96074f13bb43d083d1fe5ef267709ef6d40e60d7`.
This candidate's native PostgreSQL/Chrome status is **NOT_RUN** until the exact
submitted head produces and independently passes the hosted evidence below.
Prior #146/#148 synthetic reader evidence and #154 trace acceptance do not prove
this candidate. No Issue or operational gate is automatically closed.

## Product contract

- Margin, sales ranking and ABC query both OrderItem's order and product under
  the existing actor tenant. OrderItem itself has no automatic tenant extension.
- Supplier ranking raw SQL constrains order, product and supplier; numerator,
  denominator, product count, median, categories and sorting cannot include a
  second tenant. Legacy foreign category/supplier labels are unavailable.
- Cash-flow's existing current-cost receipt proxy excludes a foreign product
  behind a legacy same-tenant movement. Existing estimate formulas, defaults,
  rounding, refund treatment and disclosed historical-cost limits are unchanged.
- The three reports now share the existing `useGuardedRead` owner/denial contract
  with inventory analytics and supplier list. AbortSignal reaches all five report
  HTTP calls. Ordinary 500 may retain authorized data with a stale notice. Once
  401/403 denies a query, later 500/remount/canceled success cannot revive its
  data; only a non-aborted authorized success for that owner recovers it. Actor
  keys cannot reuse another actor's data. Trend/ranking retries stay query-local.

## Fixture and native driver

`backend/scripts/admin-readers-{fixture,oracle,native}.mjs` is composed into the
existing guarded package runner after trace acceptance. Original SKU, package,
camera, stock, reconciliation and medicine-label flows remain mandatory.

Three newly owned UUID tenants supply A, B and an authorized empty cohort. A/B
share SKU and supplier display names; B's large amounts and foreign contact/name
sentinels expose leakage. Legal legacy simple-FK cross-links exercise order item,
receipt product and category/supplier boundaries. Role grants are persisted in
PG; fixture JWTs omit embedded permissions and are never written to evidence.
See [the full constraint review](CONSTRAINT-REVIEW.md) and
[migration byte inventory](migration-constraints.json), including SQL-only CHECK,
composite FK and deferred/append-only triggers outside Prisma's DSL.

The native package checks all eight GET endpoints for A/B/empty 200, no JWT 401,
missing read grant 403, suspended actor 401 and a B JWT plus A header 401. It also
checks both revenue/quantity sorts. A oracle totals are revenue 67, current cost
16, margin 51, cash inflow 67/outflow 7/receipt proxy 5; supplier denominator is
62 after excluding a foreign supplier link. These are synthetic current-estimate
values, not approved finance policy.

A real-PG negative control reconstructs the old unscoped relation predicate,
restricted only to this fixture's owned order IDs. It returns 17,844 versus the
correct A value 67. Old raw supplier denominator 17,844 differs from 62. Actual
current API responses must agree with scoped PG/fixture rows. This is not a claim
that the old deployed application was rerun against a store database.

Built production Admin routes `/reports/cashflow`, `/reports/margin`,
`/reports/sales-ranking`, `/inventory/analytics` and `/suppliers` run at
1366×900, 1024×768 and 390×844. The driver exercises actual authorized responses,
transport-only injected 500/stale data, real role-denied 403, failed retry and
recovery. Existing broad report Refresh is the real UI route for invalidating
inactive inventory-reader caches; no test code invokes internal QueryClient or
changes the clock. Initial failure and authorized empty are separate 390 cases. A held real margin
response at 390 proves browser abort and that old-period data cannot replace the
new period; its actual body/hash are retained in `admin-readers-late-scope.json`.

Keyboard focus uses bounded observed geometry settlement, never driver scrolling
to satisfy a gate. It preserves the existing outline ≥3px and transparent-color
exclusion, 44px target, viewport/sidebar bounds, center hit and no page overflow.
Original PNGs and measured samples are saved before context teardown; failure
screenshots are attempted while the page remains available. A deadline closure
may prevent a screenshot and is always a failure.

## Read-only and failure evidence

Network allows GET only to the owned loopback origin. External fonts are blocked
and installed Noto CJK is used. Tokens/headers/error messages/stacks are not
serialized. Before/after full raw snapshots cover every public business table
(at least 33) and must be deeply equal. Exact-ID fixture cleanup must leave zero
owned rows even after a partial seed failure. A preexisting-ID collision cannot
acquire cleanup authority. New created permission IDs are absent-ID checked;
existing global permissions are never deleted by this child journey. The parent
still proves zero rows, process quiescence and owned database removal.

Primary files: `admin-readers-native.json`, `admin-readers-responses.json`,
`admin-readers-pg-negative.json`, `admin-readers-fixture-oracle.json`,
`admin-readers-before.json`, `admin-readers-after.json`, `admin-readers-cleanup.json`,
geometry JSON and original PNGs. Parent `source.json`, `source-hashes.json`,
`captures.json`, cleanup and final SKU receipts bind the exact head/run/attempt.

## Bounded runtime and CI impact

- No rerun/dispatch is required for old successful heads. A new Draft head runs
  normal CI; all four required names and all selected child gates remain intact.
- Analytics requests use one 2,150ms queue, respecting the unchanged 30/minute
  server limit. Ceiling: 120 analytics requests (at most 258 seconds of pacing),
  320 total API requests. These ceilings are safeguards, not promised counts.
- The new reader flow has a 300,000ms absolute budget. Crossing it closes its
  browser contexts, prevents further queued dispatch and proceeds to failure
  cleanup. Each browser wait is bounded; retries remain the existing one retry.
- Only `package_native.timeout-minutes` changes from 5 to 8; the job remains
  capped at 20 minutes. Prior exact #154 package/build step took about 155 seconds
  (run 39217078066, 07:45:07.982–07:47:43.041 UTC), leaving about 325 seconds in
  the new 8-minute envelope. This is a planning reference, not a speed guarantee.
  If PG/cleanup itself stalls, the existing workflow timeout/always cleanup is
  the final guard; no cleanup failure is ignored or reported successful.
- Added work consumes actual hosted runtime, capped by the above limits; no
  fabricated dollar/minute estimate, rate change, runner/billing change, extra
  permission or optional-skipped required check is introduced.

## Reproduction and evidence layers

Use the repository's canonical locked dependencies. Backend service controls:
`npm --prefix backend test -- readers-tenant-isolation product-analytics`.
Admin focused tests: `pnpm --filter admin-ui test -- reportReadLifecycle
reportReadErrors marginReportWarning cashFlowWarning adminPages.smoke`. Node controls:
`node --test backend/scripts/admin-readers-*.test.mjs`.
The composed native command remains the existing guarded `package-browser-acceptance.mjs`.

The pre-publication cloud materialization is partial and uses existing Node 24
supplemental dependencies. 14 new lifecycle cases use real React/QueryClient/
AuthContext/report pages and HTTP-boundary doubles; charts are shape stubs in
that test only. Existing `reportReadErrors` remains a rendering-snapshot test with
a mocked guarded hook. `marginReportWarning` retains real Recharts with its
existing fixed ResponsiveContainer; QA-only module aliasing isolates the reused
Recharts 3.8 and shared React copy, avoiding two React instances. That is not the
production bundle selected by the declared Recharts ^3.10.1 range and canonical lock. No QA aliases/runtime copies are shipped.
Focused source/test TypeScript and service controls likewise do not replace
Node 22 locked build, actual HTTP middleware, PostgreSQL or hosted Chrome.

Login/logout UI, store roles, actual store data, physical scanner/printer/camera,
Safari/iPad, native browser zoom, financial reconciliation and release acceptance
remain outside this synthetic package.
