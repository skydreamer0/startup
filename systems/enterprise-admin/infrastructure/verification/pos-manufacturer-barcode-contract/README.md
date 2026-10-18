# Product/package mapping and complete lookup — Issue #48

Status: implementation candidate on `codex/product-package-lookup`, based on `a59a232e4c368fc4bca2aafde565f1229d54e4fe`. Owner rules are adopted in the [implementation contract](implementation-plan.md), architecture in ADR-024, wire contract in [product-packages.md](../../api/product-packages.md). PR #128's gap review remains in Git history. Its historical Node24 SKU-only test does not validate this implementation.

## Local execution

Node22.22.3, canonical npm11.21.0 / pnpm10.34.6 locked installs; no dependency/lockfile changes. LUNA checks: backend build/lint and focused tests passed; Admin full 208 tests and POS full 582 tests passed; both UI builds, Admin lint, shared typecheck and context validation passed. Full backend attempt: 338 passed, 38 failed due to absent DATABASE_URL/JWT configuration, 77 skipped; this is not a passing full suite. The hosted CI supplies its owned synthetic database/configuration.

Native PostgreSQL and real browser acceptance: **NOT RUN locally**; Windows Docker daemon unavailable. Ten opt-in package native skips are not evidence. No ambient/production/preview database is permitted. Hosted functional baseline `1f692f4668a52ec58f0d6695ef14e1c25f494ff6` passed all nine pipeline jobs and applicable security checks in [run 38795717648](https://github.com/skydreamer0/startup/actions/runs/38795717648): package PostgreSQL 10/10 with zero skips and all three built Admin/POS→real API→PG15 browser flows. Raw reports, all 600 source-blob hashes, intentional stale 409s, zero rows and owned-resource cleanup were independently read back. The baseline full-page Admin captures did not preserve the accepted viewport; the runner now captures viewport PNGs with dimensions/hashes. Final viewport visual review, source SHA, artifact links and all exact-head check results are recorded in [PR #142](https://github.com/skydreamer0/startup/pull/142). Functional baseline evidence does not substitute for that final capture review.

## Native acceptance protocol

`backend/scripts/pos-product-lookup-ci.mjs run` retains five original SKU, nine category and twenty provenance cases and adds ten package cases from `product-packages.integration.test.ts`. The package guard requires exact source head/tree, hosted run/attempt, verified loopback service identity, explicit database opt-in and preflight initially-empty ownership proof. All named cases must pass with zero skips; per-suite row counts return to zero; cleanup drops only the owned disposable database.

Cases cover literal codes, namespaces/tenant conflicts, full-dataset lookup, zero stock, validity boundaries, multiple packages/product, retirement/new revision, concurrent stale writes, composite tenant FKs, immutable/sealed history/stock unit, authenticated HTTP and no inventory/order/payment/receipt side effects. Mocked failures remain separate evidence.

`backend/scripts/package-browser-acceptance.mjs` follows existing category/stock acceptance. Current built Admin/POS→production API→owned PG15 uses fixture-issued JWT and 1366/1024/390px Chromium viewports. Admin creates three ambiguous packages, POS blocks unknown conversion, keyboard confirms reviewed quantity; admin retires the mapping and stale POS choice gets 409 without another add. Long Chinese text, 44px candidate geometry, direct and manual-input handoff close/focus recovery, literal preservation and unchanged business snapshots are checked. Login UI and hardware are excluded.

Inspect `package-native-<head>-<attempt>` and `pos-sku-<head>-<attempt>` artifacts: source/hash identity, case reports, request ledger, screenshots, before/after row counts and quiescent process cleanup. All current pipeline/security checks must pass for the same PR head. Historical UI evidence does not validate this interface.

## Remaining external gates

| Gate | Evidence |
| --- | --- |
| Physical scanner/FNC1/raw bytes | NOT RUN; missing metadata remains unknown |
| Safari/physical iPad/touch | NOT RUN; Chromium viewport evidence is separate |
| Native zoom/text enlargement | NOT RUN |
| Cold-offline real 8GB CPU-only device | NOT RUN; bundled decoder unchanged, API server needed |
| Production migration/store use | NOT RUN; no live DB touched |
| Internal batch QR/receiving quantity/posting | Separate existing workflows; no new automatic mutation/fill |

Keep #48 and parent gates open until applicable scope has actual evidence. CI alone does not establish G0–G7 or store acceptance.
