# System Architecture

## Current system

PharmaSaaS has one active system, `systems/enterprise-admin`. Both Admin and POS
are implemented standalone React/Vite SPAs, sharing an Express API and PostgreSQL
through Prisma. The backend is a modular monolith. This describes repository
architecture, not a confirmed production deployment.

```text
admin-ui (dev 5173) ─┐
                    ├─ /api/v1/admin → Express backend (dev 3000) → Prisma → PostgreSQL
pos-ui   (dev 5174) ─┘
admin product label → workstation loopback local-print-agent → BLE label printer
```

The development Compose database publishes host port 5433; that is not a
production network prescription. Product labels use a separate Windows Python
agent. POS receipt printing is another workflow, not that label bridge.

## Where execution starts

| Boundary | Existing source |
| -------- | --------------- |
| Admin routes | [admin-ui/src/App.tsx](../systems/enterprise-admin/admin-ui/src/App.tsx) |
| POS routes and checkout | [pos-ui/src/App.tsx](../systems/enterprise-admin/pos-ui/src/App.tsx), [POSCheckoutPage](../systems/enterprise-admin/pos-ui/src/pages/POSCheckoutPage.tsx) |
| API process and route tree | [server.ts](../systems/enterprise-admin/backend/src/server.ts), [app.ts](../systems/enterprise-admin/backend/src/app.ts) |
| Domain orchestration | `backend/src/modules/`: routes/controllers/services use shared policy and persistence helpers. |
| Persistent data | [schema.prisma](../systems/enterprise-admin/backend/prisma/schema.prisma) and its committed migrations, including SQL constraints not expressible in Prisma DSL. |

Use [navigation](agents/navigation.md) and the selected MODULE before opening
source trees. Backend npm and frontend/shared pnpm remain separate install
boundaries. [ADR-012](../systems/enterprise-admin/infrastructure/adr/adr_012_shared_ui_library_decision.md)
defers a shared UI package until real cross-app reuse justifies it.

## Transactions and workflow boundaries

- **Sale inventory:** [InventoryPostingService](../systems/enterprise-admin/backend/src/lib/inventory-posting.ts)
  is shared by POS and general orders. Aggregate product debit, eligible FEFO
  batches, OUT movements and allocations use the caller's transaction with the
  order. This is not a completed cutover of every inventory writer; see ADR-013/014
  and [#29](https://github.com/skydreamer0/startup/issues/29).
- **Checkout:** [CheckoutCommandService](../systems/enterprise-admin/backend/src/modules/pos/checkout-command.service.ts)
  binds tenant/type/commandId to a normalized payload hash and durable result in
  the same transaction. [checkoutRecoveryStore](../systems/enterprise-admin/pos-ui/src/store/checkoutRecoveryStore.ts)
  freezes the pre-submit intent. Unknown means query or replay the identical
  command, not a new sale; known conflict must not become retryable unknown.
- **Refund:** [ADR-015](../systems/enterprise-admin/infrastructure/adr/adr_015_refund_without_stock_receipt.md)
  registers refund status without stock receipt or provider transfer. Actual
  return, quarantine/release and financial reconciliation are separate work.
- **Receiving:** [ReceivingDraft service](../systems/enterprise-admin/backend/src/modules/receiving-drafts/receiving-drafts.service.ts)
  owns actor-private snapshots with revision CAS and append-only history. It does
  not create a formal receipt or post stock. Do not conflate draft review with
  inventory approval.
- **Scan, OCR and print:** local evidence and proposals do not change quantities.
  Reviewed product/package revisions are the mapping authority (ADR-024).
  `P1:<SKU>` is a product label identifier, not batch identity or bin authority.
  OCR/source-image and complete receipt workflows remain open.

## Authentication and tenant isolation

`app.ts` establishes the shared API router and tenant context. Each route's
policy applies the required authentication, plan, permission and input validation;
public authentication routes are not described as already-authenticated endpoints.
Services and persistence must preserve the authenticated tenant/actor scope.

[prisma.ts](../systems/enterprise-admin/backend/src/lib/prisma.ts) injects tenant
filters for models in [tenant-scoped-models.ts](../systems/enterprise-admin/backend/src/lib/tenant-scoped-models.ts).
It is not a blanket guarantee for raw SQL, every child model/relation, or every
transaction operation. Check [tenant-persistence.ts](../systems/enterprise-admin/backend/src/lib/tenant-persistence.ts),
explicit relation predicates and cross-tenant tests when changing readers/writers.
Single-store operation does not justify bypassing isolation or RBAC.

## Decisions, status and evidence

Requirements and acceptance live in [#31](https://github.com/skydreamer0/startup/issues/31)
and [#37](https://github.com/skydreamer0/startup/issues/37). Accepted
[ADRs](../systems/enterprise-admin/infrastructure/adr/), the
[API contract](../systems/enterprise-admin/infrastructure/api/api_spec.md), schema
and migrations define their respective technical boundaries. This overview adds
no new architecture decision. Some ADRs retain proposal-era status text; consult
[ROADMAP](../systems/enterprise-admin/ROADMAP.md#current-status), current head,
merged PRs and scoped evidence rather than promoting their status by inference.

The earlier plan to add `systems/pos/` is obsolete: [ADR-008](../systems/enterprise-admin/infrastructure/adr/adr_008_pos_standalone_spa.md)
and existing `pos-ui` establish the separate SPA inside this system. There is no
current requirement to create `systems/pos/` or `packages/shared/`. The older
[enterprise infrastructure blueprint](../systems/enterprise-admin/infrastructure/system_architecture.md#historical-blueprint)
is retained as history, not proof that microservices, Kubernetes, OIDC, a broker,
NoSQL, search or distributed tracing are deployed.

Production readiness, backup/restore, real printers/scanners and Safari/iPad still
need their own evidence. A green CI or an architecture diagram cannot release G0–G7.
