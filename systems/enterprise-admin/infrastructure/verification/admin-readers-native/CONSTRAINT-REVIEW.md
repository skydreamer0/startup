# Reader fixture constraint review

The fixture runs only inside the existing exact-head, exclusive, initially empty PostgreSQL 15 acceptance service. It adds three new UUID tenants and exact-ID-owned rows, then removes those IDs in dependency order. Native execution is still NOT_RUN until an accepted hosted artifact exists.

`migration-constraints.json` records all 16 migration byte hashes and every CHECK, FK, UNIQUE, NOT NULL, ALTER COLUMN, DROP CONSTRAINT/INDEX, trigger or function statement. This is an inventory for review, not proof that PostgreSQL has executed the fixture.

## Seeded tables

- tenants: id/name/slug present; slug UUID-unique, plan pro. No fallback tenant is created or used.
- users: UUID id, unique synthetic email, placeholder non-login hash, full name, active/suspended status and owned tenant. Prisma supplies created/updated timestamps and failed-login defaults. No real credentials or embedded JWT permissions.
- roles: unique `(name, tenant_id)`, explicit owned tenant. Permission rows use existing read resources or absent-ID-proven newly owned UUIDs; `(action, resource)` uniqueness is preserved. role_permissions and user_roles use existing exact-owned user/role/permission FKs and composite PKs.
- suppliers/product_categories: explicit existing owned tenant, names present, nullable metrics remain null rather than fabricated zero. A/B suppliers deliberately share a display name.
- products: explicit SKU/name/cost/retail/stock and owned tenant. Same SKU exists once in A and once in B, respecting `(sku, tenant_id)`. Decimal values are finite and within precision; category/supplier IDs exist. One A product deliberately has B's category/supplier: the current schema has simple ID FKs, so this legacy row is legal; reader output must mask foreign labels and supplier ranking must exclude that foreign relation from its numerator/denominator.
- customers: explicit UUID/name/tenant; optional phone and LINE IDs remain null, preserving tenant uniqueness.
- orders: explicit existing same-tenant customer, unique nullable order numbers, completed/paid values, finite totals and fixed January UTC timestamps. Optional shift/staff FKs stay null. Decimal conversion migration is honored.
- order_items: existing order/product IDs and positive integer quantities/finite decimal prices. One A order deliberately links to B product via current simple ID FKs. This is a synthetic legacy sentinel, not a supported write path; scoped reader queries must exclude it.
- product_batches: existing A product/tenant, positive quantity, QUARANTINE status, cost and Date expiry. Composite `(id, product_id, tenant_id)` keys support receipt linkage.
- inventory_transactions: A receipt uses exact A batch/product/tenant, type IN, positive integer quantity and explicit nonnegative `costPriceAtReceipt: 1`. This honors `inventory_transactions_receipt_check`, which Prisma schema alone does not express. A second legacy A movement has no batch, links to existing B product via the simple FK, and omits snapshot: the SQL CHECK explicitly permits a NULL batch; reader current-cost estimate must exclude the foreign product.
- expenses: existing tenant, finite decimal amount, fixed period and existing free-text type.

## Unseeded constraint-bearing tables

sale_batch_allocations, checkout_commands, order_number_counters, product_batch_changes, product_packages, product_package_revisions, product_package_identifiers, receiving_drafts and receiving_draft_revisions receive no rows in this journey. Their append-only/deferred trigger functions, CHECK/composite FKs therefore have no new fixture values to satisfy. Existing parent journeys and their required checks remain unchanged. All public tables, including these, participate in raw before/after equality and the parent zero-row/owned-DB cleanup.

## Cleanup order and failure boundaries

role_permissions/user_roles -> order_items/inventory_transactions -> orders/product_batches -> products/expenses/customers/suppliers/categories -> roles/users -> tenants -> only newly created permission IDs. No TRUNCATE or unscoped delete is introduced. A collision before ownership prevents any cleanup authority. Partial seed failures still remove exact-owned rows and remain FAILED. Deletion errors or a nonzero remaining count cannot report cleanup success.

Independent review must inspect all inventory statements against this mapping and the actual fixture before publication. The current-state checks and synthetic receipts do not authorize actual store data, refund policy, historical-cost reconciliation or live payment decisions.
