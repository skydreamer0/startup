# ADR-012: Shared UI Library Boundary Decision

## Status

Accepted

## Context

Phase 13 Roadmap D asked whether `packages/ui/` should exist now, and required evidence from real duplication rather than imagined future reuse.

The current workspace already supports shared packages via `packages/*`, and `packages/types` is the existing shared package boundary. Creating `packages/ui` would add a new cross-application dependency for `admin-ui` and `pos-ui`, so it should be justified by stable, repeated primitives that both apps actually consume.

Evidence gathered during CLOUD-04:

| Candidate | Admin UI state | POS UI state | Decision signal |
| --- | --- | --- | --- |
| Button | Admin uses CSS classes such as `.btn`, `.btn-primary`, `.btn-ghost`, `.btn-danger`, and `.btn-sm` across pages. | POS has a local `components/ui/button.tsx`, but current POS feature components still mostly use raw `<button>` elements and inline/touch-specific styles. | Shared API is not yet proven by actual POS consumption. |
| Badge | Admin has `.badge-*` CSS variants, including status and role badges. | POS badge-like UI is mostly domain-specific, such as reorder/stock/payment indicators. | Shared styling is token-compatible, but component semantics are app-specific. |
| Card | Admin uses `.card`, `.stat-card`, and report/dashboard surface classes. | POS has a local `components/ui/card.tsx`, while product/cart/payment surfaces are still highly POS-specific. | Surface shape differs: dense admin panels vs touch-first POS cards. |
| Table | Admin has table CSS classes used in CRUD/report pages. | POS has a local `components/ui/table.tsx`, but POS table needs are limited and not a dominant interaction. | Table extraction would be premature and Roadmap D explicitly warned not to extract page-specific table logic first. |
| Modal | Admin and POS both use modals, but POS modals encode checkout/refund/shift/payment workflows with inline layout and business-specific controls. | POS has many modal/dialog files with touch/payment-specific behavior. | Too behavior-heavy for a first shared primitive. |
| EmptyState | Admin has CSS empty-state primitives. | POS empty states are embedded in checkout/product workflows. | Not enough cross-app pressure. |

Additional counts from the audit:

- Admin pages/components have heavy class-based reuse: 157 `btn*` class references, 109 `badge*` references, 111 card-related references, and 37 table-related references.
- POS feature files contain 58 raw `<button>` elements and 329 inline-style references in components/pages.
- POS has local shadcn-style `components/ui/button.tsx`, `card.tsx`, and `table.tsx`, but no current imports/usages of those local primitives were found in POS source.

This means admin-ui and pos-ui both need UI consistency, but their current implementation shapes are not aligned enough to justify a shared package boundary today.

## Decision

Do **not** create `packages/ui/` in this phase.

Keep the current boundary:

- `admin-ui` owns admin-specific operational CSS primitives and dense back-office layout classes.
- `pos-ui` owns POS-specific touch-first primitives, checkout/payment surfaces, and local UI experiments.
- `packages/types` remains the shared workspace package for API/domain TypeScript types.

CLOUD-04 is complete by documented decision rather than by package extraction.

Phase 12 `ADM-UI-04` remains deferred because no shared UI package exists and no app consumes one.

## Revisit Threshold

Reconsider `packages/ui/` only when all of the following are true:

1. At least three primitives are needed by both admin-ui and pos-ui with the same semantic API, not just similar colors.
2. Both apps already use equivalent local implementations in production code.
3. The primitive can be expressed through shared tokens without forcing admin density onto POS or POS touch affordances onto admin.
4. Both consuming apps can build and test through the workspace package without adding fragile alias or CSS-order coupling.

If the threshold is met, start with at most:

- `Button`
- `Badge`
- `Card`

Avoid extracting table, modal, checkout, report, payment, or page-specific primitives on the first pass.

## Consequences

Positive:

- Avoids a premature abstraction that would slow down admin and POS iteration.
- Keeps the admin Phase 12 visual refresh stable by relying on CSS primitives already used by admin pages.
- Keeps POS free to evolve touch-first and checkout-specific controls without a cross-app API freeze.
- Provides an explicit revisit threshold so future extraction is evidence-based.

Negative:

- Some visual concepts will continue to exist separately in admin-ui and pos-ui.
- Future shared UI extraction may require migration work if both apps later converge on equivalent primitives.
- Phase 12 `ADM-UI-04` remains deferred until a real shared UI package is created and consumed.
