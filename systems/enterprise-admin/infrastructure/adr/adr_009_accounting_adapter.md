# ADR-009: External Accounting System Adapter Pattern

**Date:** 2026-05-19
**Status:** Accepted
**Branch:** worktree-agent (Phase 6 INT-03)

> Note: ADR-008 was already reserved for the POS standalone SPA decision (see `adr_008_pos_standalone_spa.md`). This ADR is numbered 009 to preserve the existing ADR sequence even though the original INT-03 plan referred to it as "ADR-008 (accounting adapter)".

## Context

Phase 6 INT-03 requires pushing finalized orders and recorded expenses to external accounting systems (QuickBooks Online, Xero) so that pharmacy operators can keep their books reconciled without manual re-keying. Constraints driving the design:

1. **Multiple backends.** Customers will pick QuickBooks or Xero based on their existing accounting software. We may add additional providers later (Freshbooks, locally-popular SaaS in Taiwan, …).
2. **No live credentials yet.** During the scaffold phase we have neither a QuickBooks Online developer app nor a Xero Partner account. We need an in-memory implementation so business code and UI flows can be exercised end-to-end before either real SDK is wired in.
3. **Per-tenant configuration.** Each `Tenant` may select a different provider (or none at all). The choice has to live somewhere mutable — we already have a `Tenant.settings` JSON-string column, which avoids a schema change.
4. **Auditable.** Finance regulations and customer trust require us to know exactly which order/expense was pushed, when, to which external ID, and how to retry on failure.
5. **Plan gating.** The accounting export feature ships on the `pro` plan tier; lower tiers must be blocked at both the route and UI layers.

Coupling business code directly to QuickBooks/Xero SDK calls would scatter provider-specific logic across `orders`, `expenses`, and any future modules — and would make local testing painful (real OAuth, sandbox APIs, rate limits).

## Decision

1. **Adapter pattern via `AccountingProvider` interface.**
   Defined in `backend/src/modules/accounting/providers/types.ts`. Business code never touches a provider SDK directly — it asks the factory for the tenant's configured provider and calls the typed interface.

   ```ts
   interface AccountingProvider {
       readonly name: 'mock' | 'quickbooks' | 'xero';
       syncOrder(payload: OrderSyncPayload): Promise<{ externalId: string }>;
       syncExpense(payload: ExpenseSyncPayload): Promise<{ externalId: string }>;
       isConfigured(): boolean;
   }
   ```

2. **Concrete implementations:**
   - `MockProvider` — always configured, returns `MOCK-<uuid>` external IDs. Default for every tenant. Used in development, demos, and tests.
   - `QuickBooksProvider` — stub. Checks for `QUICKBOOKS_CLIENT_ID` / `QUICKBOOKS_CLIENT_SECRET` env vars. If absent, `isConfigured()` returns `false` and both `syncOrder` / `syncExpense` throw `AppError(503, …, 'INTEGRATION_NOT_CONFIGURED')`. Real OAuth + Invoice API calls are TODO.
   - `XeroProvider` — stub. Same pattern with `XERO_CLIENT_ID` / `XERO_CLIENT_SECRET`.

3. **Provider selection per-tenant.**
   The factory `getProviderForTenant(tenantId)` reads `Tenant.settings` (JSON-string column), parses it defensively, and reads the `accountingProvider` key. Missing or unknown value falls back to `'mock'`. The factory uses `basePrisma` (no tenant filter) because the `Tenant` table itself is non-tenant-scoped.

4. **Audit table `AccountingSyncLog`.**
   Every sync attempt (success or failure) writes a row keyed by `(tenantId, entityType, entityId)`. Status is `pending | synced | failed`. The service is **idempotent** — if a row with `status='synced'` already exists for `(entityType, entityId)`, the second call short-circuits and returns the cached log.

5. **Plan + RBAC gating.**
   Routes require `requirePlan('pro')` plus `requirePermission('manage:accounting')` (writes) or `requirePermission('read:accounting')` (reads). The UI wraps the page in `<PlanGate plan="pro">` and hides the sidebar entry below `pro`.

## Consequences

**Positive**
- Business code stays provider-agnostic. Adding a third provider means writing one file and registering it in the factory.
- Mock provider enables end-to-end UI development and integration tests without any external account.
- Audit log gives operators (and us, during incident response) a clear record of what synced and what didn't.
- `Tenant.settings` JSON avoids a schema change; if the field grows, we can split it into a typed column later.

**Negative / Trade-offs**
- `Tenant.settings` is `String?` (JSON-as-text). Misconfigured JSON would otherwise crash callers, so the factory parses defensively (`JSON.parse(settings || '{}')` inside `try/catch`) and falls back to mock.
- The `AccountingSyncLog` uniqueness on `(tenantId, entityType, entityId)` is an **index**, not a `UNIQUE` constraint — this leaves room for the future "manual retry creates a new attempt row" pattern but means idempotency is enforced in the service layer.
- Real SDK integration (QuickBooks `intuit-oauth` + `node-quickbooks`, Xero `xero-node`) is **deferred**. Switching providers from mock to live will require OAuth callback routes and a token store — both out of scope for INT-03 scaffolding.

## Alternatives Considered

- **Single class with branches.** Rejected — every new provider would require touching the same file, and provider-specific dependencies (OAuth libs) would pollute the bundle even for tenants not using that provider.
- **Webhook fan-out via a message queue.** Overkill for current scale; can be layered on top of this adapter later by adding a `QueuedProvider` decorator.
- **Storing provider config in a new `TenantIntegration` table.** Cleaner long-term but adds schema work that isn't justified by INT-03 alone. Revisit when we add OAuth token storage.

## References

- `systems/enterprise-admin/backend/src/modules/accounting/` — implementation
- `systems/enterprise-admin/admin-ui/src/pages/AccountingSyncPage.tsx` — UI
- ROADMAP Phase 6 INT-03
