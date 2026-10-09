# SKU acceptance follow-up (2026-10-09)

## Provenance and independent review

Received remote backup/sku-acceptance-20261009-cc9d1fb at
`f9fc5c96e7af9f81b66da17e7a33580d8b2b669f`; original PR #73 deliberately remains
`08d785e9fcb2b7983e1fa4bd7b2fa565e3a92925`. Local review commit
`a439fb281fe98ede817d45e60db6972c645a35f0` is retained unchanged.

Before correction, independent source/runtime review found page-only HTTP routing,
no context WebSocket boundary, injected login state and a simulated tenant remount.
The received short-height cases reproduced four failures: Escape in order-search input,
missing payment-close focus, short-tablet cancellation clipping and short-mobile controls.
The final patch fixes these product defects and keeps the assertions strict. Mobile
geometry also distinguishes fixed-position containing blocks and visual viewport offset;
ignoring that offset sent a real tap 42px below its measured target.

## Local verification

- Chromium: 14/14 pass, no skipped/retried cases, actual employee-code UI login.
- Pure runner safety/report controls: 7/7 pass.
- Acceptance TypeScript: pass. Focused component/keyboard tests and POS type/build: pass.
- Reports, screenshots and request/key ledgers: local temporary directory
  `C:/Users/User/AppData/Local/Temp/startup-sku-local-review-20261009-final`.
  These local checks are not the Actions-only owned exact-head runner or database proof.
- Original five SKU PostgreSQL cases, safety harness and existing CI workflow are unchanged.
  Exact-head native results, migrations, row-count cleanup and source ownership must
  be checked in the new draft PR's Actions artifact before claiming that gate.

## Not run / handoff

Tenant switching has no UI entry and is NOT RUN; synthetic tenant changes do not count.
UI login uses a synthetic HTTP response, not real backend authentication. Native page
zoom, OS soft keyboard, physical scanner, Safari/iPad and production policy acceptance
remain unverified. No merge, deployment, role grant or production database action.

## First remote CI findings

Run 37881476008 at de29011125c1e92fb672818e4a0424b669c5883c passed the
unchanged five PostgreSQL cases, ownership/migrations and owned-DB cleanup, but
failed browser (13/14) and POS unit tests (260/262). Linux exposed horizontal
chooser overflow: fixed left/right used the enlarged layout viewport, beyond the
390px visual viewport. The follow-up uses an explicit bounded viewport width.
The scanner unit harness also now traverses input/other button before the body
portal using real Tab input; native Enter/Space ownership assertions remain.
This failed run is retained; only a later exact-head run can prove the final gates.
