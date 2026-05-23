# Phase 10 POS AI Intelligence Parallel Implementation Plan

> **For Claude/Codex:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task. Use subagents only on disjoint write scopes. Shared files (`packages/types`, `ROADMAP.md`, route-level final wiring) are owned by the controller/integrator.

**Goal:** Finish Phase 10 POS AI Intelligence after AI-01~AI-03 by adding POS recommendations, reorder forecast, POS inventory alerts, and admin dashboard reorder visibility.

**Architecture:** Phase 10 is split into two backend capability tracks and two UI integration tracks. Backend endpoints produce bounded, tenant-scoped intelligence payloads; UI components stay dumb and testable, with final wiring done by the controller to avoid type/API conflicts.

**Tech Stack:** Express, Prisma, Vitest, React 19, TanStack Query, Zustand, Vite, Testing Library.

---

## Current Baseline

- AI-01~AI-03 are implemented locally but not yet committed.
- POS UI focused verification commands that currently pass:
  - `npx.cmd vitest run src`
  - `npm.cmd run build`
- Backend focused POS verification command that currently passes:
  - `npm.cmd run test -- src/__tests__/pos.customerLookup.test.ts src/__tests__/pos.checkout.test.ts`
- Known pre-existing blockers outside this plan:
  - Full backend `npm.cmd run test` fails because `api.integration.test.ts` expects 31 permissions but seed returns 34.
  - Backend `npm.cmd run build` fails in existing inventory CSV TypeScript errors.
  - POS `npm.cmd run test` collects Playwright `e2e/*.spec.ts`; use `npx.cmd vitest run src` for unit tests.

---

## Parallel Ownership Map

### Agent A: POS Recommendation Backend

**Roadmap:** AI-04

**Allowed files:**
- `systems/enterprise-admin/backend/src/modules/pos/checkout.service.ts`
- `systems/enterprise-admin/backend/src/modules/pos/pos.controller.ts`
- `systems/enterprise-admin/backend/src/modules/pos/pos.routes.ts`
- `systems/enterprise-admin/backend/src/modules/pos/pos.schema.ts`
- `systems/enterprise-admin/backend/src/__tests__/pos.recommendations.test.ts`

**Do not touch:** `packages/types`, `pos-ui`, `admin-ui`, `ROADMAP.md`.

**Task:** Add `GET /pos/recommendations/:customerId`.

**Behavior:**
- Tenant-scoped by `requireTenantId()`.
- Return at most 3 items.
- Prefer replenishment suggestions from products the customer bought before, where latest purchase is at least 25 days old and product still has stock.
- Include reason text suitable for UI chips.
- Suggested response shape:
  ```ts
  {
    productId: string;
    name: string;
    sku: string;
    retailPrice: number;
    reason: string;
    source: 'REPLENISHMENT' | 'HOT_SELLER';
    daysSincePurchase?: number;
  }[]
  ```

**Verification:**
- Red: `npm.cmd run test -- src/__tests__/pos.recommendations.test.ts`
- Green: same command passes.
- Regression: `npm.cmd run test -- src/__tests__/pos.recommendations.test.ts src/__tests__/pos.customerLookup.test.ts src/__tests__/pos.checkout.test.ts`

---

### Agent B: Reorder Forecast Backend

**Roadmap:** AI-07

**Allowed files:**
- `systems/enterprise-admin/backend/src/modules/analytics/product-analytics.service.ts`
- `systems/enterprise-admin/backend/src/modules/analytics/product-analytics.service.test.ts`
- `systems/enterprise-admin/backend/src/modules/analytics/analytics.controller.ts`
- `systems/enterprise-admin/backend/src/modules/analytics/analytics.routes.ts`
- `systems/enterprise-admin/backend/src/modules/analytics/analytics.types.ts`

**Do not touch:** POS backend files, `packages/types`, `pos-ui`, `admin-ui`, `ROADMAP.md`.

**Task:** Add `GET /analytics/reorder-forecast`.

**Behavior:**
- Tenant-scoped by existing analytics tenant helpers.
- Compute 30-day sales velocity from completed order items.
- Compare stock quantity and safety stock.
- Return a bounded list ordered by urgency.
- Suggested response shape:
  ```ts
  {
    productId: string;
    name: string;
    sku: string;
    stockQuantity: number;
    safetyStock: number;
    dailySalesVelocity: number;
    estimatedDaysUntilStockout: number | null;
    urgency: 'THIS_WEEK' | 'SOON' | 'OK';
  }[]
  ```

**Verification:**
- Red: `npm.cmd run test -- src/modules/analytics/product-analytics.service.test.ts`
- Green: same command passes.
- Regression: `npm.cmd run test -- src/modules/analytics/product-analytics.service.test.ts src/modules/analytics/operations-analytics.service.test.ts`

---

### Agent C: POS UI Components

**Roadmap:** AI-05, AI-08 component layer only.

**Allowed files:**
- `systems/enterprise-admin/pos-ui/src/components/RecommendationChips.tsx`
- `systems/enterprise-admin/pos-ui/src/components/ReorderForecastBadge.tsx`
- `systems/enterprise-admin/pos-ui/src/__tests__/RecommendationChips.test.tsx`
- `systems/enterprise-admin/pos-ui/src/__tests__/ReorderForecastBadge.test.tsx`

**Do not touch:** `POSCheckoutPage.tsx`, `CartPanel.tsx`, `api/pos.ts`, `packages/types`, backend, `ROADMAP.md`.

**Task:** Build reusable presentational components.

**Behavior:**
- `RecommendationChips` renders up to 3 recommendation chips and calls `onAdd(productId)` when clicked.
- `ReorderForecastBadge` renders a compact topbar alert count and can reveal a short list of urgent reorder items.
- Use local interfaces for now; controller will later replace with shared package types.

**Verification:**
- Red: `npx.cmd vitest run src/__tests__/RecommendationChips.test.tsx src/__tests__/ReorderForecastBadge.test.tsx`
- Green: same command passes.
- Regression: `npx.cmd vitest run src`

---

### Agent D: Admin Dashboard Scout

**Roadmap:** AI-09 planning only, read-only.

**Read files:**
- `systems/enterprise-admin/admin-ui/src/pages/DashboardPage.tsx`
- `systems/enterprise-admin/admin-ui/src/api/dashboard.ts`
- existing admin-ui tests and build scripts

**Task:** Return a concise integration note for the reorder forecast widget: exact files to touch, API data flow, UI placement, tests, and known verification blockers.

---

## Controller / Integrator Tasks

### Task 1: Merge shared types and API clients

**Files:**
- `systems/enterprise-admin/packages/types/src/index.ts`
- `systems/enterprise-admin/pos-ui/src/api/pos.ts`
- `systems/enterprise-admin/admin-ui/src/api/dashboard.ts`

**Steps:**
1. Add shared `PosRecommendation` and `ReorderForecastItem` interfaces.
2. Add `posApi.getRecommendations(customerId)` and `dashboardApi.getReorderForecast()`.
3. Keep return shapes aligned to backend tests.
4. Verify with:
   - `npx.cmd vitest run src/__tests__/posApi.test.ts`
   - admin-ui focused test or `npm.cmd run build` if no focused test exists.

### Task 2: Wire POS recommendations

**Files:**
- `systems/enterprise-admin/pos-ui/src/pages/POSCheckoutPage.tsx`
- `systems/enterprise-admin/pos-ui/src/components/CartPanel.tsx`
- `systems/enterprise-admin/pos-ui/src/__tests__/POSCheckoutPage.test.tsx` or a focused new test if existing page tests are absent.

**Steps:**
1. When `selectedCustomer` exists, query `/pos/recommendations/:customerId`.
2. Pass recommendation chips into the cart area.
3. Clicking a chip fetches/uses matching product data and adds it to cart.
4. If no selected customer, optionally defer hot sellers unless Agent A exposed a clean helper.
5. Verify with `npx.cmd vitest run src`.

### Task 3: Wire POS reorder forecast badge

**Files:**
- `systems/enterprise-admin/pos-ui/src/pages/POSCheckoutPage.tsx`
- `systems/enterprise-admin/pos-ui/src/api/pos.ts` or a small analytics API file if cleaner.

**Steps:**
1. Query reorder forecast with TanStack Query.
2. Show `ReorderForecastBadge` in the topbar.
3. Keep the badge non-blocking; failed forecast calls should show no badge, not break checkout.
4. Verify with `npx.cmd vitest run src` and `npm.cmd run build`.

### Task 4: Wire admin dashboard widget

**Files:**
- `systems/enterprise-admin/admin-ui/src/pages/DashboardPage.tsx`
- `systems/enterprise-admin/admin-ui/src/api/dashboard.ts`
- optional new widget component under `admin-ui/src/components/`.

**Steps:**
1. Add `dashboardApi.getReorderForecast()`.
2. Add a compact reorder forecast widget near inventory/KPI context.
3. Show urgent items first, including stock, safety stock, velocity, and urgency label.
4. Verify with admin-ui focused tests/build after reading current scripts.

### Task 5: Final roadmap and verification

**Files:**
- `systems/enterprise-admin/ROADMAP.md`

**Steps:**
1. Mark AI-04~AI-09 complete only after their code and focused verification pass.
2. Run:
   - `npm.cmd run test -- src/__tests__/pos.customerLookup.test.ts src/__tests__/pos.checkout.test.ts src/__tests__/pos.recommendations.test.ts` from backend.
   - `npm.cmd run test -- src/modules/analytics/product-analytics.service.test.ts` from backend.
   - `npx.cmd vitest run src` from pos-ui.
   - `npm.cmd run build` from pos-ui.
3. Report known pre-existing backend build/full-test blockers separately.

---

## Dispatch Status

- Agent A dispatched: backend POS recommendations.
- Agent B dispatched: analytics reorder forecast.
- Agent C dispatched: POS recommendation/reorder UI components.
- Agent D dispatched: admin dashboard integration scout.
