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

Every main entry additionally requires a real200 response for its endpoint and selected query month, linked by dispatch-time request ID, actor and browser-context ID. A previously validated same-context response may satisfy an actual cache hit; this is not labelled a fresh network response. Different routes, months, actors, contexts, cancelled responses or absent hashes cannot satisfy it. R3/R4 required three distinct full-lifecycle contexts; R5 supersedes that duplicated scheduling as documented below, while preserving distinct cold-entry contexts and per-reader navigation proofs. The existing real delayed January-response/December-view cancellation control remains mandatory.

The extracted unchanged old navigation failed nine deterministic adapter controls; the fixed driver passes those plus delayed/wrong response, unavailable-entry and proof-replay controls,55 fixture/oracle/runner tests total. The adapter deliberately leaves the old page mounted after click and URL change. This is local driver evidence, not a new native browser run. Production pages, services, fixture, SQL constraints, financial semantics,44px/3px/table gates,320-request/120-analytics ceilings,300-second deadline and workflow timeouts are unchanged from R2.

R2 retained56 real HTTP actor probes, the PostgreSQL tenant sentinels,103GET-only network entries,33 raw tables equal before/after, zero generated fixtures, zero parent business rows, quiet producers and owned database absence. R3 still requires its own natural exact-head Chrome/API/PG run, successful cleanup and independent original-image review before native acceptance.

Independent review of the unpublished R3 found one evidence-label defect: mutable driver `control.actor` did not follow a denied-token swap. R4 derives the dispatch actor by comparing the actual request Authorization against this run's generated fixture tokens in memory, then stores only the actor key. Missing or unknown credentials cannot be labelled readerA. The original dispatch identity stays attached to the request when its response arrives after credential recovery; no token or header is serialized. Two actual callback-level controls cover denied/recovered/other/missing/unknown credentials and late responses, including token-absence assertions. Restoring the old actor assignment makes both controls fail; restored R4 passes57 fixture/oracle/runner controls. This corrects test evidence provenance, not a demonstrated product authorization bypass. The October screenshot shows the month mismatch; which old DOM node was filled was not preserved, so the old-page race remains a source-supported inference reproduced by the deterministic adapter.


## R4 hosted queue failure and R5 bounded scheduling correction

Head `eea0672aa9aaa7698ef6fcfdcdd5ad54aa6fb77d`, [run39234311506 attempt1](https://github.com/skydreamer0/startup/actions/runs/39234311506), remains **FAILED** at `analytics stale transport 1366`. Cash-flow, margin and sales completed their prior single-size lifecycle. Analytics was correctly on January with actual authorized fixture rows. Its old-October transport failures and new-January requests were queued behind the unchanged2,150ms pacing. The matcher still had its independent5-second default; page timeout25 seconds does not override that matcher. The original ledger did not record cancellation/admission timestamps, so the precise hosted queue delay is not claimed as directly measured.

A real-clock control using the existing Playwright1.64.0 matcher reproduces the queue mechanism: two cancelled slots delayed the live request until6.47 seconds and the5-second expectation failed; pruning those slots admitted it at2.18 seconds and the identical expectation passed. These are local scheduling controls, not Chrome/PG acceptance. R5 checks observable request cancellation before and after waiting, aborts cancelled requests without reserving another pacing slot, and records queued/admitted/cancelled times. Live admissions retain the existing2,150ms target pacing. Cancelled attempts still count toward the original320 API and120 analytics ceilings.

All five readers now wait explicitly, up to25 seconds, for the matching context, actual dispatch actor, endpoint, query month, expected status, body hash and a request ID newer than the triggering action. Only then are the corresponding UI conditions asserted. This covers ordinary500, denied403, failed retry, authorized recovery, trend/ranking retry and initial-error/empty recovery. Main navigation alone may still cite a valid same-context cache response, explicitly labelled as such. No global matcher timeout, product retry policy or server rate limit changes.

### Coverage-preserving network deduplication

A complete five-reader role/error/recovery lifecycle runs once in one context. For each reader, success, stale500, stale recovery, real403, failed retry after denial and authorized recovery are each asserted at1366×900,1024×768 and390×844, with real Tab focus, unchanged44px/3px geometry/hit-test gates and original PNGs. Each size records the same corresponding response proof; proofs must advance between states. Supplier-ranking success/denial/recovery and initial-error/authorized-empty views also retain three-size keyboard/image checks. The five narrow table regions still require actual390 Tab/ArrowRight movement. The real held January response/December-view abort remains mandatory at390.

Separately, **three independent cold contexts**, one per size, each navigate all five real reader routes, verify their own heading/month, authenticate via actual `auth/me`, and require their own authorized first-read response. They do not replay the complete error lifecycle. Receipts expressly distinguish shared-context visual/state coverage from independent cold entry; this is not three independent full-lifecycle runs. Issues[#30](https://github.com/skydreamer0/startup/issues/30),[#31](https://github.com/skydreamer0/startup/issues/31) and[#37](https://github.com/skydreamer0/startup/issues/37) require truthful reader/tenant/error/responsive evidence but contain no requirement to repeat the entire error lifecycle in an independent context per size. This scheduling change does not close their remaining financial-policy, writer, login/device or release gates.

### Request and runtime account

The preserved R4 ledger has62 probe/bootstrap requests; its first three complete reader lifecycles used19 cash-flow,19 margin and12 sales requests, plus3 shared bootstrap requests. Repeating full network journeys at every size was estimated around415 requests after remaining readers, empty states and the delayed-response case, beyond the existing320 guard. This estimate was caught before another push and is not a full-run receipt.

The R5 planned path is62 probes +103 shared lifecycle +5 held-period requests +39 initial-error/empty requests +54 independent cold requests =263 API attempts. Cold entry has15 reader query keys across default/fixture months plus one plan query and two auth calls per context; allowing the existing one retry for every cold query gives34 attempts per context,102 total, or311 with the other planned journeys. The corresponding conservative cold-retry analytics allocation is65 attempts, at most139.75 seconds of pacing. This is a source-based scheduling allowance, not a guarantee against additional unexpected remounts/transport failures; all attempted requests remain subject to hard320/120 caps, with no retry-budget reset.

The unchanged300-second absolute deadline remains the worst-case browser-work bound: multiple slow25-second waits or geometry failures do not sum into an unlimited run; deadline closure fails the journey and proceeds to owned cleanup. Successful completion within that envelope still requires the next exact-head native run. Individual geometry3.2-second, held-response10-second and abort5-second guards are unchanged. CI step8 minutes/job20 minutes and all required checks are unchanged from R1/R2. No old-head rerun is requested. R5 source controls do not substitute for new-head Node22/Chrome/PG, all original-image review, raw33-table equality or owned cleanup.

The broader Issue#31 responsive gate also names1366×768 and200% native zoom. This package uses1366×900,1024×768 and390×844;1366×768 and native zoom remain **NOT RUN**. Shared-state diagnostics name the lifecycle or actual current viewport, not the initial width. Cold-entry and initial-error/empty failures attempt a current-size PNG before context closure; a screenshot error cannot replace the original failure or bypass cleanup.

## R5 hosted focused-edge failure and R6 scoped product correction

Head `96502ed363a28aff11340859d330a0bd7a946d43`, [run39239256423 attempt1](https://github.com/skydreamer0/startup/actions/runs/39239256423), remains **FAILED** at `cashflow recovered visual 1366`. The first five cash-flow states were checked at all three sizes. The final authorized main/trend responses returned, but Refresh focus was at y=-0.21875 with height44px, outline3px, active focus and a successful center hit. Five samples retained that top edge; the original PNG visibly clips the top/outline. The source flow had returned from390 to1366 after trend recovery. Exact document scroll positions around resize and Tab were not recorded, so which transition produced the final alignment is not established. The prior strict y≥0 assertion correctly failed; this is not relabelled a harmless rounding error.

R5 used44.22 seconds,84 API/14 analytics attempts and100 GET-only network entries. The source-bound56 HTTP actor probes, numeric/PG sentinels,33 raw-table equality, fixture0,parent33zero, process quiescence and owned database absence remain verified. No complete five-reader lifecycle or cold-entry set passed. Original failed PNG, geometry, logs and ZIPs remain preserved.

R6 applies the existing scoped nearest-focus-reveal principle to all five reader roots, including their error states. `pages/useReaderFocusReveal.ts` waits one animation frame after focus/resize, rechecks the currently focused enabled control belongs to that root, and reveals its full3px outline plus3px offset using only the minimum necessary movement. It first adjusts only the control's own scrollable ancestors, then the document viewport if needed, with actual scroll bounds. Other tables/sidebar, already-clear controls, disabled/foreign/lost-focus targets remain untouched. Unmount cancels pending work. Page-local8px CSS scroll margin supplies native focus scrolling clearance as a first layer; the measured reveal does not rely solely on browsers honoring that margin. No driver scroll or forced click is added.

The original five actual reader components fail the focused measured-top-edge controls, then pass after the product fix. Additional DOM geometry adapters cover bottom/left/right, nearest own-table movement, document clamps, no-op/disabled/foreign/lost focus, resize back and unmount.31 focus/layout controls plus76 related reader/lifecycle/disclosure cases pass; focused TypeScript passes. These are Node24/React/DOM controls with supplied geometry, not native browser reproduction. The existing reused dependency/chart-double boundaries remain unchanged. Two working-directory mistakes are preserved and are not counted as product negatives; the corrected old-source five-case RED is retained separately.

Native evidence now also records outline offset and requires the entire computed ring on **all four** viewport edges, at least6px, in addition to the original44px, active focus, center hit, page-width and table-scrolling checks. One focused guard control rejects the actual clipped top, superficially nonnegative but ring-clipped top, lower edge and both side edges. This strengthens acceptance; request caps,300-second deadline, all original journeys and cleanup are unchanged. R6 still needs its own exact-head Node22/Chrome/API/PG result and original-image review; neither the five controlled RED→GREEN cases nor passing types establishes native success.

## R6 hosted result and R7 direction-aware table keyboard evidence

R6 head `3b24e3f10805e5c9dc08a2e3e054146ab8d2c99f`, run39243140998 attempt1 remains FAILED at the suppliers390 table keyboard probe. Twelve canonical jobs succeeded; the native child and its required POS aggregate failed closed. The four preceding readers crossed their shared six-state/three-viewport sequence. Cash-flow recovered1366 now records y7.78125, height44, outline3px+offset3px, active/center hit true, and the original PNG shows the formerly clipped ring fully. All supplier success sizes and its390 table focus geometry also passed. Zero complete five-reader journeys or cold-entry sets passed; this is not whole-package acceptance.

The original supplier success390, table-focus390 and failed390 PNGs already show the rightmost Actions column. The driver unconditionally pressed ArrowRight and required increased scrollLeft. Its failure path did not save the table's before/after scrollLeft or computed direction, so reaching the exact maximum is a source/image-supported explanation, not a measured hosted fact. Source has no RTL override. A deterministic LTR right-bound adapter executes the actual frozen R6 callback and genuinely fails; it is not a new Chrome reproduction or a fabricated hosted position.

R7 changes only this driver, its controls and this README. After real Tab/focus geometry, each of the five table probes records its actual direction, size and position before pressing any arrow. It chooses the direction with room, then exercises the reverse arrow too. Both movements must be nonzero in the commanded direction, bounded, focused, stable for two valid observations and keep the page position/viewport unchanged within the existing1px vertical allowance. Unsupported RTL, missing overflow, malformed/out-of-range values, no motion, lost focus or page movement fail closed. There is no assignment to scrollLeft, forced scroll, product/CSS change or relaxed geometry threshold.

Every movement retains samples and a pre-key receipt; failure writes the final receipt and PNG before closure, preserving the original error if diagnostic capture fails. A real3200ms deadline also bounds a hung geometry read and ignores any late completion. Two directions per table add at most16 seconds of polling allowance across five tables compared with the prior one-direction probes, still within the unchanged300-second flow deadline. No additional API requests, rate change,320/120 cap expansion or workflow timeout change.

The new controls exercise the actual callback at left/right/middle positions, both keys and receipt continuation, unsupported RTL, no-movement/focus/page failures, diagnostics and a real hung-read deadline.77 fixture/oracle/runner controls pass; the frozen R6 callback right-bound negative fails. Two initial new-test failures (the preserved1px page allowance and a test object alias) were corrected and are retained separately, not reported as native failures. Existing product focus/UI suites were not rerun or modified. New exact-head Node22/Chrome/API/PG, complete cold entries and original-image acceptance remain pending.

R6 artifacts package12182643000 SHA256 `12fcea5ca45468a7fe36a0154f6bb0ee665b29fcd937965b127c99b1c54d84a7` and SKU12182243635 SHA256 `19e249b4fb1a12d2fed5b2b1978168270a2d61b51772bb99e69020e424616187` have verified ZIP digests/CRC/safe paths.357 available exact-head source hashes match.174 GET-only entries,150 API/35analytics attempts in120.96 seconds, all56 tenant/role probes and real-PG sentinels remain verified.33 raw tables before=after, fixture0, parent33zero, process quiescence and ownedDatabaseAbsent were checked. Original logs, failed PNGs and all successful earlier geometry receipts are retained; no failed SHA was rerun.
