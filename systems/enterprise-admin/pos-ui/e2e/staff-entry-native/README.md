# Existing POS employee-code entry, bounded native acceptance

Issues #31, #49 and #37. This package follows the delivered PR157 head
`a1d7ecbe8a6879f4208bb2aa94e27e4fb450b570`. It does not close those parent issues.

## Runtime change

Only `src/pages/POSLoginPage.tsx` changes application behavior:

- The existing employee-code textbox receives its programmatic accessible name.
- A component-owned request identity and AbortController prevent duplicate pending
  submissions and stale/unmounted response publication. A changed stored session
  also invalidates the pending result. Cleanup cancels the request and focus timer.
- Only `success === true` plus a non-empty string `data.accessToken` is accepted.
  Existing generic failure/reset/focus/retry behavior and full-page navigation stay.

The unchanged endpoint remains `POST /api/v1/admin/pos/staff-login`. Employee-code
lookup, active/deleted status, JWT signing, default-tenant resolution, server-side
role hydration and `manage:pos` enforcement are not edited. No PIN, credentials,
role policy, permission setting or tenant-selection feature is introduced.

## Owned native contract

Three independent fresh browser contexts cover 1366×768, 1024×768 and 390×844.
Each starts with no session, reaches `/login` through the real router, checks blank
input, rejects an actual suspended employee and an unknown synthetic code, then
uses the actual active employee code. The real 200 response is held only long
enough to inspect the pending UI; it is not replaced, fabricated or replayed.
After release the application stores the returned token and performs its real
full-document navigation. Existing POS products, categories, staff, shift,
checkout-context, recommendations and reorder reads must complete. A full reload
must make a fresh checkout-context read and retain the same session.

The browser is never seeded with a JWT. The parent verifies the actual returned
JWT with the existing signer verifier, binds it to the owned active user, and
requires subsequent requests to use a token issued by that real login. Raw tokens
remain in process/browser memory and the application's existing localStorage;
they are absent from ledgers, screenshots, bootstrap, console diagnostics and PR
text. The browser computes a transient one-way fingerprint solely for reload
comparison; only the equality boolean is retained. Login response evidence uses
a fixed token-free projection on both sides. Query strings and unknown paths are
never recorded. No headers, arbitrary login fields or error messages are copied.

Only login POSTs plus the seven exact existing POS GET routes are allowed. No
checkout, refund, customer creation, shift open/close or print endpoint is allowed.
The fixture creates a disposable tenant with the existing `default` slug because
this existing kiosk login resolves that tenant before authentication. It creates
one active and one suspended synthetic employee, one existing `manage:pos` role
relation, a pre-opened shift and the original product/batch fixture (quantity 5,
unit retail 20, cost 10). The test does not invent a new tenant-selection policy.

Before seeding every migrated business table must be empty. Before/after raw
snapshots of all 33 schema tables must be exactly equal, including identities,
roles, permissions and audit tables. The oracle binds response users, all entry
identity reads and the product to those rows. Only exact owned fixture IDs are
removed. Admitted HTTP requests are owned before invoking the real app. Client
close before an async handler finishes retains ownership; an unobserved terminal
handler fails the bounded drain and prohibits fixture deletion. HTTP drain comes
before the after snapshot and deletion. Final table counts must all be zero,
process cleanup quiescent, and the unchanged subsequent SKU cleanup must prove
that the owned database was dropped.

## Evidence and budget

- Three journeys, six named stages each, 18 immutable PNGs and three paired input/
  button geometry receipts. Actual screenshot buffers use the existing `wx`
  writer; collection uses `--reporter=list` and cannot prewrite the final report.
- CJK glyph provenance, fixed viewport dimensions, complete enabled ≥44px hitboxes,
  active keyboard focus and center hit are checked. Native outline width/color
  are recorded for visual review. This new driver does not impose a made-up
  3px focus rule or certify visible focus rings from jsdom/source styles.
- One serial worker, zero retries, Chrome sandbox enabled, no video/trace or
  automatic screenshot writer. Browser global deadline is 120 seconds; the new
  CI step is capped at 3 minutes, including types/build/fixture and cleanup.
- Shared pacing is 550 ms (below the unchanged POS 120/minute limit), with at most
  120 dispatched API calls, including cancelled attempts already sent. Maximum
  reserved pacing delay is 119×550 ms = 65.45 seconds. Expected normal journey
  reads are 9 login POSTs plus two seven-route entries per context, before any
  genuine duplicate reads; 120 is a hard upper cap, not a predicted cost.
- Only two steps are added to the existing selected SKU worker. Its 20-minute job
  cap, all 14 jobs, four required check names, selected-child aggregation,
  dependency installs, permissions and existing test commands remain unchanged.
  No manual workflow dispatch/rerun or skip token is introduced. Wall-clock cost
  is not yet measured; the additional step may fail the unchanged overall job
  cap if runner timing leaves insufficient room, rather than silently skipping.

## Local controls and limitations

Actual component suite: 25 PASS (23 new plus two pre-existing). The first four
source defects were reproduced as real failures before editing. Replacing the
component with the exact base version against the expanded selected controls
produces 14 FAIL / 4 PASS / 7 unselected; restored candidate passes. Missing abort
API produces a TypeError in two negative cases; do not call every failure an
AssertionError. The jsdom navigation diagnostic is suppressed in component tests;
those tests do not prove real navigation.

Driver/oracle controls: 76 PASS, including the real mounted Express guard and real
Node HTTP early-client-close scenario. Mutating the actual observer to retain raw
login bodies makes both secret-projection controls fail. Prematurely settling a
closed handler makes both drain controls fail. Original source is restored after
each mutation. These loopback controls use synthetic responses, not production
login/JWT/PG substitutes.

Commands from repository root:

- `node --test systems/enterprise-admin/pos-ui/e2e/staff-entry-native/*.test.mjs`
- `node node_modules/typescript/bin/tsc -p systems/enterprise-admin/pos-ui/tsconfig.staff-entry-native.json`
- `node node_modules/vitest/vitest.mjs run --config qa/vitest.staff-entry.config.mjs`
- `node node_modules/typescript/bin/tsc -p qa/tsconfig.staff-entry.json`
- `STAFF_ENTRY_UI_OUTPUT=/tmp/staff-entry-collection-preview node node_modules/@playwright/test/cli.js test --config systems/enterprise-admin/pos-ui/e2e/staff-entry-native.config.mts --list --reporter=list`

The `qa/` commands/configs are isolated reviewer support, not committed production
files. Local Node is 24.19.0. Existing shared dependencies are used without install;
the frozen candidate's root symlink points to the existing startup integration
node_modules. Express controls resolve from `backend/package.json`, matching CI's
separate backend install rather than requiring POS/root Express. Focused component
and driver types pass; collection lists exactly three tests and creates no report.
The partial source checkout lacks backend modules/dependencies, so full backend
types are NOT VERIFIED locally. The real Vite build attempt fails to resolve the
missing local `@tailwindcss/vite`; this is not a native or product pass. Canonical
CI installs the unchanged locked dependency graph and must perform both full
fixture types and the actual bundle build before running the browser.

Native Chrome/PostgreSQL, the actual login and page geometry, and original-pixel
review are **NOT_RUN** until a new exact-head natural run supplies them. Synthetic
loopback and component controls must not be reported as native acceptance.
1440×900, 1180×820, 200% browser zoom, soft keyboard, iPad/Safari, real staff accounts,
full POS responsiveness, tenant selection, printers/BLE/Windows and production
DB/deployment remain outside this bounded proof. PR157's accepted receipts remain
unchanged and are not evidence for this new login journey.


## R2 concentrated review correction

Independent R1 review found one fail-closed driver cleanup defect: a disposal
rejection could mask an earlier status/body/fulfill error, and the API controller
would remain registered. Both new API and pinned-brand branches now preserve the
first error, record only a constant secondary diagnostic, and always release API
controller ownership. A standalone disposal failure still fails acceptance,
including after a cancelled real response. No inherited package or application
runtime changed in R2.

The 13 new actual-callback disposal controls pass; replacing only the callback
with the exact R1 version gives 8 real failures and 5 passes. Restored source and
all affected 76 controls pass, and driver types pass. The prior 25 UI results and
SQL/fixture review remain bound to unchanged source. Native is still NOT_RUN.
