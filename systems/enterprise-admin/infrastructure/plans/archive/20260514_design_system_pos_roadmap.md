# Design System and POS Roadmap Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Turn `systems/DESIGN.md` into an executable roadmap for the Admin SPA redesign, analytics readiness, and POS PWA build-out.

**Architecture:** Keep the existing Admin SPA in `systems/enterprise-admin/admin-ui` and introduce design tokens, shell, primitives, and migration steps before building new analytics and POS surfaces. POS should start as a separately routed PWA surface with its own light layout and can later be split into a standalone app if deployment, offline caching, or device policy requires it.

**Tech Stack:** React 19, Vite, React Router, TanStack Query, Recharts, TypeScript, Vitest, Prisma, Express, PostgreSQL.

---

## Current State

- `systems/DESIGN.md` defines the cross-app design system: dark Admin SPA, light POS PWA, indigo CTAs, tabular financial typography, cards, tables, badges, POS product tiles, cart panel, and touch targets.
- `systems/enterprise-admin/admin-ui` already has Admin pages for dashboard, users, roles, audit logs, CRM, inventory, orders, and reports.
- `AdminLayout.tsx` currently has a sidebar and main content area, but no 56px topbar matching the design system.
- `index.css` has an older theme/token layer. It does not yet match the `dark-900`, `dark-800`, `dark-700`, `primary`, radius, typography, and tabular rules from `DESIGN.md`.
- Backend has useful foundations: tenants, RBAC, customers, products, suppliers, orders, order items, inventory transactions, expenses, and analytics.
- POS is not yet implemented. Missing areas include payment records, shift/cash drawer, terminal/store concepts, receipt numbers, POS sale semantics, idempotency, offline sync, and a touch-first POS UI.

## Roadmap Alignment

This plan should be treated as the bridge between the existing roadmap and the new design system:

- **Phase 6.3:** Design System Rollout for the current Admin SPA.
- **Phase 7:** Analytics pages built on the new Admin cards, tables, badges, charts, and numeric styles.
- **Phase 8:** Sales foundation for POS-capable orders, product batches, shifts, and settlement.
- **Phase 9:** POS PWA UI, checkout flow, offline sync, receipts, and operational hardening.

Carryover from the existing roadmap:

- Finish SaaS multi-tenant isolation and plan gating before enforcing tenant-level POS/store boundaries.
- Treat external integrations as backlog until POS checkout, shift, receipt, and sync flows are stable.

## Product Decisions

Default assumptions for implementation:

- POS starts inside `admin-ui` under `/pos/*` with a separate `PosLayout`, not inside `AdminLayout`.
- Admin shell should default to the dark design from `DESIGN.md`.
- POS should default to light mode and use the touch-first component set from `DESIGN.md`.
- Amounts should migrate away from `Float`; prefer integer cents or Prisma `Decimal` before real POS payments are introduced.
- POS MVP supports cash/card/manual payment recording first. Provider integrations can follow later.
- Offline queue should be designed early, but full offline sync can be implemented after the online MVP checkout works.

## Phase 6.3: Design System Rollout

### DS-01: Token Foundation

**Files:**
- Modify: `systems/enterprise-admin/admin-ui/src/index.css`
- Reference: `systems/DESIGN.md`

**Steps:**
1. Replace or map existing CSS variables to the design tokens in `DESIGN.md`.
2. Add Admin dark shell tokens: `--color-dark-900`, `--color-dark-800`, `--color-dark-700`, `--color-dark-border`.
3. Add POS light tokens: `--color-canvas`, `--color-canvas-soft`, `--color-canvas-muted`, `--color-hairline`.
4. Add semantic soft tokens for success, warning, danger, and info.
5. Add radius, spacing, and shadow variables.
6. Add numeric utilities: `.numeric`, `.tabular`, `.price`, `.price-md`, `.price-lg`, `.price-xl`.
7. Set the font stack to `Inter`, `PingFang TC`, `Microsoft JhengHei`, `system-ui`, `sans-serif`.

**Acceptance Criteria:**
- Every price, quantity, total, percentage, report metric, and table number can use a tabular utility class.
- Admin and POS tokens exist in one shared CSS layer.
- No broad indigo page backgrounds are introduced.

**Verify:**
```powershell
cd "C:\Users\User\OneDrive - MSFT (1)\0.專案\startup\systems\enterprise-admin\admin-ui"
npm run lint
npx tsc --noEmit
```

### DS-02: Admin Shell Migration

**Files:**
- Modify: `systems/enterprise-admin/admin-ui/src/layouts/AdminLayout.tsx`
- Modify: `systems/enterprise-admin/admin-ui/src/index.css`

**Steps:**
1. Update sidebar width to `240px`.
2. Add a 56px topbar above the main content.
3. Move account, tenant, theme, and logout controls into clear shell regions.
4. Set main canvas to `dark-900` and content cards to `dark-800`.
5. Add responsive states: desktop full sidebar, tablet icon-only, mobile drawer or bottom navigation.
6. Replace unstable text/emoji icons with a stable icon library or stable text labels.

**Acceptance Criteria:**
- Admin pages render inside a dark shell with sidebar + topbar.
- Main content has `24px 32px` desktop padding and does not overlap sidebar/topbar.
- Navigation active, hover, and focus states use design tokens.

**Verify:**
```powershell
npm run lint
npx tsc --noEmit
npx vite build --emptyOutDir=false
```

### DS-03: Admin Primitive Components

**Files:**
- Create or modify: `systems/enterprise-admin/admin-ui/src/components/*`
- Modify: `systems/enterprise-admin/admin-ui/src/index.css`

**Steps:**
1. Standardize button styles: primary, secondary, ghost, danger.
2. Standardize stat cards and data cards.
3. Standardize data tables, table headers, row hover, row borders, and numeric cells.
4. Standardize badges and plan chips.
5. Standardize inputs, form fields, focus states, modal surfaces, toast, and skeleton.
6. Add missing utility classes currently used by pages but not defined consistently.

**Acceptance Criteria:**
- Dashboard, table pages, forms, modals, toast, and skeleton can share primitives.
- Badge colors map to semantic soft tokens.
- Tables use `tabular` for numeric columns.

**Verify:**
```powershell
npm run lint
npx tsc --noEmit
```

### DS-04: Dashboard Baseline Migration

**Files:**
- Modify: `systems/enterprise-admin/admin-ui/src/pages/DashboardPage.tsx`
- Modify: `systems/enterprise-admin/admin-ui/src/api/dashboard.ts` only if shape cleanup is required

**Steps:**
1. Convert dashboard stat cards to the new stat card pattern.
2. Convert chart containers to data cards.
3. Use semantic badges for trends, alerts, and status.
4. Apply tabular numeric classes to revenue, margin, AOV, LTV, percentages, and counts.
5. Remove hard-coded colors where design tokens exist.

**Acceptance Criteria:**
- Dashboard becomes the visual reference page for the Admin design system.
- Chart labels and tooltips are readable on dark surfaces.
- Loading, empty, and error states match the new shell.

**Verify:**
```powershell
npm run lint
npx tsc --noEmit
npm run dev
```

### DS-05: Table-Heavy Page Migration

**Files:**
- Modify: `systems/enterprise-admin/admin-ui/src/pages/CRM/*.tsx`
- Modify: `systems/enterprise-admin/admin-ui/src/pages/Inventory/*.tsx`
- Modify: `systems/enterprise-admin/admin-ui/src/pages/Orders/*.tsx`
- Modify: `systems/enterprise-admin/admin-ui/src/pages/Reports/*.tsx`
- Modify: `systems/enterprise-admin/admin-ui/src/pages/UsersPage.tsx`
- Modify: `systems/enterprise-admin/admin-ui/src/pages/RolesPage.tsx`
- Modify: `systems/enterprise-admin/admin-ui/src/pages/AuditLogsPage.tsx`

**Steps:**
1. Migrate one domain at a time: CRM, Inventory, Orders, Reports, Admin.
2. Replace hard-coded colors and inline spacing with shared classes.
3. Apply table, badge, input, button, and numeric utilities.
4. Verify table overflow behavior at desktop, tablet, and mobile widths.

**Acceptance Criteria:**
- All Admin pages share the same shell, cards, tables, buttons, inputs, and badges.
- Numeric and currency columns are tabular.
- Mobile/tablet layouts remain usable.

**Verify:**
```powershell
npm run lint
npx tsc --noEmit
npx vite build --emptyOutDir=false
```

## Phase 7: Analytics Readiness

### ANA-01: Analytics UI Foundation

**Files:**
- Modify: `systems/enterprise-admin/admin-ui/src/pages/CRM/CrmAnalyticsPage.tsx`
- Modify: `systems/enterprise-admin/admin-ui/src/pages/Inventory/InventoryAnalyticsPage.tsx`
- Modify: `systems/enterprise-admin/admin-ui/src/pages/DashboardPage.tsx`

**Steps:**
1. Define reusable analytics cards, chart cards, filter bars, and metric rows.
2. Apply the new Admin table/card/badge primitives.
3. Prepare layouts for RFM, churn risk, product ABC, supplier ranking, bonus gate, and heatmap.
4. Keep chart containers readable on dark surfaces.

**Acceptance Criteria:**
- Analytics pages can be extended without creating one-off visual patterns.
- RFM, churn, product, supplier, and bonus-gate pages can reuse the same primitives.

### ANA-02: Analytics Backend Continuation

**Files:**
- Modify: `systems/enterprise-admin/backend/src/modules/analytics/*`
- Test: `systems/enterprise-admin/backend/src/__tests__/analytics.service.test.ts`

**Steps:**
1. Continue Phase 7 endpoints for RFM, churn risk, product ABC, supplier ranking, bonus gate, and heatmap.
2. Keep response envelopes consistent.
3. Add tests for tenant scoping and empty datasets.

**Acceptance Criteria:**
- Analytics APIs support future Admin visual pages.
- Tenant isolation is tested.

## Phase 8: Sales and POS Data Foundation

### POS-DB-01: Money and Tenant Safety

**Files:**
- Modify: `systems/enterprise-admin/backend/prisma/schema.prisma`
- Modify: `systems/enterprise-admin/backend/prisma/seed.ts`
- Test: backend tests under `systems/enterprise-admin/backend/src/__tests__/`

**Steps:**
1. Decide whether money uses integer cents or Prisma `Decimal`.
2. Migrate product prices, order totals, item unit prices, payment amounts, refunds, and discounts.
3. Replace global unique constraints for tenant-owned data with tenant-scoped unique constraints where needed.
4. Add migration and update seed data.

**Acceptance Criteria:**
- POS money math does not rely on floating point.
- Tenant-owned SKUs/categories/tags do not conflict across tenants.

### POS-DB-02: POS Transaction Models

**Files:**
- Modify: `systems/enterprise-admin/backend/prisma/schema.prisma`
- Create or modify: backend migration files

**Steps:**
1. Extend `Order` or introduce POS sale fields: order number, receipt number, source, cashier, terminal, shift, subtotal, discount total, tax total, rounding, paid time, void/refund metadata.
2. Add payment model for cash, card, mobile, mixed payment, change due, provider reference, and status.
3. Add store, terminal, shift, cash drawer event, and daily settlement models.
4. Add idempotency key fields for safe retries.

**Acceptance Criteria:**
- POS checkout can be represented without overloading generic admin orders.
- Shift and cash drawer workflows have first-class data.
- Duplicate offline/online submissions can be detected.

### POS-API-01: POS Service and Endpoints

**Files:**
- Create: `systems/enterprise-admin/backend/src/modules/pos/pos.routes.ts`
- Create: `systems/enterprise-admin/backend/src/modules/pos/pos.controller.ts`
- Create: `systems/enterprise-admin/backend/src/modules/pos/pos.service.ts`
- Create: `systems/enterprise-admin/backend/src/modules/pos/pos.schema.ts`
- Modify: `systems/enterprise-admin/backend/src/app.ts`

**Steps:**
1. Add catalog and product search endpoints.
2. Add customer lookup and quick-create endpoints.
3. Add price preview endpoint for authoritative totals.
4. Add sale creation endpoint with transaction-safe stock decrement, payment record, inventory transaction, customer stat update, and audit log.
5. Add receipt, void, refund, shift open/close, cash drawer, and sync endpoints.
6. Add RBAC permissions: `pos:read`, `pos:sell`, `pos:void`, `pos:refund`, `pos_shift:manage`.

**Acceptance Criteria:**
- POS checkout writes all required records in one transaction.
- Insufficient stock, duplicate idempotency key, invalid payment totals, and unauthorized actions return clear errors.

**Verify:**
```powershell
cd "C:\Users\User\OneDrive - MSFT (1)\0.專案\startup\systems\enterprise-admin\backend"
npm run lint
npm run test
npm run build
```

## Phase 9: POS PWA

### POS-UI-01: POS Layout and Routing

**Files:**
- Modify: `systems/enterprise-admin/admin-ui/src/App.tsx`
- Create: `systems/enterprise-admin/admin-ui/src/layouts/PosLayout.tsx`
- Create: `systems/enterprise-admin/admin-ui/src/pages/POS/PosPage.tsx`
- Create: `systems/enterprise-admin/admin-ui/src/api/pos.ts`

**Steps:**
1. Add `/pos` routes outside `AdminLayout`.
2. Build a light `PosLayout` using `canvas`, `canvas-soft`, and `hairline` tokens.
3. Add `PosTopbar`, category area, product grid area, and cart panel area.
4. Ensure POS does not inherit the Admin dark sidebar shell.

**Acceptance Criteria:**
- `/pos` opens a full-screen light POS surface.
- Desktop uses product grid + fixed cart panel.
- Mobile/tablet can move the cart into a bottom sheet pattern.

### POS-UI-02: Cart and Checkout MVP

**Files:**
- Create: `systems/enterprise-admin/admin-ui/src/hooks/useCart.ts`
- Create: `systems/enterprise-admin/admin-ui/src/hooks/usePosCatalog.ts`
- Create: POS components under `systems/enterprise-admin/admin-ui/src/components/pos/`

**Steps:**
1. Build `ProductTile`, `CategoryTabs`, `ProductGrid`, `CartPanel`, `CartItemRow`, `QtyStepper`.
2. Build `CustomerLookup`, `PaymentMethodSelector`, `CashPaymentPanel`, and `ReceiptView`.
3. Enforce POS touch targets: checkout `56px`, general actions `48px`, tabs `40px`, stepper visible size `36px`, product tile `100px`.
4. Apply tabular numeric utilities to all prices, totals, quantity, and change due.

**Acceptance Criteria:**
- Cashier can add products, adjust quantities, see totals, choose payment, submit sale, and view receipt.
- Product tiles and checkout controls follow `DESIGN.md`.

### POS-PWA-01: Installability and Offline Queue

**Files:**
- Modify: `systems/enterprise-admin/admin-ui/vite.config.ts`
- Create: PWA manifest/service worker files as chosen by implementation
- Create: `systems/enterprise-admin/admin-ui/src/hooks/useOfflineQueue.ts`

**Steps:**
1. Add PWA manifest and service worker setup.
2. Cache POS shell and catalog data.
3. Store cart draft and offline sales queue in IndexedDB.
4. Add online/offline status and sync status UI.
5. Send queued sales through idempotent sync endpoint.

**Acceptance Criteria:**
- POS can open as an installable PWA.
- Catalog remains readable offline.
- Offline sales are queued and synced safely when network returns.

## Verification Matrix

Run after major milestones:

```powershell
cd "C:\Users\User\OneDrive - MSFT (1)\0.專案\startup\systems\enterprise-admin\admin-ui"
npm run lint
npx tsc --noEmit
npx vite build --emptyOutDir=false
```

```powershell
cd "C:\Users\User\OneDrive - MSFT (1)\0.專案\startup\systems\enterprise-admin\backend"
npm run lint
npm run test
npm run build
```

Manual visual QA:

- Admin desktop: `1440px`
- Admin tablet: `1024px`
- Admin mobile: `390px`
- POS desktop/tablet landscape: `1024px+`
- POS tablet: `768px - 1023px`
- POS mobile: `< 768px`

Must check:

- Sidebar/topbar do not overlap.
- Tables scroll or reflow cleanly.
- Badges remain readable on dark surfaces.
- Chart labels and tooltips are readable.
- POS tiles and buttons meet minimum touch sizes.
- All currency, quantity, and metric text uses tabular numerals.

## Recommended Subagent Work Split

When implementing, split work by ownership:

- **Agent A: Admin Shell and Tokens**
  - Owns `index.css`, `AdminLayout.tsx`, shell primitives.
  - Does not edit POS pages.

- **Agent B: Admin Page Migration**
  - Owns dashboard, CRM, inventory, orders, reports, users, roles, audit pages.
  - Uses primitives from Agent A.

- **Agent C: POS Backend**
  - Owns Prisma schema, migrations, `backend/src/modules/pos`, RBAC seed, backend tests.
  - Does not edit frontend layout.

- **Agent D: POS Frontend**
  - Owns `PosLayout`, `/pos` routes, cart/catalog hooks, POS components, PWA shell.
  - Coordinates API contract with Agent C.

## Execution Order

1. DS-01 Token Foundation.
2. DS-02 Admin Shell Migration.
3. DS-03 Admin Primitive Components.
4. DS-04 Dashboard Baseline Migration.
5. DS-05 Table-Heavy Page Migration.
6. ANA-01/ANA-02 Analytics Readiness.
7. POS-DB-01/POS-DB-02 Data Foundation.
8. POS-API-01 POS API.
9. POS-UI-01/POS-UI-02 POS Frontend MVP.
10. POS-PWA-01 Installability and Offline Queue.

## Open Questions

- Should POS remain inside `admin-ui` for MVP, or should it become a standalone `pos-ui` app immediately?
- Should money use integer cents or Prisma `Decimal`?
- Should offline sales be in MVP, or should MVP be online-only with offline architecture prepared?
- Which payment methods are in v1: cash only, cash + card, or manual all-method recording?
- Is receipt printing required in v1, or is screen receipt enough?
