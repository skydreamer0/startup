# Testing Strategy & Pyramid

## 1. Context
To maintain a high deployment velocity without sacrificing stability, we follow the **Test Pyramid** principle advocated by Google and ISTQB. Tests must be automated, deterministic, and required to pass before any code is merged (CI Gate).

## 2. The Test Pyramid

### 2.1 Unit Tests (The Base - 70% Volume)
- **Scope**: Single functions, pure components, and isolated utilities.
- **Characteristics**: Very fast, no external network or DB calls (mock everything).
- **Target Coverage**: `> 80%` line coverage for business logic. This is a design target, not a measured pass claimed by the current default CI; report coverage only when the coverage command and its results were actually checked.

### 2.2 Integration / Contract Tests (The Middle - 20% Volume)
- **Scope**: Database interactions, API layer bounds, and BFF-to-Backend contracts.
- **Characteristics**: Tests the "glue" between components. May use an in-memory DB or Dockerized DB (Testcontainers).
- **Goal**: Ensure the data flows correctly between our internal boundaries.

### 2.3 End-to-End (E2E) Tests (The Top - 10% Volume)
- **Scope**: Critical user journeys (e.g., User Login, Admin creating a new User role).
- **Characteristics**: Browser automation exercises critical journeys in a controlled environment. Identify whether it uses synthetic HTTP fixtures, a real isolated API/PostgreSQL service, or staging; those scopes are not interchangeable.
- **Rule**: Only write E2E tests for the absolute most critical paths to avoid maintenance nightmares (flaky tests).

## 3. Pull Request Requirements
- A PR that introduces new features must include corresponding Unit/Integration tests.
- A PR that fixes a bug must include a regression test proving the bug is fixed.


## 4. Current CI Test Gates

The execution source of truth is `.github/workflows/ci.yml` at repository root.
It runs for every PR, including stacked PRs, plus pushes to `master` / `main`
and manual dispatch. It has fourteen jobs when all groups are selected: one change planner, one unconditional context check, eight existing product workers plus the receiving worker, and three required aggregates. The coverage table groups those workers under their stable required names:

| Job | Coverage and important limits |
| --- | --- |
| Agent Context Validation | Context links/tracking, canonical dependency-lock boundaries, and the Python-standard-library synthetic OCR evaluator contract (unit tests, control/negative CLI exit checks, and repeat-byte determinism). No OCR engine or real-image accuracy. |
| Backend CI | npm audit, Prisma generation, lint/build, final Docker image and migration CLI, PostgreSQL migrations/seed/tests, and isolated final-Alpine readiness acceptance with cleanup evidence. Individual tests may still mock dependencies; a PostgreSQL service alone does not prove every feature has native DB coverage. |
| Admin UI CI | pnpm audit, ESLint, unit/render tests, production build/type-check, Docker image, and current Admin 53-case report/trace/import/reader/private-receiving browser acceptance in the runner's official sandboxed Chrome with synthetic HTTP and no backend/DB. |
| POS UI CI | Unit/component tests, build/type-check, Docker image, real HTTP restart/lost-response recovery with isolated PostgreSQL, and fixed-subject scanner/supplier Chromium evidence. The fixed subjects are historical versions, not the current UI. |
| Product pagination PostgreSQL acceptance | Exact-head pagination regression and native PostgreSQL cases, ownership guards, and cleanup evidence. |
| Exact SKU PostgreSQL and current POS browser acceptance | Exact-head native SKU/category/provenance plus ten reviewed package cases and current POS Chromium with synthetic HTTP retain their separate scopes. A dedicated stable-category Chrome slice also follows the real built POS through the unchanged HTTP/JWT/RBAC API to the same owned PostgreSQL fixture, at 1366/1024/390px; a separate stock slice at 1366/1024px verifies confirmed checkout/refund quantity, test-injected product-read 500s, manual retry and cart preservation. A package slice also follows built Admin maintenance → real production API → owned PG15 → built POS at 1366/1024/390px, covering manual confirmation, unknown conversion, stale revision and manual-input handoff/focus; fixture-issued JWT excludes login UI. Its camera extension follows generated fake video through real canvas/local WASM, explicit package lookup and revision confirmation to the same real API/owned PG fixture; it does not use physical camera hardware. Native evidence and independent review are required; whole POS layout and hardware remain separate. |
| Batch audit PostgreSQL acceptance | Exact-head append-only batch audit cases and schema contracts, with owned fixture evidence. |
| Order sequence PostgreSQL acceptance | Exact-head numbering, legacy-upgrade, and checkout regression cases with owned DB cleanup. |
| Private receiving PostgreSQL acceptance | Exact-head ten native PostgreSQL/real-auth HTTP cases for private actor/tenant drafts, competing creates/CAS, composite FK, append-only history, failed snapshot rollback and GET readback, followed by seven bounded real Chrome journeys through the built Admin login/API to the same owned PostgreSQL service. The browser flow covers 1440/390 save/reopen/history, two-page same-revision CAS with the loser choice displayed, lost-response GET recovery, same-tenant second-actor empty-list isolation, unsaved cancellation and malformed URL rejection. It does not verify saving a new revision after the CAS choice, opening another actor's saved draft/history, cross-tenant browser isolation, pending/unknown navigation protection, or read-only PUT rejection. After-snapshots are retained only after owned-process, app-handler and server quiescence; otherwise the receipt says the after-state is unverified. No fixture JWT, synthetic HTTP, production data, inventory posting/payment, or device coverage. |
| Exact-head POS dialog Chrome acceptance | Official installed Google Chrome with sandbox enabled, exact-head built POS, 19 existing split/PIN/ordinary-payment/manual-input cases plus four camera cases in this candidate (23 total), locally fulfilled synthetic HTTP and sealed per-case ledgers; not real API/DB or hardware acceptance. Camera cases use generated fake Y4M with real video/canvas/pinned local WASM; physical media/permissions remain separate. |

The OCR step runs `python3 -I scripts/ocr-evaluation/verify.py` against the existing
job checkout (the PR merge commit on pull requests), using the runner's installed
Python 3.10+ and synthetic text fixtures only. The verifier runs the unit suite,
requires control `PASS` / exit 0 and negative `FAIL` / exit 1, and rejects unexpected
exit codes, failing/empty/skipped tests or nondeterministic CLI output. Its own
nonzero exit fails the job; no `continue-on-error` or unconditional success wrapper
is used. The summary is printed to the CI log; detailed files under
`$RUNNER_TEMP/ocr-evaluation` are temporary, not uploaded artifacts. This does not
run an OCR model, validate real images or close Issue #37's business acceptance
gates. See `scripts/ocr-evaluation/README.md` at repository root for the contract.

The four core check names in `AGENTS.md` are the existing required-check baseline,
not an exhaustive inventory of CI coverage. Review all current jobs and applicable
security checks for the exact PR head. Inspect the actual GitHub ruleset separately
when checking enforced merge requirements; a document does not change that ruleset.

Additional workflows:
- `.github/workflows/inventory-fefo-trace.yml` runs the joined FEFO checkout and
  read-only capped batch trace test on the exact PR head in an owned PG15/Node22
  Docker environment. It requires one native pass, zero skips, both Prisma pool
  shutdown markers and owned DB/container/network cleanup. Ordinary backend
  skips do not satisfy this gate; broader inventory and hardware gates remain open.
- `.github/workflows/checkout-abort-retry.yml` adds isolated exact-head #30 acceptance
  by composing the unchanged Actions-only sequence/command/stock rollback harness
  with seven retry cases (real deadlock, server abort injection, exhaustion and
  same-command resend). It preserves ownership guards, zero-row checks and owned
  DB removal; generic unknown outcomes do not retry. See
  `../verification/checkout-command/abort-retry/README.md`. This remains a Draft
  slice and does not complete #30 or any production gate.
- `.github/workflows/dependency-review.yml` runs Dependency Review on PRs and rejects
  newly introduced high/critical vulnerable dependencies. Keep the existing audits
  and security checks; their results are separate from the ten-job pipeline.
- `.github/workflows/argon2-compat.yml` is intentionally restricted to the named
  Argon2 compatibility branches. A skip on another branch is not fresh Argon2
  compatibility evidence and is not a general backend regression pass.
- Service-managed checks such as CodeQL can exist outside repository workflow YAML;
  inspect the PR checks rather than inferring their absence from this file list.

## 5. Browser and acceptance boundaries

- The Admin warning runner installs Ubuntu `fonts-noto-cjk`, verifies fontconfig
  coverage and records actual Chrome platform glyphs for each disclosure capture.
  Computed CSS, text bounds and green automation alone do not establish readable
  Chinese pixels; independent screenshot review remains required.

- POS Vitest includes only `src/**/*.{test,spec}.{ts,tsx}`. Playwright specs use their
  own runner; JSDOM is not proof of native browser focus, geometry, or accessibility.
- CI already installs Chromium and runs the bounded HTTP recovery, fixed-subject UI,
  and current SKU browser harnesses above. Do not describe browser CI as wholly
  absent, or generalize those harnesses to unrelated screens and new dialog changes.
- The broad `pnpm --filter pos-ui run test:e2e` suite is not run by the default
  pipeline. It still needs a browser and its configured backend/seed prerequisites;
  do not report it as passed from the narrower CI jobs. Adding it as a gate requires
  a separate change proving deterministic setup and bounded data ownership.
- `e2e/dialog-acceptance/run.mjs` is dedicated to the submitted dialog source;
  prior local socket denial remains NOT RUN and is never retried or bypassed.
  The bounded dialog runner installs Ubuntu `fonts-noto-cjk` and verifies CJK
  font availability; screenshots still require independent actual-pixel review.
  Camera additions retain the same owned process, sealed network/keyboard, CJK,
  exact-case and no-retry guards. Fake Y4M generation/reader checks and camera
  cleanup/provenance/geometry guards run in run.test.mjs. Four camera journeys
  require ten affected captures: live video, confirmed evidence and explicit
  package choice at three widths, plus denied-camera recovery. Browser counts
  are planned until the submitted head actually runs; unit success is not Chrome
  or physical-camera acceptance. No new API/schema or native PG gate is added.
- Browser downloads require access to the relevant Playwright/CDN hosts or a valid
  pre-populated cache. A denied launch or unavailable prerequisite is BLOCKED / NOT
  RUN. Do not bypass security restrictions or relabel it as successful verification.
- Report source head, execution commit/tree, subject version, command, result, and
  retained evidence. A failed, cancelled, missing, or unexpectedly skipped stage is
  not a pass. Do not mix counts across historical, mocked, native DB, and browser runs.
- The separate `pos-ui/e2e/admin-margin-warning/` driver uses the existing locked
  Playwright dependency and the GitHub-hosted runner's installed official Chrome,
  with `chromiumSandbox: true`, no custom launch flags and no browser installation.
  Its actual built Admin subject must match the submitted head for all application,
  dependency and harness inputs, even when CI executes a merge commit. It covers
  both report warnings at desktop/narrow viewports across loading, empty, success,
  initial failure, refetch failure/recovery, period and ranking-sort changes, with
  keyboard and pointer toggles. Synthetic HTTP, bundled fonts/system CJK fallback,
  no API proxy, clean child environment and owned loopback process bounds are
  explicit. Google font CSS is stubbed rather than downloaded. Screenshots and
  geometry are retained; actual pixels need independent review before claiming
  visual acceptance. The integrated cases.mjs declares 53 cases: the 46 cases retained from merged
  master c4e6307 plus seven private receiving journeys. The retained baseline is
  24 original report/batch-trace cases, nine import-dialog cases and 13
  Supplier/InventoryAnalytics reader cases from #148. The reader cases cover
  initial retry, 401/403 cached-data hiding, both analytics tabs and supplier
  identity changes; they use synthetic HTTP and cannot establish real RBAC/PG.
  This is no longer a disclosure-only suite. Whole-report layout and financial
  correctness are not globally certified by these bounded flows. The seven receiving
  journeys in this synthetic Map-backed suite remain separate from the seven native
  browser journeys in the private receiving worker. The latter follow real login,
  Admin API and the owned PG fixture but are bounded to the cases listed below; they
  do not establish the whole receiving-draft lifecycle. The former retain product
  paging, review invalidation, navigation protection, list refresh failure and other
  UI-only controls. Do not add their counts together as one run. Physical devices, native
  zoom, screen readers, Safari and financial reconciliation remain separate.
- `e2e/category-native/run.mjs` covers the bounded Issue #49 category slice: single-SKU/empty searches and category switching retain every category entry; real keyboard/pointer activation preserves the cart and makes no checkout/write request. A synthetic active shift and signed test JWT avoid unrelated login/shift-opening writes. Browser/API response hashes and all business rows are compared before/after; exact fixture rows are removed before the existing owned-DB cleanup. Chrome sandbox, CJK glyphs, sealed ledgers and quiescent-only artifact publication are required. Independent raw/pixel review is still needed; the seven-case matrix additionally covers initial loading/error/retry, real empty
  tenant, injected 403/500, stale refetch failure/recovery and delayed real product
  responses. Headed official Chrome uses an owned Xvfb display (no ambient DISPLAY, no TCP);
  the 61-second stale wait and tab focus are real; error injection is
  labelled test-only and is not an auth or database-outage test. Whole-page
  responsive layout and other Issue #49 criteria remain separate. See
  `verification/pos-category-lifecycle/README.md` for the finite matrix.
- Business acceptance, real payment-provider behavior, physical scanner/touch,
  Safari/iPad, OS keyboard, native zoom, and screen-reader checks remain separate
  when relevant. CI success does not close those gates or authorize deployment.

### Private receiving acceptance scope

`backend/scripts/receiving-drafts-ci.mjs` guards the dedicated Actions-owned PG15 fixture before deploying candidate migrations. The ten cases in `backend/src/__tests__/receiving-drafts.integration.test.ts` use production Prisma/services/auth routes. Append-only snapshots are retained until the verified disposable database is dropped; triggers are never disabled. Seeded product rows are compared in full; initially empty order/batch/movement/payment tables remain empty.

`backend/scripts/receiving-drafts-browser-native.mjs` runs after those ten native cases and before the same worker drops its owned DB. It uses `admin-auth-fixture.mjs` for real Argon2 credentials and persisted role grants, then drives a sandboxed installed Chrome through the actual Admin login form, built UI, production API middleware and PostgreSQL. The runner refuses execution unless the prior ownership/test evidence, exact head/tree, loopback-only Docker service and canonical hosted runtime match. Its seven browser cases require no fixture JWT or synthetic API responses: 1440/390 draft save/reopen/history, two-page same-revision CAS with one `200` and one `409` and the loser choice displayed, lost-response GET recovery without a repeat PUT, one same-tenant second actor's empty-list view, unsaved cancellation, and malformed URL rejection. The CAS loser does not save a follow-up revision. The browser does not open another actor's saved draft/history, test cross-tenant isolation, exercise pending/unknown navigation protection, or attempt a read-only actor PUT. These limits are part of `browser-accepted.json`; this is bounded coverage, not complete private-draft lifecycle acceptance. Raw before/after business rows are retained with password/hash/token/secret fields redacted; row equality covers all tables except the explicit fixture-user login bookkeeping fields and append-only auth/draft rows. The fixture product and every financial/business table must remain byte-for-byte unchanged. Partial before/after diagnostics and API response rows are retained on failure; after-state is explicitly unverified unless the owned process tree, application handlers and server are confirmed quiet/closed. PNGs record actual Chrome CJK glyphs and need independent pixel review. No posting, payment, security-policy, production-data, or device changes are accepted; append-only draft receipts remain until the existing owned-DB drop.

Seven other receiving journeys extend `pos-ui/e2e/admin-margin-warning/receiving-drafts.spec.ts` while retaining the prior 46 cases. They remain backed by synthetic HTTP Map persistence and cover product paging, review invalidation, dirty/pending/unknown navigation protection, list-refresh failure and related UI-only controls. Their 14 PNGs require independent CJK/focus/geometry review. The two browser suites are complementary evidence and are not one combined run. Original #31/#37 posting/OCR/device gates remain open.


## Conservative pull-request CI selection

The CI change plan uses the checked-out immutable execution commit and its ordered
parents. It diffs the actual first parent against the submitted second parent,
including stacked PRs, with NUL-delimited local Git output (no API file-count cap).
Only modified root README.md/LICENSE can omit heavy workers. Modified ordinary Admin source selects Admin. Receiving UI/domain/API and the
shared Admin browser harness select Admin plus Backend, including the native
receiving PostgreSQL worker; modified POS source selects Backend,
POS, native PostgreSQL/API and dialog workers. Backend, shared types, dependency
metadata, infrastructure, other harnesses and unknown paths run all workers.
Added/deleted/renamed files, empty/unreadable diff, malformed event, master pushes
and manual dispatch also run all. Agent Context Validation always executes.

Required names Backend CI, Admin UI CI and POS UI CI are always-running aggregates.
They require a successful plan and success from every selected child; unselected
children must be explicitly skipped. Missing, cancelled, failed or unexpected
skipped results fail closed. A not-applicable aggregate is not test execution.
Checkout-abort and FEFO remain separate workflows with PR-only concurrency; this
change does not claim they are included in the four required status contexts.
Dependency/security workflows and repository rules are unchanged.

The reviewed POS evidence preflight authenticates only the fixed execution commit
metadata request with the existing short-lived contents:read workflow token.
Browser execution receives a run/attempt/commit/tree/ordered-parent/QA-blob-bound
proof plus its preflight output digest, never the token. API errors still fail;
there is no anonymous fallback, moving-ref lookup, or cross-run proof cache.
This is CI provenance and scheduling validation, not additional product, native
PostgreSQL, physical-device, or screenshot acceptance. See the CI reliability ADR.

### Combined receiving/camera/CI integration

The receiving worker uses the Backend selection output and is an explicit child
of required Backend CI. Its failure, cancellation, missing result or unexpected
skip cannot produce a successful aggregate. The original worker commands,
exact-head ownership checks and cleanup are retained. Package acceptance enumerates
all public tables dynamically, so the two additive receiving tables participate
in both the empty-fixture and cleanup checks; historical table counts are not
integrated evidence. New integrated native acceptance must use the combined
schema and source, rather than reusing separate PR artifacts.
