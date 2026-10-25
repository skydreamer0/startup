# enterprise-admin Context

## Product summary

PharmaSaaS supports one pharmacy's daily work: product/package maintenance,
receiving preparation, batch stock, checkout, members, labels and reports.
It is still in development and bounded acceptance, not cleared for store operation.
Two existing React/Vite SPAs (`admin-ui` and `pos-ui`) call one Express/Prisma API
and PostgreSQL database. This is a modular monolith, not separate POS microservices.

## Important sources

| Question | Read and authority |
| -------- | ------------------ |
| What must the product do? | [#31](https://github.com/skydreamer0/startup/issues/31), [#37](https://github.com/skydreamer0/startup/issues/37), original AC and subsequent confirmed decisions; [#37 gap index](https://github.com/skydreamer0/startup/issues/37#issuecomment-6331185482) routes the remaining work. |
| What is implemented or still pending? | [ROADMAP.md](ROADMAP.md#current-status), then the current PR/head and its bounded evidence. Old Draft/proposed labels and merged code alone do not establish acceptance. |
| Which architecture constraints apply? | Accepted decisions in [infrastructure/adr/](infrastructure/adr/); [current architecture](../../docs/architecture.md) is a summary, not a new decision. Proposed ADRs retain their status and must be read with their actual merge/evidence record. |
| What API and model should code follow? | [API contract](infrastructure/api/api_spec.md) and its linked contracts; [Prisma schema](backend/prisma/schema.prisma) plus committed SQL migrations for constraints beyond Prisma DSL. |
| Where do I start a change? | [Task navigation](../../docs/agents/navigation.md), then the nearest MODULE and source/tests. |
| What is the UI workflow? | [Design MASTER role journeys](infrastructure/design-system/MASTER.md#role-journeys); this maps the existing requirements, not a second product backlog. |
| Which workflow applies? | [Standards](infrastructure/standards/), especially [Git workflow](infrastructure/standards/git_workflow.md) and [dependency boundaries](infrastructure/standards/dependency_management.md). |

An issue brief or older plan does not override the user's latest scope, stop
instruction or permission. Historical design proposals and evidence remain useful,
but do not silently promote them to current requirements or passed gates.

## Module map

| Area | Entry | Responsibility |
| ---- | ----- | -------------- |
| Admin UI | [admin-ui/MODULE.md](admin-ui/MODULE.md), `admin-ui/src/App.tsx` | Back-office routes, product/package maintenance, ReceivingDraft, batch trace, reports and label entry. |
| POS UI | [pos-ui/MODULE.md](pos-ui/MODULE.md), `pos-ui/src/pages/POSCheckoutPage.tsx` | Employee entry, cart, explicit package lookup, checkout/recovery and refund registration. |
| Backend | [backend/MODULE.md](backend/MODULE.md), `backend/src/server.ts` → `backend/src/app.ts` | Shared `/api/v1/admin` route tree, auth/RBAC, tenant-aware services and transactions. |
| Shared types | [packages/types/MODULE.md](packages/types/MODULE.md) | Frontend/shared wire types and local scan evidence; not a second persistence authority. |
| Infrastructure | `infrastructure/` | ADRs, API contracts, standards and bounded verification records. |
| Local print agent | [local-print-agent/README.md](local-print-agent/README.md) | Separately installed Windows Python/Bleak loopback label service; separate from POS receipts and cloud backend. |

`tenant` is the isolated customer workspace; single-store scope never removes
that boundary. Backend has its own npm lock; frontend/shared packages use the
system-root pnpm workspace. There is no shared `packages/ui` extraction by default.

## Invariants to keep

- **One sale posting boundary, not all-writer completion.** POS and general orders
  use `InventoryPostingService` in the caller-owned transaction for product/batch
  debits, OUT movements and allocations. FEFO uses eligible released batches and
  Asia/Taipei expiry dates. Physical aggregate stock is not sellable availability.
  Other writers, opening/rebuild, bins and corrections remain #29 work.
- **Unknown is not failure.** CheckoutCommand keeps the same command identity,
  payload hash and saved result. POS persists frozen intent before POST; pending,
  unknown and conflict cannot be cleared as an ordinary draft. Query/replay uses
  the original intent; known conflict stays frozen for investigation.
- **Refund registration does not receive goods.** It changes monetary refund
  status, not stock or payment-provider balances. Physical return/inspection is
  separate (ADR-015).
- **ReceivingDraft is private preparation.** `admin-ui/src/pages/Receiving/` and
  `backend/src/modules/receiving-drafts/` provide actor-private manual saves,
  revision CAS, readback recovery and read-only history. Line checks are not
  approval to post; there is no receipt/stock side effect (ADR-025).
- **Evidence is not authority.** Scan/image/camera capture and future OCR proposals
  do not write quantities. Reviewed package revisions own conversion; unknown
  conversion cannot add a package. Label printing has no inventory side effect.
  `P1:<SKU>` identifies a product, not a batch/bin; print-time location is not
  persisted stock location (ADR-022/023/024).
- **Isolation is explicit where needed.** The Prisma extension scopes only
  registered models/operations. Raw SQL, child relations and transaction access
  still need tenant predicates and tests; do not assume every query is safe by construction.

## Reading and evidence rules

Follow `CONTEXT-MAP.md` → this context → navigation → relevant MODULE → nearest
source. Read only the selected journey and affected contract/ADR. For a new task,
record exact base/head, allowed files and the smallest evidence needed to prove
its AC. Use the [dispatch contract](../../.agents/skills/triage/AGENT-BRIEF.md#dispatch-contract)
for handoff; it conveys scope, not new authority.

Separate source review, units/JSDOM, browser with synthetic HTTP, real API/PG,
and physical/store acceptance. Record PASS, FAIL and NOT RUN for the exact subject.
CI and merged PRs do not close #31/#37 or G0–G7 without their stated acceptance.

## End-of-work context rules

Inspect `git diff --name-only`. Update the relevant existing context, module,
standard or ADR when module boundaries, workflows, source-of-truth locations,
API/model meaning or architecture constraints change. Preserve historical evidence
and avoid parallel context documents. Run `./scripts/validate-agent-context.sh`
from the repository root after context edits.
