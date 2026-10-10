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

## Bounded browser supplement (pending exact-head execution)

The existing Admin UI CI job calls the same `admin-margin-warning/run.mjs`; its
unchanged 22 warning scenarios are joined by two `batch-trace.spec.ts` scenarios:

- 1366×768: filtered row → delayed source → ordinary pointer close and actual
  cancelled read → reopen → 100 of 132 allocations → resolve obsolete response →
  native Tab/Shift+Tab/Escape with retained filter and returned focus.
- 390×844: long Chinese names/identifiers → 403/404/500 failed refresh and retry →
  unknown empty histories → ordinary pointer close and visible backdrop close.

The same owned Vite build/preview, Chrome sandbox, fixed synthetic auth, GET-only
allowlist, zero unexpected requests/page errors, source hashes, quiescence, PNG
validation and actual Noto CJK glyph checks are retained. The new cases require
seven labelled screenshots plus geometry/platform-font/network receipts. Dialog
horizontal overflow and 44px targets are checked; ordinary actions still use
pointer and keyboard, not geometry or DOM-click substitutes. No new workflow,
job, service, environment, dependency or permission is introduced. This adds two
short scenarios to the existing browser invocation; publishing the supplemental
head triggers the repository's normal complete CI once. No manual repeat run was
requested, and prior gate failures are not relabelled as passes.

The local native-browser attempt was BLOCKED (socket EPERM; cloud-browser
localhost connection refused); it produced no application browser PASS.
Initial head `0d2817afdda366f959c2e8e2fb2ae9ba37f05859` passed independent source/DOM
review and 8 of 9 ordinary CI jobs, but run `38047588858` failed solely in unchanged
category-native visibility expectations (three sizes expected hidden at line 80).
Abort-retry and Dependency Review succeeded. Those old category inputs are not
modified here; that failure is still a failure, not this slice's acceptance.
Supplemental Chrome results and PNG review must be recorded for the new exact head.
Real API/DB, 1024px, native 200% zoom, touch, iPad/Safari, hardware and whole #31
acceptance remain NOT RUN.
