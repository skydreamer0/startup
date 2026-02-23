# ADR-006: SaaS Multi-Tenancy Architecture

## Status
Accepted

## Context
The Enterprise Admin System (Phase 5) is evolving from a single-tenant MVP to a multi-tenant SaaS platform. We need an architecture that securely isolates data between different corporate accounts, allows flexible feature gating based on subscription plans, and supports scalable growth without excessive operational overhead.

## Decision
We will adopt a **Shared Database, Shared Schema (Row-Level Isolation)** approach for multi-tenancy.

### Key Implementation Details:
1. **Tenant Model**: A core `Tenant` table will track accounts (`name`, `slug`, `plan`, `settings`).
2. **Foreign Keys**: Every operational data table (`User`, `Customer`, `Product`, `Order`, `Interaction`, `AuditLog`) will include a `tenant_id` column.
3. **Application-Level Routing**:
   - The frontend will extract the tenant context (e.g., from subdomain `company.saas.com` or user selection) and pass it to the backend via a customized HTTP Header (`X-Tenant-Id`) or encoded within the JWT.
   - A global Express middleware will intercept requests, validate the tenant context, and inject it into the `res.locals` or request object.
4. **Prisma Middleware/Extensions**:
   - We will utilize Prisma Client Extensions or middleware to automatically inject `where: { tenantId: currentTenantId }` on all read and update queries.
   - `create` operations will auto-inject the `tenantId`.
5. **Feature Gating**:
   - Subscription plans (`free`, `starter`, `pro`) are tracked on the `Tenant`. API middlewares (`requirePlan`) will enforce access to advanced modules (e.g., Financial Reports) based on this field.

## Alternatives Considered

| Alternative | Pros | Cons | Reason for Rejection |
|---|---|---|---|
| **Database-per-Tenant** | Ultimate data isolation; easy backup/restore per tenant; distinct scaling vectors. | Extremely high DevOps overhead; complex schema migrations; higher infrastructure costs. | Too operationally heavy for our current startup phase. Excessive cost structure. |
| **Schema-per-Tenant** (PostgreSQL specifically) | Good isolation; uses a single DB connection pool; easier backup than DB-per-tenant. | Schema migrations are still slow and complex (running changes across N schemas); tooling support (like Prisma) is often clunky. | Prisma's support for multi-schema is complex and brittle for dynamic tenant creation. |

## Consequences
- **Positive:**
  - Standardized DevOps: Migrations apply globally once.
  - Cost Effective: Single database instance serves all tenants.
  - Simplified Reporting: Easy to run cross-tenant aggregate analytics (e.g., calculating MRR) from a single schema.
- **Negative:**
  - **Data Leakage Risk:** A missing `tenant_id` filter in a custom SQL query or a bug in the Prisma extension could expose data from Tenant A to Tenant B. We must rely heavily on automated middleware and testing to mitigate this.
  - **Noisy Neighbor Problem:** A heavy querying tenant could degrade performance for others. We will need to monitor resource consumption and potentially implement per-tenant rate limiting.
  - **Backup/Restore Restrictions:** Restoring a single tenant's data to a point in time is technically complex since they share tables.

## Next Steps
1. Update `schema.prisma` to include `Tenant` and apply `tenantId` to existing models.
2. Implement backend middleware (`tenant.middleware.ts`) and Prisma client extensions.
3. Refactor existing controllers to utilize the tenant context strictly.
