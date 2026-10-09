# Issue #31: bounded POS header/cart candidate

## Status and provenance

This is an unaccepted local UI candidate, not a completed #31/G0 gate, mobile
acceptance, or release. No business event, checkout payload, scanner, store,
permission, API, dependency, runner, or deployment configuration was changed.

- Remote master inspected: `572884ff744e3211e9b079c1dab08957344c713e`.
- Exact baseline tree: `6d564277a257dd9e375b3af40f68f8d77694fe2d`.
- Local equivalent baseline: `c35d61828221768eb8e49f76dd552fa20d0aa26c`.
  The complete tree is identical, but commit ancestry is different. Publish only
  the owned delta on the verified remote base; do not push this local ancestry.
- Open #94/#95 and the older #88 were inspected. Their dialog, inventory-test,
  and runner changes are not included or overwritten by this work.

## Candidate

- Preserve the existing horizontally scrolling toolbar at every viewport, but
  stop whole controls shrinking and stop labels wrapping vertically. Direct
  action buttons and search have 44px minimums; the row has an automatic height.
- The toolbar has an accessible region name, a keyboard focus stop, a persistent
  scroll hint and focus outlines. Below 768px its padding/gaps are smaller; no
  multi-row toolbar consumes the product area above the existing 50vh cart.
- Only direct toolbar buttons/inputs receive larger dimensions. In particular,
  the absolute-positioned held-cart list's button sizes are unchanged.
- CartItem quantity, removal and editable inputs have declared 44px minimums;
  quantity/price and discount rows may wrap, and long product names may break.
- Main-body and cart-panel layout/scroll rules are unchanged. A desktop-wrapping
  candidate was rejected during self-review: it could move the existing
  right-anchored held-cart popup to the left edge. Its dependent body/cart changes
  were also removed. Native geometry remains unverified.

## Local automated evidence

Commands run from `pos-ui/` using unchanged, already-installed dependencies:

```sh
node node_modules/vitest/vitest.mjs run
node node_modules/typescript/bin/tsc
node node_modules/vite/bin/vite.js build
```

The two new suites cover declared CartItem dimensions and repeated quantity /
stock-cap / discount / native Enter and Space behavior; named toolbar focus,
F2/F7, real-cart pointer hold/recall and real-payment cancellation. Synthetic
API/shift adapters are used in the page test. No real transaction is sent.

Initial unchanged-source runs: CartItem 2 failed / 2 passed; header 2 failed /
1 passed. The candidate's focused seven tests pass. The full suite passed
292/292 on both Node 24.19.0 and the existing Node 22.23.3 runtime.
Final Node 22 typecheck and build also pass; no packages were installed.
Typecheck and Vite build pass after correcting two unsupported test options.
An initial focused-test command from the wrong directory did not run and is not a pass.
Final exact-source command receipts accompany the checkpoint separately.

JSDOM has no layout engine: style minimums and focus tests do not prove measured
44px targets, scrolling, visibility, touch reachability, or responsive geometry.
No CSS-string test is used to claim visual acceptance.

## Known blockers / unverified behavior

1. **Existing mobile held-cart popup clipping is not fixed.** HoldOrderBar renders
   an absolute list inside the horizontally scrolling header; overflow clipping
   remains. Its dimensions were deliberately excluded from the new sizing rule.
   Code review alone cannot establish that the candidate is no worse. The final candidate preserves the old overflow model,
   does not wrap the header or resize popup controls. Compare baseline and candidate with real pointer and keyboard checks before acceptance.
2. No new browser run or post-change screenshots were obtained. The cloud
   Chromium/socket route was previously denied; it was not retried or bypassed.
   Inspected historical actual-app synthetic screenshots reproduce squeezed
   labels at 390px and 1024px, but cannot validate this candidate.
3. Mobile product/cart redesign, compact menus and member-layout redesign remain
   outside this slice. CustomerLookupPanel's existing minimum width and badge
   truncation are unchanged. The narrow toolbar intentionally scrolls.
4. Physical touch/scanner, iPad/Safari, real API/database, native browser 200%
   zoom, screen reader and broader #31 release gates remain NOT RUN.

## Minimum native verification before acceptance

Use a separately authorized existing browser and the exact candidate build with
synthetic HTTP isolation. Do not repoint at a store or production API. Preserve
source SHA/tree, browser version, fixture, viewport, screenshot and network ledger.
Use ordinary clicks/taps (never forced clicks), normal Tab navigation, and native
scrolling. Check the baseline first for every suspected pre-existing failure.

1. At **1366×768, 1024×768 and 390×844**, add a product, then measure every direct
   toolbar action, quantity +/- input and removal control via bounding boxes.
   Both dimensions must be >=44 CSS px; controls must not overlap or be clipped.
   Inspect toolbar labels, long product names, quantities and six-digit prices.
   Capture the toolbar and cart, not only a modal or empty screen.
2. At **390×568 and 320×568**, reach the toolbar by Tab, use ArrowRight/ArrowLeft
   while the region itself is focused and verify its scrollLeft changes. Tab to
   search and each far-right action; each focused element must scroll into view.
   Swipe/trackpad horizontally too. The document must not become wider than the
   viewport; the visible hint must not hide the search or product controls.
3. At **1024×600 and 200% browser zoom**, use a long staff name, long product name,
   selected customer and two held carts. Inspect readable toolbar labels and horizontal reachability, then scroll
   to the checkout footer. Read all totals and activate checkout normally. Capture
   actual zoom settings; doubled text alone is not a browser-zoom pass.
4. Hold and recall a cart with ordinary pointer and native Enter/Space. Open the
   held-cart list near both toolbar edges; its buttons must be visible and usable.
   If mobile clipping persists, mark this gate failed/outstanding, not passed.
5. Repeatedly increment/decrement, type quantity and discount, hit stock cap,
   remove/re-add, scan exact and ambiguous SKU, open/cancel payment, then reopen.
   F2/F4/F7/F8 and Tab/Shift+Tab must retain their meanings. Cancellation preserves
   the cart and focus; no unrequested checkout/shift/registration write occurs.
6. Dismiss dialogs, use Back/Forward and refresh, then repeat header and checkout
   reachability. Include pending/unknown recovery to ensure controls remain frozen.
   Report each not-run path separately; no automated total replaces these checks.
