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
Its finite seven-case matrix retains stable navigation at 1366/1024/390px
and adds loading, explicitly injected category 403/500, manual retry, real 61-second
stale expiry/native tab focus, delayed real product reads and a real empty fixture
tenant. API/body hashes, complete DB snapshots and exact fixture cleanup are
required. Injection is test outer middleware; 403 presentation is not authorization
acceptance. No production DB, login or tenant-switch UI is involved. See
`../infrastructure/verification/pos-category-lifecycle/README.md`.

`e2e/category-native/visibility-probe.mjs` and the separate
`category-visibility-probe.yml` workflow diagnose only two blank Chrome tabs per
arm on the dedicated `chore/pos-category-visibility-probe-20261010` push branch.
The sandboxed headed comparison keeps the existing launch/newContext harness
and contrasts an existing default context connected with `noDefaults: true`.
This is a visibility diagnostic with owned-process cleanup, not POS/API/DB acceptance.

### Change POS API calls

1. Read `../infrastructure/api/api_spec.md`.
2. Open the relevant `src/api/` or `src/services/` files.
3. Open affected stores/pages/tests.

## Commands

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
