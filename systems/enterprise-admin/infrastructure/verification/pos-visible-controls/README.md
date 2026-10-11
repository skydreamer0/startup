# POS visible checkout controls and category focus

Bounded follow-up for #31 (existing POS overflow/obscured-control gate), related
#49 (category focus must remain visible). This does not close either issue.

## Baseline and dependency

Based on PR #125 head `271c991fbe7ac3ea5409dd92dbb38ec539dd302d`, tree
`f7f7b54f8a9ae0d6f60588f9d4ea4952134712e2`. Stack this Draft on
`fix/category-native-focus-123`; do not mix product changes into #125's driver fix.
The independent exact-head screenshot review is
[#125 comment](https://github.com/skydreamer0/startup/pull/125#issuecomment-6108803363).
Its 7 category and 2 stock browser PASS results do not establish visual acceptance.
HOLD #109 is not changed or rerun.

## Defects and correction

- At 1024/1366 × 900, CartPanel's `height:100%` consumed the entire cart column,
  while a nonempty recommendation strip added height above it. The enclosing
  hidden-overflow body clipped checkout/split and placed Clear Cart below view.
  The cart is now a bounded flex column. Recommendations reserve their actual
  height; the panel takes the remaining space. Internal items retain their normal
  scrolling; the panel can scroll if its controls cannot fit a short viewport.
- At 390px, native focus scrolling happened before selection added the checkmark
  and bold text. The enlarged active category extended beyond the navigation
  viewport. Recheck horizontal visibility after selection and on focus, including
  the 2px outline plus 2px offset. Refetch and resize prioritize any category that still holds focus. Only the category strip scrolls. Metric-changing
  font-weight transitions are excluded. An oversized label remains horizontally
  scrollable; it is not claimed to fit in every viewport.

No checkout/refund/inventory, API, permission, dependency, lockfile or workflow
semantics change. No global page scroll, focus movement or category selection is
introduced by the visibility correction.

## Tests and evidence

- Pure Vitest geometry: 7/7 PASS locally with available Vitest 4.1.11 / Node
  24.19.0, including the recorded 417.0625px right edge in a 390px viewport,
  reverse traversal, ring padding, offset viewport and oversized/unmeasurable
  labels. This is synthetic arithmetic coverage, not browser evidence.
- Five additional CategoryNav component regressions verify focus-only reveal,
  post-selection remeasurement, unchanged vertical scroll/selection, and retained
  focus, refetch while another category is focused, resize and observer cleanup. Authored; NOT RUN locally because canonical frontend dependencies are
  absent. The full CategoryNav suite will contain ten cases.
- Supplemental strict typechecks of changed production/pure-test files and the
  category/stock browser sources PASS using available dependency mappings and
  Playwright 1.62.1 types. These are not the locked Node22/Playwright1.63 checks.
- Canonical local install is BLOCKED: Node24/pnpm11 differ from the required
  Node22/pnpm10.34.6, and frozen offline resolution lacks package metadata for
  `@adobe/css-tools`. No lock changes or supply-chain policy bypass were used.
- Context validation and whitespace checks PASS. Full POS tests/build, canonical
  E2E typechecks, actual browser and API/PG acceptance are NOT RUN locally.

### Exact-head CI acceptance to inspect

The existing ordinary CI runs remain the execution route. No driver, guards,
security setting, workflow or database fixtures are changed.

1. Existing category seven-case matrix and 46 captures remain intact. Stable
   1366/1024/390px cases add full-label/outline bounds and edge hit tests after
   each native keyboard/pointer selection. `reachability.json` retains its eight
   original entries and adds `selectedVisibility` on each. Keyboard selection
   also explicitly retains focus. A focused unselected category is checked after narrowing each viewport by 70px, waiting for real resize observation; focus, vertical page scroll and cart remain unchanged. No test-side scroll repairs selection.
2. Existing stock two-case matrix and eight 900px captures remain intact.
   `visible-controls.json` records full checkout/split/clear bounds, four edge
   hit tests, ordinary pointer actionability, panel/footer bounds and actual
   recommendation height through checkout/refund stale/recovered stages.
   The checkout-stale recommendation must occupy more than 44px of height.
3. At checkout recovery, also resize to 1366/1024 × 768 with that real recommendation
   content. Check the same bounds, open checkout and cancel by ordinary pointer,
   open split and cancel, and retain the draft. Return to 900px before the original
   refund journey. At the end, the first real Clear Cart click shows confirmation
   while retaining quantity 1. No second checkout or extra refund is submitted.
4. Independently inspect new exact-head PNG and JSON, full CI/security checks and
   review findings. Pending/failed/skipped remains distinct from PASS. Old images
   are baseline defect evidence, never screenshots of this repair.

Reproduction on the canonical installed workspace: `pnpm --filter pos-ui test --
src/__tests__/CategoryNav.test.tsx src/__tests__/horizontalReveal.test.ts`, then the
full POS test/build and existing category/stock exact-head CI runners. Run the
native runners only in their original owned synthetic CI service; do not invent
CI environment variables or supply Production/Preview/ambient database URLs.

## Remaining gates

No local browser RED/GREEN claim. Physical iPad/iPhone, Safari/WebKit, native
browser zoom, software keyboard, touch hardware, screen reader and whole-POS
responsive acceptance are NOT RUN here. Existing SKU narrow/short-cart coverage
is a regression gate, not proof of every recommendation/cart combination. Wider
#31/#49 and G0–G7 remain open. Draft only; no merge or deployment authorized.
