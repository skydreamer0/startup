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

## First hosted head and scoped R2 correction

Head `8d7dd54456ffe1a122b9e4f84348bab4bc020fc0`, [run39226904375 attempt1](https://github.com/skydreamer0/startup/actions/runs/39226904375), remains **FAILED**. All eight endpoints × seven actor cases reached actual HTTP/PG with their expected statuses and numeric oracles. The actual old relation predicate produced17844 against scoped67; supplier denominator62, same-SKU2 and legacy cross-link checks passed. Raw33-table before/after equality, exact fixture0, parent33zero, process quiescence and ownedDatabaseAbsent were retained. No complete reader viewport case passed.

The first1366 cash-flow Refresh focus had60 observations, all at height36.1875px below44px. The first outline sample was3px; the following59 were2px, with a stable final segment below the unchanged3px guard. Focus and center hit were true. The original PNG agrees. Separately, the same head's existing Admin synthetic-HTTP margin390 original full-page PNG is659px wide: the inline four-column summary and clipped table show a genuine narrow-layout gap.

R2 uses a five-page `.admin-reader-page` opt-in stylesheet, reusing the existing product toolbar's44px/wrapping contract and trace control's3px keyboard ring. It changes no global button/disabled/permission behavior. Month/sort controls wrap; cash/margin summaries use container-bounded auto-fit cards. Five named table regions scroll only their own content and enter keyboard navigation, preserving all columns rather than hiding page overflow. The native390 journey requires real Tab/ArrowRight movement for margin, sales, ABC, supplier ranking and supplier list, with actual focus, stable page position and no whole-page overflow. No driver assigns scrollLeft or scrolls to satisfy a gate.

Local CSS/DOM controls first failed12/12 on R1; seven additional grid/table controls failed before their fix. The19 controls plus76 affected reader/disclosure tests pass; TypeScript passes. These are supplemental DOM/CSS contracts, with chart doubles in the new layout test, not native layout proof.43 native fixture/oracle/runner controls include rejected stationary/unfocused/page-scrolling/overflowing table receipts. The new exact head still requires hosted Node22/Chrome/PG and independent original-image review; previous successful probes are preserved as bounded historical evidence, not a new-head PASS.

## Second hosted head and R3 driver navigation correction

Head `9a10eb127190926312a9f4395d69bb45c8de9ef7`, [run39230760686 attempt1](https://github.com/skydreamer0/startup/actions/runs/39230760686), remains **FAILED** at `margin actual entry 1366`. Cash-flow1366 reached its success, stale, real-denial and recovery path; its final focus geometry was44px high with3px outline and center hit. One earlier animation sample was fractionally below44px; the existing bounded settle retained that observation and accepted only the later valid samples. The separate synthetic-HTTP Admin job passed412 tests and53 browser cases; its margin390 screenshot is now390px wide. These do not establish complete native five-page acceptance.

The failure PNG showed the margin page still on2026-10. Its actual GET `reports/margin?period=2026-10` returned an empty October dataset, while the generated fixture and numeric oracle use2026-01. The old driver clicked the SPA link and immediately filled a global month locator, which could still resolve the old cash-flow page before React mounted margin. This is a navigation synchronization correction; no new product data or financial formula defect is claimed. The original October response and failed capture remain preserved.

R3 waits for the exact target URL and that page's own heading-containing root, then fills only its scoped month and confirms the selected value. Initial-error navigation instead waits for that page's named read-status alert root, since those error views intentionally omit the normal heading. Intermediate cash-flow navigation used to refresh inventory readers uses the same URL/root guard. There is no fixed sleep, clock change, extra forced request or internal QueryClient call. The delayed-period control also scopes and confirms its month.

Every main entry additionally requires a real200 response for its endpoint and selected query month, linked by dispatch-time request ID, actor and browser-context ID. A previously validated same-context response may satisfy an actual cache hit; this is not labelled a fresh network response. Different routes, months, actors, contexts, cancelled responses or absent hashes cannot satisfy it. The three completed viewport receipts must have distinct context IDs and valid per-reader navigation proofs. The existing real delayed January-response/December-view cancellation control remains mandatory.

The extracted unchanged old navigation failed nine deterministic adapter controls; the fixed driver passes those plus delayed/wrong response, unavailable-entry and proof-replay controls,55 fixture/oracle/runner tests total. The adapter deliberately leaves the old page mounted after click and URL change. This is local driver evidence, not a new native browser run. Production pages, services, fixture, SQL constraints, financial semantics,44px/3px/table gates,320-request/120-analytics ceilings,300-second deadline and workflow timeouts are unchanged from R2.

R2 retained56 real HTTP actor probes, the PostgreSQL tenant sentinels,103GET-only network entries,33 raw tables equal before/after, zero generated fixtures, zero parent business rows, quiet producers and owned database absence. R3 still requires its own natural exact-head Chrome/API/PG run, successful cleanup and independent original-image review before native acceptance.

Independent review of the unpublished R3 found one evidence-label defect: mutable driver `control.actor` did not follow a denied-token swap. R4 derives the dispatch actor by comparing the actual request Authorization against this run's generated fixture tokens in memory, then stores only the actor key. Missing or unknown credentials cannot be labelled readerA. The original dispatch identity stays attached to the request when its response arrives after credential recovery; no token or header is serialized. Two actual callback-level controls cover denied/recovered/other/missing/unknown credentials and late responses, including token-absence assertions. Restoring the old actor assignment makes both controls fail; restored R4 passes57 fixture/oracle/runner controls. This corrects test evidence provenance, not a demonstrated product authorization bypass. The October screenshot shows the month mismatch; which old DOM node was filled was not preserved, so the old-page race remains a source-supported inference reproduced by the deterministic adapter.
