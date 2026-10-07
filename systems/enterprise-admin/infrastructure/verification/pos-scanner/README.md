# Bounded POS scanner safety verification

**Corrected candidate; independent acceptance pending:** the blocking focused-input regression at `8824dd4` is preserved in history and raw evidence. The source/completion/cancellation correction now passes **44 scanner cases**, focused scanner/service/cart/recovery **91/91**, full POS **25 files / 193 tests**, and TypeScript/Vite build. Both reverse replies and an earlier reply received while the next scan is still typing retain both legitimate intents. The earlier 174-test GREEN applies only to initial coverage at `81f29f4`. Keep Draft; no browser, hardware or independent acceptance is claimed.

Refs [#31](https://github.com/skydreamer0/startup/issues/31), [#37](https://github.com/skydreamer0/startup/issues/37). Base: `1f7eeb092af0fd66ca4f3533939c44662020c9d8`. Executed 2026-10-06 in the existing `/workspace/startup` checkout, with existing Node 24.19.0, npm 11.9.0, Vitest 3.2.4, TypeScript 5.9.3 and Vite 6.4.2. No other executor, database, store data, hardware or deployment was used.

## Behavior and boundary

Local/remote candidates auto-add only when exactly one candidate's SKU or already-provided barcode equals the complete scanned string. No substring/case/numeric normalization; leading zeroes stay intact. PAN plus PAN2 adds only PAN for PAN. Two exact candidates, one fuzzy candidate, no result or lookup rejection do not add; errors preserve the draft and are handled.

Each request retains its intent within the same valid draft/search/checkout scope. A new scan or normal product-query/callback rerender does not invalidate another valid scan. Keyboard text entry into the focused search starts an unfinished source: earlier lookup success/error effects wait until Enter completes that source or cancellation invalidates it. Matching native insertText events continue the source; paste, deletion and direct/manual change invalidate prior requests synchronously. Unfinished typing expires only after a gap greater than 300ms. The existing Enter/trim/minimum-three-character decoder is unchanged; this does not identify scanner hardware or distinguish fast human typing followed by Enter. Scanner-driven search clearing does not cancel another valid scan. Clear/hold/recall advance an in-memory draft revision. Checkout pending or authenticated scope changes invalidate requests immediately and permanently, including pending/scope ABA while a partial scan is typing. Unmounted/stale success and failure responses cannot mutate cart/search/focus or show a success/error toast. New scans during pending/unknown/conflict are ignored. A quantity capped by displayed stock produces a warning, not a false +1 success. Backend inventory remains authoritative. The existing frozen-intent/known-conflict persistence and cart mutation guard remain intact; the draft revision is not persisted by the checkout draft builder.

The real backend `Product` has no barcode field. `CheckoutService.getProducts` searches name/SKU substrings and takes at most 100; this change only validates supplied candidates. Barcode-positive unit fixtures exercise the optional response type, not real manufacturer-barcode catalogue support or global lookup completeness. Backend, API/schema, permissions, auth, dependencies and `barcodeService` identification/timing policy are unchanged.

## Actual RED/GREEN evidence

Raw stdout/stderr is retained byte-for-byte in [raw.zip](raw.zip), including startup failures and intermediate test states. [raw-manifest.json](raw-manifest.json) records each entry's bytes/SHA256. Filenames in the table below refer to ZIP entries. The initial staged diff check flagged Vitest-generated trailing spaces (`14-staged-raw-whitespace-failure.txt`); archiving preserves those exact bytes without changing whitespace rules. Final checks are in [checks.txt](checks.txt).

| Run | Actual outcome | Evidence |
| --- | --- | --- |
| pnpm startup | ENOENT at `/home/agent/.local/share/pnpm` during package-manager startup; no test executed. Used the existing `npm test` script afterward; no package/lockfile changes. | `00-pnpm-startup-failure.txt` |
| First baseline fuzzy tracer | One failure: scan 123 with A123B added to the real cart; six other cases excluded by the test-name filter. | `01-exact-red.txt` |
| Exact correction | 7/7 passed. Corrected the old REMOTE-to-PAN/4711 acceptance assumption. | `02-exact-green.txt` |
| Unmount tracer / correction | One failure before cancellation; 8/8 passed afterward. | `03-unmount-red.txt`, `04-unmount-green.txt` |
| Lookup rejection tracer | One failure and one captured unhandled rejection. | `05-rejection-red.txt` |
| Lifecycle tracer | 8 failed / 14 passed: search, draft switching, pending/unlock and valid intents across product refresh. | `06-lifecycle-red.txt` |
| Lifecycle focused GREEN | 60/60, then 67/67 (scanner 29, cart 24, existing checkout recovery 14). | `07-lifecycle-green.txt`, `08-focused-green.txt` |
| Baseline replay | Original hook/cart/page restored temporarily to base, final public-interface harness run, feature files restored byte-for-byte: 18 failed / 11 passed and 3 unhandled errors. Final fixture-only replay is recorded separately. | `09-baseline-full-red.txt`, `12-baseline-final-red.txt` |
| Full POS unit GREEN | 25 files / 174 tests passed, no skips/unhandled errors reported. Includes existing frozen intent/known-conflict and barcode-service regressions. | `10-pos-full-green.txt` |
| Type/build | `tsc && vite build` passed. | `11-pos-type-build.txt` |
| Context/whitespace/environment | Agent context and diff checks passed; UTF-8 reads checked. POS has no configured lint script; no unrelated backend/admin lint was claimed. | `13-context-diff.txt` |
| Historical focused-input blocking RED | Explicit keydown/input sequence, then existing user-event typing, both fail at the initial implementation: API sees PAN and PAN2 but only PAN2 is added. Checkpoint `8824dd4` has 1 failed / 29 passed. | `16-focused-input-wedge-red.txt`, `17-user-event-wedge-red.txt`, `18-focused-review-red.txt` |
| Blocking-candidate type/build | TypeScript and Vite still pass with the new regression test; this does not override its RED result. | `19-blocked-type-build.txt` |
| Additional sequence/no-op RED | 3 failed / 29 passed: focused reverse replies, first response during the next partial input, and a capped quantity falsely claiming +1. | `20-sequence-and-noop-red.txt` |
| First sequence GREEN | Scanner 32 and unchanged service 5: 37/37 passed. | `21-sequence-first-green.txt` |
| Boundary-test intermediate failure | 2 failed / 89 passed: new test used a nonexistent recovery method and fake-timer/user-event wait timed out. Both test-driver errors were corrected; assertions were not relaxed. | `22-sequence-boundaries-focused.txt` |
| Corrected boundary focused GREEN | 91/91: scanner 44, service 9, cart 24, checkout recovery 14. Includes native/user-event input, paste/delete/direct change, exact 300/301ms, partial-input draft/pending/scope ABA and unmount. | `23-sequence-boundaries-green.txt` |
| Corrected full POS GREEN | 25 files / 193 tests passed, no skips/unhandled errors reported. | `24-pos-full-sequence-green.txt` |
| Corrected type/build | `tsc && vite build` passed. | `25-pos-sequence-type-build.txt` |

Unit tests use actual barcode-service document key events, the real cart/recovery stores and React/JSDOM. Only the external product API is mocked; deferred promises explicitly control response/rejection ordering. This is unit-level synthetic evidence, not a real HTTP/browser/scanner test.

## Reproduction

From `systems/enterprise-admin/pos-ui`, run `npm test -- src/__tests__/useBarcodeScanner.test.tsx src/__tests__/barcodeService.test.ts src/__tests__/cartStore.test.ts src/__tests__/useCheckout.test.tsx`, `npm test`, and `npm run build`. From repo root run `./scripts/validate-agent-context.sh` and `git diff --check`. Do not use real-store data. Historical baseline RED replay replaced only owned hook/cart/page files with `git show <base>:<path>` during the targeted run and restored their saved bytes in a finally block; no baseline implementation is committed.

## CI and remaining acceptance

CI was deliberately not run, enabled, dispatched or retried. Commits carry `[skip ci]`; the repository's only workflow has `push`/`pull_request` events, which support this marker per [GitHub's skip instructions](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/skip-workflow-runs). Workflow files are unchanged; PR CI remains unchecked. The connector's Actions-permissions read was rejected by its URL allowlist and stopped; no alternate permissions-read route was used.

Not run: browser, browser-native scanner text insertion/focus interactions, physical scanners, iPad/Safari, real HTTP/DB product lookup, manufacturer barcode import/schema/namespace, QR routing, pagination/stock freshness, layout, checkout payments/numbering/business dates/money, deployment/restore/final host. Hardware keyboard identification policy remains existing behavior. No complete #31/G0 or other G0–G7 gate, #29/#30/#31/#37 completion or production rollout is claimed. Independent review is still required; do not merge or mark ready from this record.
