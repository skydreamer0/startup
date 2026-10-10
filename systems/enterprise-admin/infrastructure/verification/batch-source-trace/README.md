# Batch source / sale allocation reader (#31 partial slice)

## Existing acceptance source and boundary

Issue #31's “各頁適用與驗收 / 商品／批次” requests access to batch sources and
sale allocations with progressive detail and preserved list conditions on return.
ADR-014 and API specification §3.7 / §3.10 already supply
`GET /product-batches/:id`: receipt movements, most recent 100 sale allocations,
and `_count.saleAllocations`. This change only connects that read response to an
Admin dialog. The API, schema, auth/RBAC, posting, money and unit policies do not
change. No store API/database is used for development or testing.

- Existing batch rows gain “來源／售出分攤”. The read-only native dialog retains the
  list's expiry filter and returns focus to its opener when that element remains.
- Receipts show original movement identity, time and quantity. Allocations show
  order number/identity, order line, movement, quantity and expiry-at-sale snapshot.
  Quantities do not assume package/base-unit conversion; no monetary totals appear.
- The latest-100 cap and actual allocation count are explicit. Allocation counts
  are not order counts. Empty links never imply no historical receipts or sales.
- No sum is treated as opening balance, current inventory, or reconciliation proof.
  Refund registration does not erase the original physical-sale history.
- Failed reads/refreshes are not empty history; 403 and 404 have distinct fixed
  text, no server diagnostics. A failed refresh hides the previous result.
- The HTTP boundary validates the successful envelope, batch/tenant identity,
  row linkage/count and required values. Unknown/malformed data is an error.
- Queries are user/tenant/batch-scoped and abortable. Unmounted reads are cancelled,
  old-batch results cannot replace new selection, and auth changes forget selection.
  A retry already in progress is reused rather than cancelled and restarted.

## Synthetic verification

`admin-ui/src/__tests__/batchTrace.test.tsx` exercises the actual read client and
components with synthetic HTTP-boundary fixtures. The coverage includes valid
receipt/sale identities, Taipei times, successful unknown history, 132 allocations
with only 100 returned, malformed/mismatched data, 403/404/500/network/retry,
late response after close/selection change, failed refresh, repeated retry,
auth identity changes including A/B/A, keyboard/focus and preserved expiry filter.
All paths assert no POST/PATCH/DELETE from the trace action.

From `systems/enterprise-admin/admin-ui`:

```sh
pnpm exec vitest run src/__tests__/batchTrace.test.tsx
pnpm run test
pnpm run lint
pnpm run build
```

Run `./scripts/validate-agent-context.sh` from repo root. Local execution used
existing frontend dependency bytes with Node 24.19.0 and direct package entrypoints;
this is not a fresh frozen installation or CI's Node 22 runtime. The first focused
run had 23 passed / 2 failed: a harness read before filter-query completion and
pending-retry handling. The corrected query uses `cancelRefetch: false` to dedupe
concurrent retry; assertions wait for actual query/UI state. Final exact counts
and source identity are recorded in the PR and external raw evidence handoff.
A first aggregate run from repo root failed the unrelated productLayout fixture
path lookup; rerun from the package directory is the supported command.

## Not established by these tests

JSDOM is not real browser/touch/200% zoom or API-to-PostgreSQL acceptance. The
existing backend's tenant enforcement is unchanged; client identity validation
is not a substitute for it. No physical devices, store data, inventory changes,
full historical ledger, older-than-100 pagination or production activation was
performed. Full #31, #29, #37 and G0–G7 remain open. Exact-head CI and independent
review must be recorded separately; a Draft checkpoint is not release approval.
