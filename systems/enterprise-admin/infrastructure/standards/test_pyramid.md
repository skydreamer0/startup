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
and manual dispatch. It currently has nine jobs:

| Job | Coverage and important limits |
| --- | --- |
| Agent Context Validation | Context links/tracking and canonical dependency-lock boundaries. |
| Backend CI | npm audit, Prisma generation, lint/build, final Docker image and migration CLI, PostgreSQL migrations/seed/tests, and isolated final-Alpine readiness acceptance with cleanup evidence. Individual tests may still mock dependencies; a PostgreSQL service alone does not prove every feature has native DB coverage. |
| Admin UI CI | pnpm audit, ESLint, unit/render tests, production build/type-check, Docker image, and current Admin margin/ranking warning browser acceptance in the runner's official sandboxed Chrome with synthetic HTTP and no backend/DB. |
| POS UI CI | Unit/component tests, build/type-check, Docker image, real HTTP restart/lost-response recovery with isolated PostgreSQL, and fixed-subject scanner/supplier Chromium evidence. The fixed subjects are historical versions, not the current UI. |
| Product pagination PostgreSQL acceptance | Exact-head pagination regression and native PostgreSQL cases, ownership guards, and cleanup evidence. |
| Exact SKU PostgreSQL and current POS browser acceptance | Exact-head native SKU/category/provenance cases and current POS Chromium with synthetic HTTP retain their separate scopes. A dedicated stable-category Chrome slice also follows the real built POS through the unchanged HTTP/JWT/RBAC API to the same owned PostgreSQL fixture, at 1366/1024/390px; a separate stock slice at 1366/1024px verifies confirmed checkout/refund quantity, test-injected product-read 500s, manual retry and cart preservation. Native evidence and independent review are required; whole POS layout and hardware remain separate. |
| Batch audit PostgreSQL acceptance | Exact-head append-only batch audit cases and schema contracts, with owned fixture evidence. |
| Order sequence PostgreSQL acceptance | Exact-head numbering, legacy-upgrade, and checkout regression cases with owned DB cleanup. |
| Exact-head POS dialog Chrome acceptance | Official installed Google Chrome with sandbox enabled, exact-head built POS, 14 split/PIN/ordinary-payment native-input cases, locally fulfilled synthetic HTTP and sealed per-case ledgers; not real API/DB or hardware acceptance. |

The four core check names in `AGENTS.md` are the existing required-check baseline,
not an exhaustive inventory of CI coverage. Review all current jobs and applicable
security checks for the exact PR head. Inspect the actual GitHub ruleset separately
when checking enforced merge requirements; a document does not change that ruleset.

Additional workflows:
- `.github/workflows/dependency-review.yml` runs Dependency Review on PRs and rejects
  newly introduced high/critical vulnerable dependencies. Keep the existing audits
  and security checks; their results are separate from the nine-job pipeline.
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
  visual acceptance. Existing zero/empty error fallback and whole-report overflow
  are not repaired or certified by this disclosure-only slice. Physical devices,
  native zoom, screen readers, Safari and financial reconciliation remain separate.
- `e2e/category-native/run.mjs` covers the bounded Issue #49 category slice: single-SKU/empty searches and category switching retain every category entry; real keyboard/pointer activation preserves the cart and makes no checkout/write request. A synthetic active shift and signed test JWT avoid unrelated login/shift-opening writes. Browser/API response hashes and all business rows are compared before/after; exact fixture rows are removed before the existing owned-DB cleanup. Chrome sandbox, CJK glyphs, sealed ledgers and quiescent-only artifact publication are required. Independent raw/pixel review is still needed; the seven-case matrix additionally covers initial loading/error/retry, real empty
  tenant, injected 403/500, stale refetch failure/recovery and delayed real product
  responses. The 61-second stale wait and tab focus are real; error injection is
  labelled test-only and is not an auth or database-outage test. Whole-page
  responsive layout and other Issue #49 criteria remain separate. See
  `verification/pos-category-lifecycle/README.md` for the finite matrix.
- Business acceptance, real payment-provider behavior, physical scanner/touch,
  Safari/iPad, OS keyboard, native zoom, and screen-reader checks remain separate
  when relevant. CI success does not close those gates or authorize deployment.
