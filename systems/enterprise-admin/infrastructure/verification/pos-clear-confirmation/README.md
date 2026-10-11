# POS clear-cart confirmation: bounded Issue #31 slice

## Source and scope

This change binds the existing two-click clear confirmation to the current
editable cart's `draftRevision` and authenticated `draftScope`. It changes only
`pos-ui/src/components/CartPanel.tsx`, adds
`pos-ui/src/__tests__/CartPanel.clear-confirmation.test.tsx`, and this report.
The existing cart and checkout-recovery stores, API, financial rules, schema,
permissions and workflows are unchanged. Issue #31 and the broader G0–G7 gates
remain open.

The pre-change `CartPanel.tsx` Git blob is
`145abe88f370e3a3b69c3ea1b627b0ad906adcbb`. Source inspection found that its
confirmation was a component-local boolean. The following regression is
therefore included; **it has not been executed locally**:

1. Add synthetic product A and press clear once.
2. Hold A, then start or recall draft B while the same panel stays mounted.
3. Press clear again within three seconds.
4. B must require its own confirmation; A's confirmation must not clear B.

## Behavior

- Hold/recall, A/B/A and authenticated-scope transitions invalidate confirmation.
- An empty cart and any pending, unknown or conflicted checkout invalidate it,
  including transitions batched before React's next render.
- The handler rechecks current store identity and frozen state before clearing.
  A frozen cart cannot report a successful clear after the store rejects mutation.
- Both the button prompt and live status expire together after three seconds.
  Re-arming a new draft starts its own timeout.
- The same editable draft still clears with two clicks. Held drafts are retained.

## Verification on 2026-10-11 UTC

### Passed

- `git diff --check`.
- `./scripts/validate-agent-context.sh`.

### Not run / blocked

- The new 15-case React/JSDOM regression suite and existing affected suites.
  The preparatory run stopped while loading Vite configuration with
  `ERR_MODULE_NOT_FOUND: Cannot find package 'vite'`. The assistant workspace
  does not contain the project's usable frontend dependencies. This is a test
  startup failure, **not a reproduced failing assertion or a passing test**.
- Frontend locked installation, strict TypeScript, lint, build and full POS suite.
- Browser, native keyboard/pointer/touch, scanner, iPad/Safari, device and
  API/database end-to-end acceptance. Synthetic React tests do not prove those.

GitHub CI must execute the exact submitted head. Keep any unrelated existing
category-browser failure, skipped downstream stock acceptance and device gaps
separate; do not restart the held PR #109 work to validate this slice.

### First submitted-head CI result

For head `c64ad2268456c73d1e63272e3970270d9f385ad8`, the original raw log of
[POS UI job 114419123679](https://github.com/skydreamer0/startup/actions/runs/38122218656/job/114419123679)
was read directly. Node 22 and the locked install succeeded; the new suite passed
15/15 and the full POS component suite passed 38 files / 395 tests. Strict
TypeScript then failed with TS2345 because this test's synthetic checkout payload
omitted required `shiftId`. Docker build and subsequent recovery/browser steps
were skipped; those are not passes.

The follow-up adds only `shiftId: 'synthetic-shift'` to the synthetic fixture;
runtime `CartPanel.tsx` is unchanged. This preserves the first failure rather
than relabeling it. Results above belong to the first head; the corrected head
requires its own CI result and cannot inherit a build pass.

## Reproduction

With the repository's normal frontend pnpm workspace installation available,
run from `systems/enterprise-admin`:

```sh
pnpm --filter pos-ui exec vitest run src/__tests__/CartPanel.clear-confirmation.test.tsx src/__tests__/CartPanel.test.tsx src/__tests__/cartStore.test.ts src/__tests__/POSCheckoutPage.held-draft.test.tsx
pnpm --filter pos-ui run test
pnpm --filter pos-ui run build
```

The new file uses synthetic products and real cart/recovery public actions; it
does not mock the state boundary being checked or contact a backend. It covers
same-draft two-click clearing, holding, recall and A/B/A, scope changes and scope
A/B/A, external clear/refill, empty/refill, expiry and independent timers, the
three frozen statuses, pending/unlocked A/B/A and the empty-cart message.

No store deployment, live transaction, production database or security change
is part of this work. Draft publication and code review are not release approval.
