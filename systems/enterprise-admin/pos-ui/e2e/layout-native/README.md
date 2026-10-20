# Existing POS reachability and payment cancellation

Package `STARTUP-POS-LAYOUT-CANCEL-NATIVE-20261020`, Issue #31. Stacked on the accepted staff-entry PR #158, exact base `244e0a05e7749c17c0f37cb64cb555274ab3d19e`.

## Existing contract, bounded change

Issue #31 explicitly asks for ordinary pointer reachability at 1440×900, 1024×768 and 1180×820: search, shift, total, checkout, split and clear must remain reachable with many cart rows, without page-level horizontal overflow, negative-y clipping, forced/DOM clicks or substitute Enter/F5 evidence. It also asks for fixed-viewport and touch-capable open/cancel payment evidence, unchanged cart and no checkout/inventory write. These are existing requirements, not a new payment policy.

The actual `PaymentModal` had six independently reproducible initial component failures: missing Tab containment, Escape propagation, editable/cancellable pending fields, absent non-cash entry focus, absent background isolation and cleanup focus theft from a newer PIN surface. The repair follows the existing POS dialog conventions. It enters/traps focus, contains page shortcuts, disables fields/cancel while pending, preserves IME/handled Escape, yields to the existing PIN overlay through `suspended`, and restores a still-connected/enabled opener only when it owns focus. Page wiring adds only that existing PIN state. `CartPanel` adds a total test-id for the real DOM reader. Monetary calculations, authentication/permissions, checkout commands, PIN policy, styles and lockfiles are unchanged.

## Planned native acceptance (NOT_RUN at source freeze)

Six independent cold contexts: the three specified viewports, each once with pointer clicks (`isMobile: false`, `hasTouch: false`) and once with the original Chrome mobile layout mode (`isMobile: true`, `hasTouch: true`) plus real Playwright taps. Context options, actual layout/visual viewport dimensions and scale/offsets, and touch capability are recorded and checked; touch alone cannot stand in for mobile layout. The touch-capable mode uses ordinary pointer-wheel scrolling of the existing visible scroll containers, then touch taps; it does not claim physical touch scrolling, iPad or Safari.

Each context performs the real existing employee-code login with an owned synthetic active user, then only the seven existing GET endpoints. It finds the twelfth SKU through the real search, adds twelve actual product cards using ordinary clicks/taps, checks the rendered twelve-row cart total of 240, opens/cancels ordinary payment, split payment and close-shift dialogs, and confirms the existing two-click clear. Each cancellation must preserve every rendered product name/quantity, total and discount, and return focus to its opener. The ordinary payment also exercises real Tab traversal. No confirmation POST beyond the single login is allowed by either browser or mounted server guard.

The populated cart total is also checked as a read-only visible target, after ordinary scrolling of its own cart if needed; it is never clicked merely to prove visibility. Complete controls must fit the viewport and every clipping ancestor, be rendered and visible through their ancestors, enabled and center-hit-testable after two equal valid observations. Main regions and root/body widths must fit. This reachability gate records actual target and outline sizes; it does not invent a universal 44px or 3px focus rule. Visible focus-ring certification is outside this package's claim. Native pointer movement, taps and keyboard observations are trusted browser events. No DOM scroll/forced click/zoom substitution is used.

Expected output: 54 original viewport PNGs (nine stages × six contexts), six complete geometry receipts, exact browser/server request correlation, and all 33 raw identity/permission/business tables deeply equal before and after. Twelve products and twelve released batches each retain stock 5, cost 10 and retail 20. No order, checkout command, payment, inventory transaction or other business row may appear. Each GET product response is bound to those seeded identities and values; login/context/staff are bound to the owned actor and tenant. Every active-shift response is bound to the raw owned shift, tenant, staff, status, opening/closing cash, timestamps, notes and nested actor; rehashing a forged response cannot bypass this binding.

The parent reuses the reviewed exact-owned Node22/PG15/loopback/head/tree/service gates. It drains actual HTTP before snapshot and deletion, removes only owned fixture rows, requires all 33 tables zero, and retains process quiescence plus the subsequent SKU owned-database-removal receipt. Real endpoint tokens stay in memory; login evidence records only presence and owned user identity. Private bootstrap codes are removed and hidden files are not uploaded.

## Local verification and limits

- Actual component/page/store tests: 23 PASS, including hidden/occluded/clipped total rejection by the actual native helper on the rendered twelve-row CartPanel, the native cart reader and real page→Payment→PIN cancellation wiring. Exact two base runtime files in a separate R1 negative tree: 12 real assertion FAIL / 10 PASS across the original 22 cases. The original first eleven-case run was 6 FAIL / 5 PASS.
- Related existing checkout/recovery, POS inventory and scanner-keyboard regression: 63 PASS. These preserve original financial and keyboard semantics; their API adapters are synthetic.
- Layout controls: 108 PASS. Includes exact mounted Express callback, finite request scope, malformed/forged/cancelled evidence rejection, actual wheel callback with the real Playwright polling matcher and a true three-second immovable-scroller deadline, plus the real immutable PNG writer and full runner postprocessor over 54 synthetic PNGs. Those PNG/geometry adapters are not browser proof.
- UI/QA type-check and native-driver type-check: exit 0. Playwright collection lists exactly six cases with no report/artifact output; collection is not execution.
- All sixteen original SQL migrations are exact base blobs. In-memory PGlite using the actual seed/cleanup adapter applies all sixteen, exposes 12 CHECKs, 63 live FKs and 9 triggers, accepts twelve products/batches, rejects nine actual constraint probes, and cleans all 36 interrupted seed prefixes back to 33 empty tables. This is supplemental SQL evidence, not real Prisma/PostgreSQL/HTTP/native acceptance.
- The local workspace is a partial source checkout with shared already-installed dependencies, Node24.19. The backend type-check cannot complete here because production source modules and dependencies such as cors/helmet are absent. This is recorded as an environment limitation. The full locked Node22 build/type-check remains a new-head CI gate.
- Historical local Chrome sandbox startup was blocked by the execution environment. No sandbox/network restriction is disabled. Native rendering, actual geometry, Chinese pixels, HTTP/PG acceptance and cleanup remain NOT_RUN for this package until the exact new head succeeds and the original PNGs are independently reviewed.

Local controls commands, from repository root:

```
node --test systems/enterprise-admin/pos-ui/e2e/layout-native/*.test.mjs
node node_modules/vitest/vitest.mjs run --config qa/vitest.pos-layout.config.mjs
node node_modules/vitest/vitest.mjs run --config qa/vitest.payment-regression.config.mjs
node node_modules/typescript/bin/tsc -p qa/tsconfig.pos-layout.json
node node_modules/typescript/bin/tsc -p systems/enterprise-admin/pos-ui/tsconfig.layout-native.json
```

The QA configs and optional PGlite probe are review-local artifacts, not repository production dependencies. Canonical CI separately installs backend Express and POS TypeScript/Playwright; new Node controls resolve them from those package roots rather than assuming root dependencies.

Early author harness attempts are retained: the synthetic cleanup adapter initially used a non-UUID ID, importing the runner initially lacked the existing exact-base SKU helper, and the PGlite probe initially used a cwd-relative path and incorrectly expected product/batch cost CHECK constraints that the actual SQL does not define. These were test-environment/expectation defects, not product or native failures; final probes use the actual existing constraints. The acceptance oracle independently requires the seeded nonnegative costs. The first dependency-layout copy also lacked the package-local node_modules links; after mapping only the existing POS and backend dependencies, all 70 R1 controls passed with no root dependency resolution; R2 repeats this separated layout with all 98 controls passing.

## R2 review corrections and exact old-source negatives

The R1 independent review found three acceptance gaps, not newly demonstrated native product failures: total visibility was not gated, `hasTouch` did not reproduce the original `isMobile` context, and active-shift response values were not tied to the owned raw fixture. R2 changes only the evidence driver/oracle, focused tests and this explanation; product runtime, seed, HTTP lifecycle, workflow and limits remain the reviewed R1 bytes.

R2 passes 98 controls, 23 actual component/page/helper tests, both focused type checks and six-case collection. A separate negative copy restores each exact R1 runtime in turn: one actual CartPanel hidden-total test fails, one full postprocessor missing-total test fails, one actual six-case registration test fails, and all 18 rehashed shift mutations plus one context-mode mutation fail. These are true assertion failures, not import/setup errors. The postprocessor negative removes the total receipt from all six synthetic cases so that another case cannot hide the old missing-total gap. All 486 source/QA files in the negative copy are restored to candidate bytes afterward. These are source/control results, not a native mobile or geometry pass.

## R3 deterministic raw timestamp binding

The R2 independent review replayed six genuine prior158 raw/API pairs and found a timezone-dependent oracle error: PostgreSQL raw `opened_at` has no timezone suffix, while the Prisma API emits UTC ISO. Interpreting the raw value as local time rejected the genuine pair and accepted a deliberately minus-eight-hour wire value under Asia/Taipei. R3 validates the raw timestamp-without-zone shape, explicitly applies the existing UTC interpretation, and requires the canonical wire ISO value. It does not set process TZ or change any product/DB policy.

The test fixture now uses the actual raw shape (no suffix, numeric opening cash). All108 controls pass, including genuine and plus/minus-eight-hour wire cases under UTC and Asia/Taipei, and noncanonical raw shapes. Offline replay of the original six prior158 pairs accepts the genuine pair and rejects minus-eight-hour wire values in both timezones. Restoring only the exact R2 contract in a separate copy gives two true assertion failures/four passes in the six cross-timezone cases, and the genuine-pair replay fails its expected outcome. Source files are restored afterward. This replay uses existing artifacts and is not a rerun of prior native acceptance.

## R4 existing close-shift test contract reconciliation

The first natural run at head `b7d38e875d99780d159abe1e5f0e3421ebfa1102` reports657 unit/component passes and3 failures in the pre-existing close-shift lifecycle test. All three asserted zero inert elements while a newer PaymentModal was still open; two also demanded its background heading remain accessible. Those expectations conflict with the new modal background-isolation contract, rather than demonstrating a leaked product lock.

The exact original17-case file reproduces3 failures/14passes locally. R4 keeps the late success/failure, focus, cart/amount and no-write checks, requires only the newer modal to remain interactive with its background isolated, then actually cancels that newer payment and requires every inert/aria-hidden lock to be gone and the opener restored where present. The real manager-PIN cancellation path similarly resumes payment before final dismissal. All17 cases pass and their focused type check exits0. Two isolated product mutations, missing background isolation and leaked cleanup, each produce3 genuine test failures; original product bytes are restored. No product runtime, native driver, identity/payment policy or gate is changed by this reconciliation.

At02:50 UTC the same natural run's new six-context layout step was SUCCESS; its final artifact/cleanup and independent pixel acceptance were still pending. That partial step result is not whole-PR acceptance, and source/local adapters do not replace the required hosted evidence.

## Bounded CI cost and remaining requirements

Only two steps are added to the existing selected POS SKU worker: this acceptance and its quiescent artifact upload. Its original 20-minute job limit, all fourteen jobs, selection outputs/needs, required aggregates, permissions, prior steps and final database cleanup remain unchanged. The new step is bounded at four minutes; the six-context native process has a 150-second global deadline, 90-second case deadline and no retries. Shared pacing remains 550ms with a hard 120-request cap: at most 65.45 seconds of pacing intervals. Expected nominal reads are one login + seven entry GETs + one filtered search per context (54 requests), with existing cache/refetch differences bounded by the cap. Native duration is not yet measured, so the four-minute ceiling is not a cost estimate. Failure preserves diagnostic geometry and a screenshot before closing the context; diagnostics cannot replace the original error.

This does not close all of Issue #31 or parent Issues #37/#49. Other viewport/zoom/soft-keyboard matrices, actual iPad/Safari, pharmacy equipment/printing and production acceptance remain separately unverified. Prior PR156/157/158 bounded acceptances are retained on their original heads and are not reclassified by this package.
