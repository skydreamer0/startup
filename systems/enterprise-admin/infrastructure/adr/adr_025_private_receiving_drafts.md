# ADR-025: Actor-private manual receiving drafts

Status: Proposed, draft-only candidate (2026-10-18)
Related: #31, #37, same-page reducer #144; no issue closure or inventory-posting acceptance.

## Context
The existing receipt reducers had no user-facing page, authenticated owner, durable storage, or recovery after a lost save response. Manual receipt preparation needs a complete draft journey without granting stock-release authority.

## Decision
- Add `/receiving` with explicit manual save, maximum 100 lines, known product selection, incomplete rows, raw quantity/cost text, line checks, reopening and read-only version history.
- Use backend tenant context and authenticated actor for every query. Ignore client scope labels as authority. Reads require existing `read:products`; saves additionally require existing `create:products`. Add no role or permission.
- Store a private head with positive revision and append-only JSONB revisions. Tenant + owner foreign keys enforce referential consistency. Head update uses an exact revision compare-and-swap; snapshot append and head update share a transaction. No last-writer-wins retry.
- Client creates a UUID once. A duplicate create or unknown save response is resolved with GET. Only identical payload confirms success. A differing remote version requires explicitly adopting it or keeping local content and manually saving against its displayed revision. A 404 for an initially unsaved draft permits the same-ID retry.
- A new authenticated profile remounts the workspace, including same-user login. Abort/generation checks suppress stale reads. 401/403 and invalid response scope hide private drafts. History is read-only and does not restore, post, approve or mutate stock.
- Blank or invalid unfinished fields can be saved but cannot be checked. Optional ordered/quarantine/rejected quantities and unit cost are raw annotations; no quantity conversion, valuation, tax or refund policy is inferred. A line check is data review, never posting authority.

## Boundaries and consequences
- Additive migration is a candidate only. No production migration, deployment, physical printing, OCR, original-document upload, team sharing, TTL deletion, inventory ledger, accounting or posting call is part of this change.
- The product list uses existing read permissions. POS package exact-lookup requires a different capability and is not implicitly granted; package text is a manual annotation, not confirmed package authority.
- Refresh and window close warn for unsaved, pending or uncertain content. The existing route tree uses the official data-router blocker: SPA links, Back and query navigation require explicit discard for unsaved edits; pending/uncertain writes cannot be abandoned through SPA navigation until resolved. Auth identity changes still immediately clear the workspace. There is no autosave or offline claim.
- Existing saved drafts remain private. No delete API or revision mutation API is added. Revision SQL rejects UPDATE/DELETE. Any future retention/administrative recovery needs a separate reviewed change.
- Full real PostgreSQL migration/concurrent CAS and current browser acceptance remain required before merge. Local mock-service tests prove predicate/transaction construction, not database isolation. Tests use only synthetic data. Production remains unchanged.

## Verification
Candidate local checks: actual React/AuthContext/MemoryRouter page tests; reducer/workspace regressions; real Express authentication and RBAC middleware with synthetic token/database fixtures; service scope/CAS/schema tests; Prisma schema validation/client generation; targeted TypeScript checks. Node 24 and separately installed dependency versions are supplemental, not the canonical Node 22 locked CI run.
