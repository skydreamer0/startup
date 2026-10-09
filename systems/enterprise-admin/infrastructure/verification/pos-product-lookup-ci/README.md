# Exact SKU acceptance in ordinary CI

This acceptance supplements the existing five jobs. The original pagination job's
six mocked and eight PostgreSQL cases and the pinned historical scanner/supplier
browser suite remain unchanged.

## Separate evidence boundaries

- PostgreSQL: execute the unchanged five cases in `pos-product-lookup.integration.test.ts`.
  This proves exact, case/whitespace/leading-zero-sensitive SKU lookup beyond 100 fuzzy
  rows, including zero-stock retrieval and concurrent tenant isolation.
- Chromium: run the submitted source head's actual POS app against declared synthetic
  HTTP fixtures. This is browser UI evidence, not real API/database end-to-end evidence,
  physical scanner acceptance, or production/hardware validation.
- Product has no barcode field. These checks do not establish manufacturer-barcode support.
  Duplicate exact-SKU UI candidates are defensive synthetic fixtures, not a claim that
  the production schema permits duplicate tenant SKUs.

## PostgreSQL safety contract

The Actions-only harness requires Node 22, a clean exact-head checkout, a dedicated
GitHub-hosted job service, and both DATABASE_URL and POS_PRODUCT_LOOKUP_DATABASE_URL
exactly equal to `postgresql://test@127.0.0.1:55435/checkout_http_recovery_pos_lookup_ci`.
It checks Docker container identity, the disposable PostgreSQL 15 image, single-member
job network, loopback-only published port, unprivileged mode, no host bind mount,
synthetic test user and no password. This trust setting applies only to this disposable
service, not an existing database or security configuration.

Preflight refuses a reused ownership record or nonempty public schema; it never resets
an existing database. Before migrations the Prisma connection's actual server IP, port,
user, database and server version must match the verified service. Only repository
migrations are applied; there is no general seed. Every original test title must appear
exactly once and pass. Skips, substitutions, omissions and failures cannot produce
acceptance. Cleanup rechecks source/run/service ownership, records every business-table
row count, drops only its registered database, and verifies its absence. Failure still
attempts owned cleanup, but never produces passed acceptance.

## Runtime and limits

Do not run this harness against a workstation, real store, existing API or ambient DB.
Local `node --test backend/scripts/pos-product-lookup-ci.test.mjs` exercises only pure
safety/report negative controls; it does not connect to PostgreSQL or launch a browser.
Runtime acceptance comes only from the exact-head GitHub-hosted job and its artifacts.
Do not mark the work complete based on historical green jobs or static checks alone.


## Current-head browser contract

`pos-ui/e2e/sku-acceptance/run.mjs` records the final candidate SHA/tree, source hashes,
run/attempt and a fresh invocation nonce before typechecking, building the actual POS
source and starting its owned Vite preview. The old pinned UI subjects are not reused.
The preview binds only 127.0.0.1:4276 with API proxy and HMR disabled. Playwright blocks
service workers. The BrowserContext network fixture covers all pages, popups
and WebSockets:
HTTP interception is installed before navigation, service workers are blocked and every
WebSocket is closed without connecting. Only enumerated read-only synthetic API
routes, owned built static assets and locally fulfilled known font stylesheets are
allowed. The sole expected write is the employee-code login form's POST, checked for
exact origin/path/body and fulfilled locally once. All other write methods, unknown API
paths and external requests abort and fail the case, including unload-time attempts
before the context closes. Tokens are never injected into storage. Login uses the
actual POSLoginPage controls and a synthetic response; this does not prove backend
authentication. There is no real AI, transaction, production API or database behind this
UI suite. A dedicated negative control probes new-page fetches, the first popup request
and WebSockets.

**Tenant switching: NOT RUN.** This POS has employee switching and a customer-display
window, but no tenant-switch UI. Artificial route changes, remounts and changing a fixture
tenant are excluded as tenant-switch acceptance. The native PostgreSQL tenant-isolation
cases remain a separate boundary. `ui/accepted.json` carries this limitation explicitly.

The fourteen cases cover exact leading-zero SKU absent from a 100-row list, reverse
replies/repeated scans, manual edit/cleared draft cancellation, actual UI staff login, restored
unknown intent, native Tab/Enter/Space and cancel/F2/F7 ownership, payment-modal blocking
and cancellation, loading/empty/fuzzy/zero-stock/403/500 states, and candidate controls
at 1366×768, 1024×768 and touch-enabled 390×844. Related category stability is checked
without expanding this slice to all category API/error/refetch requirements.

The text-size case doubles the root font and asserts actual candidate computed text
size doubles, with clipping/operation checks. This is a **200% text-only stress test**,
not devicePixelRatio, CSS transform or a claim that native browser page zoom was tested.
Native 200% page zoom remains not run. Candidate 44×44 CSS-pixel dimensions and visible
keyboard outline are measured; touch uses native Playwright tap. Screenshots are the
actual synthetic-data app at each relevant state, not mockups. Their existence alone
is not visual PASS: independent review must inspect them, and complete mobile POS
layout, focus-trap design and all #31 visual requirements remain separate work.

Each case preserves a screenshot, network/key-event ledger, browser viewport, failures
and relevant metric attachments. The JSON report must contain all fourteen exact titles,
with one successful attempt each, no skip/retry/expected failure or global error.
The process owner supervises the typecheck/build/browser process groups and waits for
quiescence; there is no adoption of an existing web server. `completion.json` is retained
on failure. `ui/accepted.json` only describes successful bounded UI checks, while the
root `accepted.json` describes PostgreSQL + owned DB cleanup. Neither is whole-system
acceptance. The CI job must pass both, including final cleanup; no green claim is valid
from one artifact alone.

References: [#31 UI rules](https://github.com/skydreamer0/startup/issues/31),
[#48 SKU scope](https://github.com/skydreamer0/startup/issues/48),
[#49 category scope](https://github.com/skydreamer0/startup/issues/49), read 2026-10-09.
These issues and their wider acceptance gates are not closed by this test-only slice.


### Short-height and focus additions

The payment cancellation case checks the original checkout trigger's focus immediately
on close, before any scan/fill/focus operation. It records the active element and does
not substitute later scanner focus for modal restoration.

A six-candidate 1024×600 / doubled-text case measures the last candidate and cancellation
against the viewport and every overflow-clipping ancestor. It records ancestor geometry,
scroll dimensions, hit-test results and screenshots. Tab navigation is real browser input;
the pointer cancellation uses only bounded native wheel input and a verified visible
coordinate. No force click or programmatic scroll creates access. Product fixes bound the chooser
in a body portal, scroll the list/cart normally and keep the payment actions in a
visible footer. Escape works from dialog inputs and payment unmount restores the opener.
A touch-enabled 390×480 pressure case checks candidate, cancellation, checkout and payment
confirmation/cancellation reachability. It never submits payment. This reduced viewport
is **not** an OS soft-keyboard simulation or proof of real mobile keyboard behavior.
Any actual inaccessible control or missing focus restoration is a failure, not a reason
to omit the case or relax its assertions. The user-authorized corrections are included in this follow-up. Screenshots preserve
the visual viewport (no full-page resizing); touch coordinates account for its offset
after native scrolling. Geometry still checks every applicable clipping ancestor and
the visible hit target.
