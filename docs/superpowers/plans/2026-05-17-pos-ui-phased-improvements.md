# POS UI Phased Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve the POS interface from prototype-grade to counter-ready by fixing trust blockers, tightening checkout flow, and hardening operational behavior in stages.

**Architecture:** Keep the existing standalone `systems/enterprise-admin/pos-ui` Vite React SPA and shared backend POS API. Prioritize narrow frontend changes first, then add small backend/API adjustments only where the current UI cannot support a safe checkout flow. Keep phases independently shippable with focused tests.

**Tech Stack:** React 19, Vite, TypeScript, Zustand, Axios, Vitest, Testing Library, Express/Prisma backend where required.

---

## Phase 0: Trust And Legibility Baseline

**Goal:** Make the POS readable and safe to demo or operate without confusing staff.

**Scope:**
- Replace mojibake text in POS UI labels, empty states, error messages, payment labels, receipt labels, and tests.
- Replace browser `alert()` calls with a small POS-friendly inline feedback component.
- Make destructive actions explicit enough for counter use.

**Files:**
- Modify: `systems/enterprise-admin/pos-ui/src/pages/POSCheckoutPage.tsx`
- Modify: `systems/enterprise-admin/pos-ui/src/pages/POSLoginPage.tsx`
- Modify: `systems/enterprise-admin/pos-ui/src/components/CartPanel.tsx`
- Modify: `systems/enterprise-admin/pos-ui/src/components/CartItem.tsx`
- Modify: `systems/enterprise-admin/pos-ui/src/components/ProductCard.tsx`
- Modify: `systems/enterprise-admin/pos-ui/src/components/ProductGrid.tsx`
- Modify: `systems/enterprise-admin/pos-ui/src/components/PaymentModal.tsx`
- Modify: `systems/enterprise-admin/pos-ui/src/components/ReceiptModal.tsx`
- Modify: `systems/enterprise-admin/pos-ui/src/components/StaffSwitchModal.tsx`
- Create: `systems/enterprise-admin/pos-ui/src/components/PosToast.tsx`
- Test: `systems/enterprise-admin/pos-ui/src/__tests__/CartPanel.test.tsx`
- Test: `systems/enterprise-admin/pos-ui/src/__tests__/CartItem.test.tsx`
- Add tests as needed for `PaymentModal`, `ReceiptModal`, and `POSLoginPage`.

**Acceptance Criteria:**
- No visible mojibake remains in `pos-ui/src`.
- Empty cart, loading, no product, checkout failure, shift-open failure, and print failure have readable messages.
- Clearing cart uses an explicit confirmation or undo-style feedback.
- Existing cart and item tests pass after text updates.

**Verification:**
- Run: `npm run test`
- Run: `npm run build`
- Manual: open POS, scan through login, no-active-shift, checkout, payment, and receipt states.

**Suggested Commit:**
```bash
git add systems/enterprise-admin/pos-ui
git commit -m "fix(pos-ui): restore readable checkout interface text"
```

---

## Phase 1: Counter-Speed Checkout Flow

**Goal:** Reduce friction during the normal scan-add-pay-print flow.

**Scope:**
- Make barcode handling search the backend when the product is not already in the current product list.
- Add clear scan feedback: added item, duplicate quantity increased, not found, out of stock.
- Keep the search box focused after scans and after successful item additions.
- Increase touch targets for quantity, remove, payment method, checkout, and clear-cart controls.
- Improve keyboard flow so Enter does not unexpectedly open checkout while another modal or input is active.

**Files:**
- Modify: `systems/enterprise-admin/pos-ui/src/pages/POSCheckoutPage.tsx`
- Modify: `systems/enterprise-admin/pos-ui/src/services/barcodeService.ts`
- Modify: `systems/enterprise-admin/pos-ui/src/api/pos.ts`
- Modify: `systems/enterprise-admin/pos-ui/src/components/CartItem.tsx`
- Modify: `systems/enterprise-admin/pos-ui/src/components/CartPanel.tsx`
- Modify: `systems/enterprise-admin/pos-ui/src/components/ProductCard.tsx`
- Modify: `systems/enterprise-admin/pos-ui/src/components/ProductGrid.tsx`
- Test: add or update POS checkout page tests for barcode fallback behavior.

**Acceptance Criteria:**
- Scanning an SKU/barcode not in the current grid calls `/pos/products?q=<code>`.
- A single exact match is added to cart automatically.
- Multiple matches populate the product grid without auto-adding.
- No match shows readable feedback without clearing the current cart.
- Quantity controls are at least 40px; checkout is at least 56px high.
- Product cards remain stable in size as names, stock labels, and prices vary.

**Verification:**
- Run: `npm run test`
- Run: `npm run build`
- Manual: scan known product, scan unknown product, scan same product twice, adjust quantity by touch controls.

**Suggested Commit:**
```bash
git add systems/enterprise-admin/pos-ui
git commit -m "feat(pos-ui): improve barcode-driven checkout flow"
```

---

## Phase 2: Payment And Receipt Confidence

**Goal:** Make the final payment step feel deliberate, auditable, and hard to misclick.

**Scope:**
- Prevent backdrop click from closing `PaymentModal`.
- Add cash tendered input and computed change for cash payments.
- Add method-specific confirmation states for card, LINE Pay, transfer, and other.
- Show checkout summary before confirm: item count, subtotal, discount, total, payment method, sales staff.
- Disable confirm while total is invalid or cash tendered is below total.
- Improve receipt success modal with clear next-sale action and print retry state.

**Files:**
- Modify: `systems/enterprise-admin/pos-ui/src/components/PaymentModal.tsx`
- Modify: `systems/enterprise-admin/pos-ui/src/components/ReceiptModal.tsx`
- Modify: `systems/enterprise-admin/pos-ui/src/components/CartPanel.tsx`
- Modify: `systems/enterprise-admin/pos-ui/src/store/cartStore.ts`
- Modify: `systems/enterprise-admin/pos-ui/src/api/pos.ts`
- Optional backend change: add tendered/change fields later if the domain model needs persisted payment details.
- Test: create `systems/enterprise-admin/pos-ui/src/__tests__/PaymentModal.test.tsx`
- Test: create `systems/enterprise-admin/pos-ui/src/__tests__/ReceiptModal.test.tsx`

**Acceptance Criteria:**
- Payment modal only closes through explicit cancel or successful checkout.
- Cash payment requires tendered amount greater than or equal to total.
- Change is visible and large enough for staff to read quickly.
- Confirm button shows loading and cannot double-submit.
- Receipt modal can retry printing and continue to next transaction.

**Verification:**
- Run: `npm run test`
- Run: `npm run build`
- Manual: cash exact payment, cash overpayment, cash underpayment, card payment, failed print fallback.

**Suggested Commit:**
```bash
git add systems/enterprise-admin/pos-ui
git commit -m "feat(pos-ui): harden payment and receipt flow"
```

---

## Phase 3: Responsive POS Layout

**Goal:** Make the interface fit realistic POS hardware: desktop counters, tablet landscape, and narrower fallback screens.

**Scope:**
- Move inline layout styles into maintainable CSS classes.
- Increase desktop cart width to a more usable range, around 360-400px.
- Add tablet layout where the cart becomes a right drawer or bottom sheet.
- Keep category navigation usable without squeezing product tiles.
- Ensure long product names, staff names, and button labels do not overflow.

**Files:**
- Modify: `systems/enterprise-admin/pos-ui/src/index.css`
- Modify: `systems/enterprise-admin/pos-ui/src/pages/POSCheckoutPage.tsx`
- Modify: `systems/enterprise-admin/pos-ui/src/components/CategoryNav.tsx`
- Modify: `systems/enterprise-admin/pos-ui/src/components/ProductGrid.tsx`
- Modify: `systems/enterprise-admin/pos-ui/src/components/ProductCard.tsx`
- Modify: `systems/enterprise-admin/pos-ui/src/components/CartPanel.tsx`

**Acceptance Criteria:**
- Desktop `>= 1024px`: categories, grid, and cart are all visible.
- Tablet `768-1023px`: cart remains reachable without crushing product tiles.
- Mobile/narrow fallback `< 768px`: no incoherent overlap; checkout remains possible.
- Text inside buttons/cards fits without negative letter spacing or viewport-scaled font sizes.

**Verification:**
- Run: `npm run build`
- Use browser viewport checks for 1366x768, 1024x768, 768x1024, and 390x844.
- Confirm product grid, cart, payment modal, and receipt modal render without overlap.

**Suggested Commit:**
```bash
git add systems/enterprise-admin/pos-ui
git commit -m "feat(pos-ui): make checkout layout responsive"
```

---

## Phase 4: Offline And Hardware Operations

**Goal:** Make operational edge cases visible and recoverable before real store use.

**Scope:**
- Surface offline queue status in the top bar.
- Add pending transaction count and sync retry affordance.
- Make the 50-pending limit readable and actionable.
- Improve receipt printer states: connected, permission needed, print failed, browser fallback used.
- Add lightweight diagnostics panel or modal for counter support.

**Files:**
- Modify: `systems/enterprise-admin/pos-ui/src/services/offlineQueue.ts`
- Modify: `systems/enterprise-admin/pos-ui/src/services/receiptService.ts`
- Modify: `systems/enterprise-admin/pos-ui/src/pages/POSCheckoutPage.tsx`
- Create: `systems/enterprise-admin/pos-ui/src/components/OfflineStatus.tsx`
- Create: `systems/enterprise-admin/pos-ui/src/components/PrinterStatus.tsx`
- Test: add service tests for offline queue limit and printer fallback behavior where practical.

**Acceptance Criteria:**
- Staff can see online/offline status without opening devtools.
- Pending offline sales count is visible when greater than zero.
- Queue-full errors explain the next action.
- Print failures show retry and fallback options.

**Verification:**
- Run: `npm run test`
- Run: `npm run build`
- Manual: simulate offline browser state, enqueue pending checkout, restore network, test print fallback.

**Suggested Commit:**
```bash
git add systems/enterprise-admin/pos-ui
git commit -m "feat(pos-ui): expose offline and printer status"
```

---

## Phase 5: Manager Controls And Audit Safety

**Goal:** Prepare the POS for store policy enforcement and later production rollout.

**Scope:**
- Add permission gates or manager approval for large item discounts, order discounts, voids, and refunds.
- Add customer selection only after walk-in checkout is stable.
- Add shift close shortcut and clear path to daily settlement.
- Add optional transaction note where needed for discounts or exception handling.
- Confirm backend audit logs cover checkout, discount, print retry, void/refund, and offline sync events.

**Files:**
- Modify: `systems/enterprise-admin/pos-ui/src/store/cartStore.ts`
- Modify: `systems/enterprise-admin/pos-ui/src/components/CartItem.tsx`
- Modify: `systems/enterprise-admin/pos-ui/src/components/CartPanel.tsx`
- Modify: `systems/enterprise-admin/pos-ui/src/pages/POSCheckoutPage.tsx`
- Backend as needed: `systems/enterprise-admin/backend/src/modules/pos/*`
- Backend as needed: `systems/enterprise-admin/backend/src/modules/audit-logs/*`

**Acceptance Criteria:**
- Discount policy is visible and enforced.
- High-risk actions require explicit role or manager approval.
- Shift close and settlement paths are discoverable from POS.
- Audit behavior is tested before enabling manager controls broadly.

**Verification:**
- Frontend: `npm run test && npm run build` from `systems/enterprise-admin/pos-ui`.
- Backend, if touched: `npm run build` and `npx prisma validate` from `systems/enterprise-admin/backend`.

**Suggested Commit:**
```bash
git add systems/enterprise-admin/pos-ui systems/enterprise-admin/backend
git commit -m "feat(pos): add manager controls for checkout exceptions"
```

---

## Recommended Execution Order

1. Phase 0 first. It removes the biggest trust blocker and cleans test text at the same time.
2. Phase 1 second. It makes scanning and touch checkout feel like a real POS.
3. Phase 2 third. It protects the final money step from accidental closure or double-submit.
4. Phase 3 after the workflow is stable. Responsive polish is more useful once the core flow is readable.
5. Phase 4 before any real counter pilot.
6. Phase 5 before production rollout or multi-staff policy enforcement.

## Current Risk Notes

- The working tree already has unrelated modifications outside `pos-ui`; stage POS changes selectively.
- Several existing tests assert mojibake strings, so Phase 0 must update tests together with UI text.
- Keep backend edits out of early phases unless a frontend flow cannot be made safe without API support.
- If backend files are touched, verify both TypeScript build and Prisma schema validation.

