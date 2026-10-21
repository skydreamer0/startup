# pos-ui Module Context

## Purpose

`pos-ui` is the React + Vite point-of-sale interface. It owns cashier-facing workflows, POS state, POS service calls, and POS UI tests / Playwright flows.

## Read this first for

- POS checkout, cart, payment, settlement, or shift UI work.
- POS state/store/service changes.
- POS unit, integration, or E2E test failures.

## Directory map

| Path | Purpose |
| ---- | ------- |
| `src/api/` | POS API clients and request helpers. |
| `src/components/` | POS UI components. |
| `src/components/ui/` | Lower-level reusable UI primitives. |
| `src/hooks/` | POS hooks. |
| `src/lib/` | POS utilities. |
| `src/pages/` | POS screens. |
| `src/services/` | POS workflow services, including checkout intent and offline transaction ledger modules. |
| `src/store/` | POS state management. |
| `src/__tests__/` | POS unit/integration tests. |
| `e2e/` | Playwright E2E tests. |

## Source-of-truth documents

| Need | Read |
| ---- | ---- |
| POS roadmap / status | `../ROADMAP.md` |
| Backend API contract | `../infrastructure/api/api_spec.md` |
| Shared types | `../packages/types/MODULE.md` and `../packages/types/src/` |
| POS planning history | Use `../ROADMAP.md`, ADRs, and git history; completed POS execution plans are not kept in the active working tree. |
| Agent route selection | `../../../docs/agents/navigation.md` from repo root |

## Common task routes

### Lookup reviewed manufacturer/package identifiers

Read ADR-024 and `../infrastructure/api/product-packages.md`. The explicit
`components/PackageLookupDialog.tsx` reuses BarcodeCandidateButton and re-resolves
the chosen revision before cartStore.addPackage applies reviewed base units.
Unknown conversion cannot add; editing, scope/draft/pending transitions and
unmount invalidate choices. Manual/image evidence handoff is explicit, and
`services/gs1Proposal.ts` only reads observed GS1 boundaries as read-only proposals.
Legacy SKU scanner matching/timing remains intact. Verification/current device
limits: `../infrastructure/verification/pos-manufacturer-barcode-contract/README.md`.

### Change checkout or cart behavior

1. Open the nearest POS page/component/store/service files.
2. Use `src/services/checkoutIntent.ts` for checkout payload assembly and `src/services/posOfflineLedger.ts` for offline sync behavior before adding page-level workflow logic.
3. Read backend API spec if requests or persistence are involved.
4. Open nearest POS tests or E2E flow.
5. Update context if workflow meaning, task routing, or API contract assumptions change.
6. Checkout recovery uses `src/store/checkoutRecoveryStore.ts`, `src/hooks/useCheckout.ts` and `CheckoutRecovery`. Authenticated checkout context scopes the frozen pre-submit intent to tenant/user, independently of modal and token renewal. Pending/unknown/conflict blocks cart mutations. Query verifies the saved normalized payloadHash before clearing only the confirmed intent. Known conflict requires manual investigation and stays frozen through failed/successful lookup, reauthentication and refresh; it cannot be downgraded to unknown or automatically confirmed. See ADR-018 and `e2e/checkout-recovery.spec.ts`. Full offline synchronization remains separate.

### Split payment and manager PIN keyboard ownership

`SplitPaymentModal` owns its focus, cancellation and function keys while editable;
loading disables editing and cancellation without changing the frozen checkout intent.
`POSCheckoutPage` suspends that dialog while the existing `AdminPinModal` is open.
The PIN dialog owns its Tab/Escape events and returns to split confirmation on cancel.
Dynamic payment-row changes and backdrop clicks recover a valid dialog focus target;
the page also blocks its checkout/function shortcuts while payment/PIN is open, even
if focus unexpectedly reaches the document body. The guard preserves native Enter
activation on controls inside the active dialog; ordinary PaymentModal stays real
in the page integration regressions rather than being replaced with a static mock.
Background inert/ARIA attributes are restored when the split overlay unmounts.
See `src/__tests__/SplitPaymentModal.test.tsx`, `POSCheckoutPage.split-dialog.test.tsx`,
`SplitPaymentModal.lifecycle.test.tsx` and
`../infrastructure/verification/pos-split-dialog/README.md` for bounded synthetic
verification and the historical blocked local Chromium/native-device boundary.
The dedicated `e2e/dialog-acceptance/run.mjs` is the current exact-head official
Chrome/synthetic-HTTP route; it has its own report/ledger guards and never reruns
the historical browser subject as evidence for the new dialog source.

### Change refund or physical-return behavior

1. Read API spec §3.8 and ADR-015. `posApi.refundOrder` registers a monetary refund status; it does not restore physical inventory or execute a payment-provider transfer.
2. Keep `RefundModal`, order lookup, checkout toasts and shift-report labels consistent with refund registration. Actual goods receipt/inspection is a separate pending workflow.
3. Use `e2e/checkout-flow.spec.ts` for the real checkout-to-refund flow; backend PostgreSQL cases verify unchanged product/lot/movement/allocation balances and competing refund requests.

`e2e/stock-native/run.mjs` is the opt-in exact-head CI path for Issue #49 AC1/AC2,
reusing the owned SKU PostgreSQL service and unchanged production API. Two sandboxed
Chrome journeys cover confirmed quantities, test-injected product GET 500s,
keyboard/pointer retry, new-draft preservation and money-only refunds. Response
hashes, independent DB snapshots and exact-tenant cleanup are required; the final
SKU cleanup separately proves owned DB removal. See
`../infrastructure/verification/pos-confirmed-stock/README.md`. Login, unknown/conflict
native recovery, narrow-phone and physical-device acceptance remain separate.

### Verify frozen recovery and narrow refund dialogs

`e2e/recovery-native/README.md` describes the separate exact-head owned-PG path
for real lost-response query/replay, real conflicting checkout and a 390px
money-only refund. Its three journeys do not replace every viewport/device gate.
`useOrderDialog` is scoped to order lookup/refund: named native controls, keyboard
ownership, pending cancellation protection, background leases and return focus
through the surviving order toolbar. Financial, identity and frozen intent
semantics are unchanged. Source controls are supplemental; only a successful
new-head native run plus raw API/DB, geometry, original pixels and final owned
cleanup establishes this slice. Employee login, full POS responsive layout,
200% zoom, touch and actual devices remain separate.

### Change scanner matching or asynchronous scan behavior

1. Start with `src/hooks/useBarcodeScanner.ts`, its nearest test, `POSCheckoutPage` and `cartStore`. Automatic additions require one exact string match on SKU or a barcode already present in supplied candidates. Do not treat a single fuzzy search result as exact.
2. The hook keeps valid concurrent scan intents through product/callback rerenders. Search onChange passes its native event: matched insertText continues an unfinished keyboard source and pauses earlier effects; Enter completes it, while paste/delete/direct changes or a gap >300ms cancel older intents. Clear/hold/recall advance the in-memory draft revision. Pending/unknown/conflict or authenticated checkout scope changes permanently invalidate older requests and partial input, including ABA; unmount suppresses their results/errors. Scanner-driven search clearing does not cancel another valid scan.
3. Keep `barcodeService` timing/hardware policy unchanged. Actual Product has no barcode field; scanner fallback now uses literal tenant-scoped `/pos/products/lookup?code=...` via `api/productLookup.ts`. Ordinary `/pos/products` remains a name/SKU substring search limited to 100. `BarcodeCandidates` is ephemeral explicit selection UI; the scanner hook owns cancellation and revalidates the callback. See `../infrastructure/api/pos-product-lookup.md`. Optional barcode fixtures verify conditional matching only, not complete manufacturer-barcode lookup support.
4. See `../infrastructure/verification/pos-scanner/README.md` for RED/GREEN unit evidence and untested browser/native-input/hardware boundaries. Stock freshness, responsive layout and broader #31/G0 remain separate.
5. Historical focused-input RED at `8824dd4` is retained. Source/completion/cancellation correction passes 44 scanner cases, focused 91/91 and full POS 193/193 with type/build. Independent review is pending; these are synthetic JSDOM/unit results, not browser/hardware or full scanner acceptance. A capped quantity must not claim +1 success.

### Scanner keyboard ownership

Native controls own their activation keys: page shortcuts ignore interactive targets
and already-prevented events; the decoder excludes non-input controls while retaining
search-input scans. A completed scan consumes Enter before the page checkout shortcut.
`POSCheckoutPage.scanner-keyboard.test.tsx` combines the real page, scanner hook,
decoder and cart with synthetic API/shift adapters to exercise Tab, Enter and Space.
It is not browser or physical scanner evidence.

### Debug POS test failure

1. Read the failing unit/integration/E2E test.
2. Open only referenced POS files.
3. Read backend docs/source only if the failure crosses the API boundary.

4. For the pinned scanner/supplier browser acceptance suite, use
   `e2e/ui-evidence.config.mts` and
   `../infrastructure/verification/reviewed-ui-browser/README.md`. This suite
   verifies immutable UI subjects with guarded synthetic HTTP; its report,
   network/key-event evidence and screenshots share `test-results-ui-evidence/`.

### Verify current SKU browser behavior

Use `e2e/sku-acceptance/run.mjs` only through the exact-head ordinary CI job.
It builds this submitted POS app and owns a loopback Vite preview with no API proxy;
BrowserContext HTTP/WebSocket guards cover all pages/popups and reject unexpected
traffic. Login uses the actual employee-code UI with a locally fulfilled synthetic POST;
there is no tenant-switch UI, so tenant-switch browser acceptance remains NOT RUN.
Candidate lists and short-mobile cart controls scroll normally; payment close restores
the opener. See the ledger/geometry checks before changing fixed-position containers.
This is separate from the historical pinned scanner/supplier suite and from the five
native SKU PostgreSQL cases. The bounded 1366/1024/390px and doubled-text checks do not
establish complete POS visual, real API-to-DB, iPad/Safari or physical-scanner acceptance.
See `../infrastructure/verification/pos-product-lookup-ci/README.md`.

### Change category navigation

Use `GET /pos/categories` and the scope-keyed `pos-categories` query in `POSCheckoutPage`.
Never derive navigation from filtered or capped `/pos/products` rows. `CategoryNav`
keeps All plus tenant categories visible through search/selection; loading, empty
and retryable error states stay separate. Synthetic coverage lives in
`POSCheckoutPage.inventory.test.tsx` and `CategoryNav.test.tsx`; backend route/service
coverage is `pos.categories.test.ts`. These do not replace real database or device acceptance.

`e2e/category-native/run.mjs` is the owned exact-head GitHub-hosted acceptance
route. Headed official Chrome uses a fresh owned Xvfb display for actual tab
visibility; ambient DISPLAY is rejected and sandbox/quiescence remain required.
`category-native/native-context.ts` owns a fresh Chrome server/profile per case and
attaches to its default context with public CDP `noDefaults:true`; a second-session
focus-disable command cannot release Playwright's original capturer. A standalone
about:blank preflight and per-case trusted hidden/visible receipts validate this
prerequisite before application acceptance. HTTP/WebSocket/SW guards and actual
owned-server closure remain mandatory. `category-native/static-assets.mjs` pins
only the existing manifest and its declared icons; source/response bytes, MIME
and hash are verified, without widening API or arbitrary JSON access.
Its finite seven-case matrix retains stable navigation at 1366/1024/390px
and adds loading, explicitly injected category 403/500, manual retry, real 61-second
stale expiry/native tab focus, delayed real product reads and a real empty fixture
tenant. API/body hashes, complete DB snapshots and exact fixture cleanup are
required. Injection is test outer middleware; 403 presentation is not authorization
acceptance. No production DB, login or tenant-switch UI is involved. See
`../infrastructure/verification/pos-category-lifecycle/README.md`.

### Change POS API calls

1. Read `../infrastructure/api/api_spec.md`.
2. Open the relevant `src/api/` or `src/services/` files.
3. Open affected stores/pages/tests.

## Commands

Image decoding uses exactly `zxing-wasm@3.1.2` from the canonical pnpm lock.
After building POS, run `pnpm --filter pos-ui exec playwright test --config
e2e/image-scan.config.mts` from the system root for real local Chrome/WASM,
synthetic business HTTP, failed-asset retry, explicit selection, warm offline
decoding and close/reopen clearing at 1366/390/1024px. Output lives under
`e2e/test-results-image-scan/`. These are viewport checks, not physical-device
acceptance; cold offline startup, Safari/iPad and device resource budgets remain open.

Run from `systems/enterprise-admin/pos-ui/`:

Install through the system-root pnpm workspace (10.34.6), using only its root
pnpm-lock.yaml; do not create a package-lock or nested pnpm lock here.
See `../infrastructure/standards/dependency_management.md`.

```bash
npm run test
npm run test:e2e
npm run build
```

For the opt-in real HTTP restart/lost-response suite, use
`npm run test:e2e:http-recovery:types` then `npm run test:e2e:http-recovery` with
explicit `POS_HTTP_RECOVERY_DATABASE_URL`. It creates isolated synthetic fixture
databases and owns the API/POS processes; do not supply a store or existing server.
See `../infrastructure/verification/checkout-command/http-restart/README.md`.

## Do not assume

- Do not read admin UI unless the task involves shared behavior or shared components.
- Do not change backend assumptions without checking the API spec and relevant backend module.
- Do not infer POS roadmap completion from UI files; read `../ROADMAP.md` first.

### Opt-in scan evidence (M0-A first slice)

`src/services/scanInput.ts` contains pure keyboard/manual text adapters using
`ScanResultV1` from `@pharmasaas/types`. `barcodeService.onScanResult` emits the
pre-trim keyboard buffer only at the existing accepted Enter gate; `onBarcode`
and the cart hook still receive their original trimmed string. No UI, lookup,
cart or inventory consumer subscribes to the new stream. USB means the keyboard
route, not verified hardware; unknown bytes/symbology/FNC1 are not inferred.
Manual capture returns evidence only, without dispatch. See ADR-022.

### Manual scan evidence dialog

`src/components/ManualScanDialog.tsx` is the first manual text UI consumer of
`captureManualScan`; it does not subscribe to the USB stream. The toolbar entry
opens only a temporary read-only evidence view. Clipboard text replaces the whole
draft before textarea newline normalization, with JSON-escaped literal display.
Closing/unmounting discards it. An explicit lookup handoff opens the reviewed
package flow; capture itself has no lookup, dispatch or storage side effect.
The page blocks scanner effects and shortcuts while the dialog owns focus. Scanner
blocked transitions call `cancelBarcodeInput` to cancel partial sequences as well
as invalidate late lookups, preserving the existing Enter/300ms/min3 gate. See
ADR-022 and `ManualScanDialog.test.tsx` / `POSCheckoutPage.manual-scan.test.tsx`.
Browser/hardware and broader M0 gates remain unverified by these synthetic tests.

### Local image scan evidence

`ImageScanDialog` is reached through the POS toolbar's `圖片掃碼` button. It shares
the existing scanner-blocked boundary with the manual evidence dialog. It reads
PNG/JPEG locally through `imageScanDecoder`, displays the image and every decoded
symbol, and requires explicit selection followed by confirmation of the text.
Confirmation is temporary UI state only. A separate explicit handoff opens
package lookup for nonsegmented symbols; confirmation itself has no barcode
dispatch, persistence, cart change or inventory command. New selections
and close/unmount invalidate late results and release object URLs.

`imageScanDecoder` uses pinned `zxing-wasm` 3.1.2 with the matching reader WASM
emitted by Vite `?url`; initialization must override asset resolution before use.
There is no CDN fallback. PNG/JPEG bytes and header dimensions are bounded before
the engine loads; decoded literal, observed bytes/ECI bytes and canonical format
metadata are retained by `imageScanResult`. That adapter reports GS1 unknown;
the separate proposal reader must not infer missing metadata.
See ADR-022 and the `ImageScanDialog`, `POSCheckoutPage.image-scan`, and image
decoder/evidence tests. Actual WASM, browser asset routing and hardware/performance
evidence must be reported separately; mocked UI tests do not establish decoding.

### Local camera capture and explicit package handoff

The toolbar's camera entry opens ImageScanDialog with camera acquisition.
CameraCapture requests video only on an explicit enable click, captures one
bounded local PNG on a second click and stops all tracks before local decoding.
Retake, late media/encoding/decode, close/navigation, hidden page and interrupted
media use cancellation/cleanup boundaries; checkout identity, draft and staff
changes discard the camera session. Existing image/manual entries stay available.

Selection plus text confirmation only exposes the separate package handoff.
PackageLookupDialog remains the sole reviewed mapping/revision authority; no
automatic cart or inventory effects are introduced by camera capture.
ADR-022 records provenance and resource limits. CameraCapture, ImageScanDialog
and POSCheckoutPage.image-scan tests cover synthetic lifecycle/integration.
The existing exact-head e2e/dialog-acceptance runner includes camera.spec.ts,
generated fake Y4M, real local WASM and sealed camera/geometry/font evidence.
Fake video and synthetic HTTP are not physical camera, OS permissions or real
API/PG acceptance; hardware/LAN HTTPS/offline installation/8 GB performance gates
remain open. Current-source CI and independent pixel review must accompany the PR.

### Reviewed browser provenance

`e2e/ui-evidence/provenance-proof.mjs` is the metadata-only CI preflight.
Its existing read-only ephemeral token is step-scoped; `run.mjs` accepts only the
verified run/attempt-bound proof and never receives that token. Keep immutable
API corroboration, local source/setup checks and failure diagnostics fail-closed.
See `../infrastructure/adr/ci-reliability-and-selection.md` before changing this
contract or the required-job aggregation in `.github/workflows/ci.yml`.


### Existing POS employee-code entry acceptance (Issues #31 / #49 / #37)

`pos-ui/e2e/staff-entry-native/README.md` documents the bounded owned-PostgreSQL
journey for the unchanged employee-code login endpoint and subsequent GET-only
POS entry. It seeds only disposable active/suspended users, the existing
`manage:pos` role relation and default tenant, proves every raw table unchanged,
and cleans exact fixture IDs after HTTP drain. Real response tokens stay private;
no PIN, credential policy, tenant-selection feature, deployment or device change.
The POS login component names its input, owns and aborts pending requests, rejects
stale/unmounted publication, and accepts only an explicit successful response
with a non-empty string token. Native evidence is required before claiming the
three viewport journeys passed; local controls do not substitute for Chrome/PG.

### Existing POS pointer reachability and payment cancellation

Issue #31 source package `STARTUP-POS-LAYOUT-CANCEL-NATIVE-20261020` adds a bounded
`e2e/layout-native` acceptance at 1440×900, 1024×768 and 1180×820, each pointer and
Chrome touch-capable. The real employee-code entry is followed only by existing
GETs. Twelve products, total 240, ordinary payment/split/shift cancellation and
existing clear confirmation must preserve the cart and all 33 raw database tables.
PaymentModal now owns idle/pending keyboard focus, isolates the background, yields
to the existing PIN overlay, and restores its opener without stealing a newer
surface's focus. Financial and authentication policy are unchanged. Native PNG,
geometry and owned cleanup remain required; local jsdom/adapters/PGlite are not
native acceptance. See the harness README for exact scope and limitations.
