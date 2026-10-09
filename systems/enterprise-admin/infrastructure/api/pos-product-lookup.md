# POS exact SKU lookup (bounded Issue #48 slice)

`GET /pos/products/lookup?code=<literal SKU>` uses existing POS authentication,
rate limiting and `manage:pos` permission. Route wiring belongs to the POS route owner.

- Required single nonempty string `code`; unknown query keys, arrays and missing/empty code fail validation (400).
- Preserve the string exactly: no trim, numeric conversion, case folding or substring matching.
- Read Product through the current tenant scope, matching `sku = code`. No category, stock or 100-row browse cap.
- Respond `{ success: true, data: PosProduct[] }` with existing category metadata. The `(sku, tenantId)` unique constraint bounds this current-schema query to zero or one row.
- Product has no barcode column. This is **not manufacturer-barcode lookup**. Adding barcode storage, indexes, duplicate policy and migration requires a separate approved change.
- The scanner fallback calls this endpoint; ordinary typed search retains `/pos/products`.
- Supplied legacy candidates can still match an existing optional barcode literally. Multiple exact candidates never auto-add: the cashier chooses a named product. A new scan, manual search, draft change, scope change or pending/unknown/conflict transition invalidates the choice. A stale callback cannot add; a valid selection is consumed once and stock is checked again against current cart quantity.
- Concurrent legal exact scan intents retain prior safety semantics, including reverse responses. Older ambiguous responses cannot replace the choice for a newer scan.
- Lookup failure and no match leave the draft intact. Native buttons/links/selects/textareas/contenteditable own their keyboard events; Enter/Space must not create a scanner sequence before activation. A completed scan prevents the Enter default before page shortcuts, and the page must honor defaultPrevented. This changes input ownership only, not the existing 300/301ms, trim or minimum-length decoder policy.

## Integration ownership

1. In `pos.routes.ts`, import `lookupProduct` from `./product-lookup.controller` and `productLookupSchema` from `./product-lookup.schema`.
2. After the existing auth and manage:pos middleware, register `router.get('/products/lookup', validate(productLookupSchema), lookupProduct)`.
3. Page state: `useState<BarcodeCandidateSelection | null>(null)`. Pass its stable setter as the sixth `useBarcodeScanner` argument; keep the existing returned search-input handler.
4. Page-wide shortcuts must return for defaultPrevented events and native interactive targets; do not intercept Enter/Space intended for candidate choice/cancel buttons. Render `<BarcodeCandidates selection={selection} />` alongside search/results. Do not implement page-level selection/cart mutation or suppress hook invalidation.
5. Pass seventh options `{ blocked, onStatus: setLookupStatus }`. `blocked` is the union of the existing page modal-open flags (payment/order lookup/etc.), not a new modal workflow. Every transition invalidates old intents permanently, including open/cancel ABA; scanning while blocked does nothing.
6. Render `<BarcodeLookupFeedback status={lookupStatus} />` from ephemeral `BarcodeLookupStatus` page state. Loading remains visible until resolution/invalidation; 403 is permission-denied, other errors retain the draft and invite rescan/manual search. Only the most recent scan can replace this feedback; valid concurrent exact additions remain supported.
7. Do not render a persisted selection across remount: selection is ephemeral page state. Unmount invalidates callbacks without updating unmounted React state.

## Evidence boundary

Unit coverage: literal/leading-zero lookup contract, tenant requirement, malformed HTTP query, controller error, scanner existing regression suite, explicit choice/cancellation/stale-response cases, persistent loading, distinct 403/500 feedback and modal blocking/open-cancel ABA. These tests are authored but not locally executed because matching dependencies are unavailable and package bootstrap was denied. Static context validation and diff checks passed; runtime, type/build, PostgreSQL and browser/hardware checks remain not run.

`backend/src/__tests__/pos-product-lookup.integration.test.ts` is opt-in with an explicit `POS_PRODUCT_LOOKUP_DATABASE_URL` matching `DATABASE_URL`, loopback host, dedicated synthetic database, test user and no password. It is skipped unless configured. It checks >100 fuzzy decoys, literal matching, zero stock and concurrent tenant separation. No database run is claimed by the presence of this test. Authentication/permission route integration remains the route owner's verification responsibility.

No hardware scan or visual browser acceptance is implied by unit coverage. Full Issue #48, manufacturer barcodes and G0–G7 remain open.
