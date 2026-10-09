# Close-shift dialog input and cancellation lifecycle

Bounded slice of #31. Parent issue remains open. Draft; independent final review and exact-head CI are still pending. No ready, merge, deployment, credentials, security settings, real database, or user-computer action is included.

## Scope

The only production edit is `pos-ui/src/components/CloseShiftDialog.tsx`. It adds a named modal/cash field, initial focus, Tab/Shift+Tab containment, background inert restoration, Escape/cancel semantics, keyboard/scanner isolation, and loading locks. It does not change page state, the shift service, cart/recovery stores, backend contracts, payment/PIN/split components, or the other open PR #88.

Cancel before submission preserves the in-memory cart and closing-cash value and makes no close/checkout/refund/open-shift call. Once submitted, all controls are disabled and Escape cannot pretend to cancel the request. Failure re-enables the original amount; only explicit retry submits again. Refresh persistence of closing cash is not implemented or claimed.

Focus changes on late loading settlement only occur while this dialog still owns focus. Background locks are reference-counted among CloseShiftDialog instances; older cleanup cannot unlock a newer instance's background. This local lease does not claim to be a shared cross-component modal manager. Original inert/aria-hidden values are restored after the final owner releases them.

## Source and execution identity

True base: `92f3099a3dd2e1cef596041034cd211872d5d713`, tree `6f434370048b9a3a1b587dfd32cb020439067135`.
The executor used a materialized checkout. Its local bootstrap tree has three dependency symlinks and omits two unrelated ignored `.superpowers` markers; none of those differences are proposed. Publication uses the true GitHub base tree plus an explicit owned-file whitelist, and verifies the complete resulting blob mapping. `source-hashes.json` records final owned source bytes. Raw logs retain the executor's own clock formatting.

## Test coverage

- Component: semantic name/label; initial and loading focus; Tab/Shift+Tab; focused Enter/Space; F2/F8 and amount Enter; original background attributes; disconnected opener; loading duplicate/cancel/edit locks; retry; late cleanup; loading settlement behind a real PaymentModal; two CloseShiftDialog instances releasing in the old-first order.
- Real POS page with real hooks/dialogs/cart/recovery and synthetic service adapters: pointer/Escape/Enter/Space cancel and reopen, cash/cart preservation and zero service writes; F2–F8 plus scan-like Enter isolation; deferred failure/retry/success; actual router unmount to a screen with real PaymentModal followed by old success or failure; payment, split-payment and manager-PIN cancellation regression.
- The current POS page's secondary modal entry points are background controls or window shortcut handlers. Sibling background branches are inert and CloseShift consumes the keys. Real router replacement unmounts POSCheckoutPage. Defensive overlap component tests supplement these real-page tests; they are not presented as a new user-accessible concurrent-modal flow.

## Results and retained history

Final result: **29 files / 309 tests passed**, TypeScript/Vite build passed, browser-suite TypeScript passed, context and diff checks passed.

Final results are recorded in `raw/28-final-full-pos.txt`, `raw/29-final-build.txt`, `raw/30-context.txt` and `raw/31-diff-check.txt`.

The original five RED/GREEN cycles (01–10) are preserved. 11 records the first real-page 8-case integration pass. 12 was the first full 304-case pass. 13 caught two new test typing mistakes, corrected in 14. 15 caught a browser TypeScript include/config issue, corrected in 18; 16 is a successful isolated build.

17 and 19 are browser-launch failures before any page scenario could run: Chromium local `socket()` returned `Operation not permitted`; the same authorized workspace retry with escalation did not resolve it. All seven browser cases therefore remain **BLOCKED / NOT RUN**, not seven product failures and not browser passes. No UI screenshot or native keyboard evidence was produced. No further port, machine, or security workaround was attempted.

20 is the authentic two-case late-focus/inert RED. 21 and 22 are intermediate runs that still failed the initial-loading focus assertion after the first guard change; their filenames do not imply a pass. 23 passed 30 focused tests after initial-loading focus was fixed. 24 is an intermediate full run with a regression-fixture mistake: an order discount of 100 did not meet the real 500 threshold and invoked checkout instead of PIN. The fixture was corrected to the real 20% item threshold without changing production code or weakening assertions. Final raw 28 supersedes that test-driver failure, while preserving it.

## Reproduce

Install the pinned frontend pnpm workspace dependencies by the existing repo workflow. From `systems/enterprise-admin/pos-ui`:

- `npm test -- --maxWorkers=2`
- `npm run build`
- `node node_modules/typescript/bin/tsc --project e2e/close-shift-dialog/tsconfig.json`
- `node node_modules/vite/bin/vite.js build --config e2e/close-shift-dialog/vite.config.mts`
- `CLOSE_SHIFT_OUTPUT=/absolute/isolated/output node node_modules/@playwright/test/cli.js test --config e2e/close-shift-dialog/playwright.config.mts`

An existing Chromium binary can be selected via `CLOSE_SHIFT_CHROMIUM`. The harness owns a loopback preview with no API proxy; context-wide HTTP and WebSocket routes reject unexpected traffic, and only explicit synthetic login/close requests are locally fulfilled. The seven-case suite has no retries. It is authored and type-checked but runtime acceptance remains unverified in this executor.

## Remaining limits

Browser-native input and visual/mobile geometry, real iPad/Safari/touch, physical scanner/printer, actual HTTP-to-DB close-shift processing, broader payment/cancel workflows, all #31 requirements and production gates remain unverified here. POS has no configured lint script; its actual TypeScript/build result is recorded instead. This isolated bug fix changes no module boundary, workflow contract or source-of-truth route, so the existing README/MODULE and architecture docs are unchanged.
