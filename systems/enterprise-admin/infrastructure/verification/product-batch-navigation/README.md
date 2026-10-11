# Product → batches navigation (partial Issue 31)

## Bounded contract

The existing `/inventory` product row opens a **read-only** list for that product
using the existing `GET /product-batches?productId=...` endpoint. The backend's
existing tenant/RBAC checks remain authoritative. No backend, schema, receipt,
correction, stock, payment or deployment changes are made.

The URL holds the existing low-stock filter/page and selected product ID. Normal
row navigation creates a history entry; Return/Back restores the product list,
and Forward reopens the selected product. A direct/reloaded URL retains the
filter/page when its read view closes. Out-of-range list pages still clamp only
when a successful server total confirms the last page. Invalid page syntax falls
back to page one. A deleted/missing opener returns focus to the product heading.

The list validates the existing response envelope, selected product identity,
row identity, status, quantity and date fields. This validation is not proof of
backend authorization. Reads are user/product-scoped, consume AbortSignal and
are discarded on unmount. Permission denial, pending, successful empty and read
failure remain distinct. No client sum or inferred available quantity is shown.
This view does not open receipt/sale trace details, whose separate nullable-order
fix and acceptance stack remains in PRs 107/108/110.

## Verification

New tests: `admin-ui/src/__tests__/productBatchNavigation.test.tsx`.
Existing product pagination/layout and supplier suites now use MemoryRouter,
matching the production router rather than replacing navigation with a mock.
Tests use real clients with synthetic HTTP boundaries. They cover selection,
return/focus/filter/page, history, direct URL, late and interrupted reads,
identity/permission changes, error/retry/empty, malformed pages and wire data.
Each navigation test asserts zero POST/PUT/DELETE calls.

From `systems/enterprise-admin/admin-ui` after the approved workspace installation:

- `npm test -- src/__tests__/productBatchNavigation.test.tsx src/__tests__/productPagination.test.tsx src/__tests__/productLayout.test.tsx src/__tests__/supplierLists.test.tsx`
- `npm test`
- `npm run lint`
- `npm run build`
- Repo root: `./scripts/validate-agent-context.sh` and `git diff --check`

At the initial checkpoint, the local locked dependency installation was cancelled
before a usable frontend dependency tree was established. That route was stopped
without retry or a package-manager workaround. Therefore local Vitest, strict
TypeScript, ESLint and build are **NOT RUN**, not passed. Static syntax/context/
whitespace checks are recorded separately in the PR. Exact-head normal CI and
independent review must establish their own result.

## Remaining gates

No new actual browser screenshots, native keyboard/pointer/touch, 1366/1024/390px
geometry, native 200% zoom, API→PostgreSQL, hardware or Safari/iPad results are
claimed here. The new route needs its own affected UI acceptance; old batch-trace
captures do not establish this flow. PR109's stopped category execution budget
is not reopened. Failed/skipped unrelated CI remains failed/skipped. This is a
Draft partial implementation, not complete Issue31 or G0–G7 acceptance.
