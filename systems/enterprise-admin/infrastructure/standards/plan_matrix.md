# Plan Feature Matrix

This document defines which features are unlocked at each subscription plan tier.

Plan hierarchy (ascending):

1. `free`
2. `starter`
3. `pro`

A higher plan inherits all features of the lower plans. Backend gating is enforced by
`requirePlan()` middleware (`backend/src/middleware/plan.middleware.ts`). The canonical
feature-key list per plan is defined in `backend/src/lib/plan-features.ts` and exposed
to clients via `GET /api/v1/admin/tenants/me/plan`.

## Feature Matrix

| Feature Key              | Description                                  | free | starter | pro |
| ------------------------ | -------------------------------------------- | :--: | :-----: | :-: |
| `auth`                   | Login / refresh / logout                     |  Y   |    Y    |  Y  |
| `users:crud`             | Users CRUD                                   |  Y   |    Y    |  Y  |
| `roles`                  | Roles & permissions                          |  Y   |    Y    |  Y  |
| `products:crud`          | Products CRUD                                |  Y   |    Y    |  Y  |
| `suppliers`              | Suppliers management                         |  Y   |    Y    |  Y  |
| `customers`              | Customers (CRM list & detail)                |  Y   |    Y    |  Y  |
| `orders`                 | Orders CRUD                                  |  Y   |    Y    |  Y  |
| `pos:basic_checkout`     | POS basic checkout                           |  Y   |    Y    |  Y  |
| `audit_logs`             | Audit log viewer                             |  Y   |    Y    |  Y  |
| `analytics:kpis`         | Basic KPI dashboard                          |  -   |    Y    |  Y  |
| `analytics:trends`       | KPI trends                                   |  -   |    Y    |  Y  |
| `reports:margin`         | Margin analysis report                       |  -   |    Y    |  Y  |
| `reports:cashflow`       | Cash flow statement                          |  -   |    Y    |  Y  |
| `reports:sales_ranking`  | Sales ranking report                         |  -   |    Y    |  Y  |
| `inventory:batches`      | Batch / expiry inventory analytics           |  -   |    Y    |  Y  |
| `inventory:shifts`       | Shift / operational analytics                |  -   |    Y    |  Y  |
| `analytics:rfm`          | RFM customer segmentation                    |  -   |    -    |  Y  |
| `analytics:churn_risk`   | Customer churn risk                          |  -   |    -    |  Y  |
| `analytics:product_abc`  | Product ABC analysis                         |  -   |    -    |  Y  |
| `analytics:supplier_ranking` | Supplier composite ranking               |  -   |    -    |  Y  |
| `analytics:heatmap`      | Sales heatmap                                |  -   |    -    |  Y  |
| `analytics:bonus_gate`   | Bonus gate operational KPI                   |  -   |    -    |  Y  |

## Plan Definitions

### free
Auth, Users CRUD, Roles, Products CRUD, Suppliers, Customers, Orders, POS basic
checkout, Audit logs.

### starter
Everything in `free`, plus:
- Basic KPI dashboard (`/analytics/kpis`)
- KPI trends (`/analytics/trends`)
- Financial reports: margin, cashflow, sales-ranking
- Inventory analytics: batches and shifts

### pro
Everything in `starter`, plus advanced analytics:
- RFM segmentation (`/analytics/rfm`)
- Churn risk (`/analytics/churn-risk`)
- Product ABC (`/analytics/product-abc`)
- Supplier ranking (`/analytics/supplier-ranking`)
- Heatmap (`/analytics/heatmap`)
- Bonus gate (`/analytics/bonus-gate`)

## Enforcement

- **Backend**: Each gated route declares `requirePlan('<plan>')` after auth & RBAC.
  The middleware reads the current plan from `tenantContext` (populated by
  `setTenantContext` from the JWT or DB lookup) and returns `403 PLAN_UPGRADE_REQUIRED`
  if the tenant's plan is lower than required.
- **Frontend**: `usePlan()` hook calls `GET /tenants/me/plan` once and caches via
  TanStack Query. The `<PlanGate plan="...">` component renders children only when
  the current plan meets the threshold; otherwise it renders an "Upgrade required"
  placeholder. Sidebar links and pro-only sections are wrapped in `<PlanGate>`.
