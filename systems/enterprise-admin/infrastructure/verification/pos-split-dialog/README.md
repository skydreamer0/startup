# Issue #31: bounded split-payment dialog correction

Base: master `13807ccfabb245011ff7d9415d8ae97112fdc485` (includes merged #84, #85 and #86).
This change addresses only the existing dialog keyboard/cancellation acceptance
criteria. It does not complete Issue #31, #30 or a release gate.

## Changed behavior

- Split payment has a named dialog and labelled payment controls. Focus enters the
  amount input; Tab/Shift+Tab remain inside; Escape and Cancel close without submitting
  or modifying the cart, then restore the opener if this overlay still owns focus.
- Its page/scanner function keys do not escape into background operations. Background
  sibling branches become inert and hidden to assistive technology; previous attribute
  values are restored on removal. Existing manager PIN siblings are excluded.
- Loading disables editing, cancellation and repeated confirmation. Existing checkout
  preparation, immutable payload, pending/unknown/conflict and amount calculations are
  unchanged; no provider payment or refund behavior is introduced.
- While manager PIN is open, the split overlay is explicitly suspended/inert. PIN
  receives keyboard focus, owns Tab/Escape, and cancellation returns to the split
  confirmation. Its existing four-digit validation and authorization callback are
  unchanged. This is not a new global modal framework.
- Dialog width/height are bounded to the viewport and content can scroll. Actual
  visual geometry is not accepted by JSDOM.

## Initial verification on 2026-10-09 (superseded by review correction below)

Local dot workspace, isolated source directory; Node 22.23.3, pnpm 10.34.6 and the
unchanged canonical frozen frontend lock. Dependencies were installed by the parallel
classification task and read through local links; the source changes remain separate.

- Original production source plus the new 11-case JSDOM regression: **10 failed, 1 passed**.
  The test first proves an existing heading opens/closes, so a missing dialog role does
  not falsely count Escape dismissal as success.
- Corrected source: **11/11 focused**, final full POS **273/273**, no skipped cases.
- TypeScript + Vite build, repository context validator and diff whitespace checks passed.
  The first build caught two unsupported Testing Library `exact` test options; these
  were removed and the full suite/build rerun. No production behavior changed in that fix.
- Includes repeated Escape/pointer cancellation with identical cart state; disabled
  loading controls; Tab cycles; prior inert/ARIA restoration; newer-dialog focus on
  unmount; nested PIN keyboard entry/cancel/return; and unchanged four-digit callback.

### Browser attempt: blocked before any scenario ran

Five new focused actual-POS Chromium cases were prepared for 1366x768, 1024x768 and
390x520, including manager-PIN handoff. The build was served on owned loopback with
API proxy disabled and the existing BrowserContext HTTP/WebSocket guard. Synthetic
staff login was to be fulfilled locally; all other writes and unknown egress were
rejected. This did not run the previous 14/24 browser suites.

System Chromium could not launch: `socket() failed: Operation not permitted`, with
an additional crashpad directory error. The five runner failures are **environment
startup failures, not executed UI cases**. No browser flow, screenshot, network-ledger
acceptance or geometry result is claimed. No alternate browser, port or security flag
was used to bypass the restriction. The raw failure logs and prepared isolated fixture
harness are retained with the review evidence.

NOT RUN: successful Chromium verification, real API/PostgreSQL, real payment provider,
physical touch/scanner, Safari/iPad, OS keyboard, native 200% zoom or screen-reader
acceptance. Independent review and exact-head CI are separate remaining gates.

## First independent-review correction (superseded by Enter correction below)

Initial candidate `62c98d2` was **not accepted**. Independent real-page/cart
JSDOM tests showed that deleting a payment row, adding a fourth payment (removing
the focused add button), or clicking the non-dismissing backdrop left focus on
body. F4 then reached the page handler, held the cart, and emptied its items.
The original 11 component tests did not cover this integration path.

- Reproduced the unchanged review cases against `62c98d2`: 18 targeted,
  **15 passed / 3 failed**. Original RED records remain saved.
- Dynamic row changes now move focus to a surviving/new payment amount. Backdrop
  and non-control clicks restore a dialog focus target. No deferred focus timer
  can steal focus from a later PIN dialog.
- The real page independently blocks checkout/function shortcuts while ordinary
  payment, split payment or PIN is open, including deliberate body-focus loss.
  Existing ordinary-payment Escape cancellation remains available; loading/PIN
  cannot be bypassed through page Escape. Both modal handlers consume the existing
  app function keys without triggering their browser defaults.
- Adopted the 7 independent page/lifecycle cases as committed regression tests and
  added 4 cases for the three page-level modal guards plus ordinary-payment Escape.
  Exact CASH 150 / CARD 50 callback, cart identity and later-dialog focus are covered.
- Negative control: restoring only the pre-fix page handler with corrected body-focus
  tests fails all **3 modal-backstop cases**, while the 5 other page cases pass.
  Each key is tested after resetting focus to body; testing F2 first without resetting
  would mask the problem by moving focus to the search input. That intermediate test
  result is retained and is not the accepted negative control.
- Corrected focused coverage is **22/22**; final full POS **284/284**, no skipped
  cases. TypeScript/Vite build and repository context/diff checks passed again.
  Raw logs, source hashes and both negative controls accompany the revised candidate.

The five browser startup failures above remain NOT RUN; no browser retry or
workaround was attempted during this correction. The revised candidate requires
independent re-review before remote preservation or further delivery claims.

## Re-review correction: preserve native Enter

Candidate `1b922ad` was also **not accepted**. Its page backstop prevented every
Enter default, including the actual ordinary PaymentModal's Cancel, payment-method
and confirmation buttons. The prior page test used a static PaymentModal mock and
therefore missed native button behavior. Independent actual-component tests reproduced
**1 Enter failure / 2 Space-and-Escape passes** on the unchanged candidate.

The modal backstop still returns before page checkout/function shortcuts. It now
preserves Enter's default only for native/interactive controls inside an active,
non-inert, non-hidden dialog. Body/background Enter and app function keys remain
blocked; loading/PIN Escape guards are unchanged.

The permanent page regression now uses the actual PaymentModal. It covers Cancel
Enter/Space with unchanged cart, opener restoration and no checkout; ordinary Escape;
and payment-method plus confirmation Enter with one synthetic checkout invocation
and the original payload. The body-focus guards use the real ordinary payment too.
The original split/PIN focus, dynamic-row/backdrop and payload regressions remain.

Focused coverage including existing PaymentModal tests: **30/30**. Final full POS
**287/287**, zero skipped; TypeScript/Vite build and context/diff checks also pass.
Raw results accompany this revised candidate.
No browser retry, provider call, database operation or remote push was performed.
Independent re-review remains pending.

## Design references

The repository pharmacy overrides and static UI/UX keyboard/focus guidance were read;
no vendored skill program, package or external asset was added/executed.
- [W3C modal dialog keyboard/focus pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
- [MDN inert behavior](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/inert)

## 2026-10-10 current-master online acceptance checkpoint

The original eight-file correction is integrated by clean three-way application
onto master `08a3570cef5d3081aaafdb7f48083f26cf8017f3`, tree
`c8d9acd8dedd951e5668bd90fdfa099fef7b6ba6`. The category status, query
synchronization and close-shift corrections from #87/#95/#94 remain unchanged.
The earlier reviews and blocked local Chromium evidence above are historical;
no restricted local-browser retry or security-flag workaround was performed.

The dedicated `pos-ui/e2e/dialog-acceptance/run.mjs` harness is intended only for
an exact-head, existing GitHub-hosted Node 22 runner. It uses the official installed
Google Chrome channel with Chromium sandbox enabled, a loopback Vite preview with
no API proxy, blocked Service Workers and context-wide HTTP/WebSocket guards. It
never forwards API writes: synthetic staff login and the two explicit confirmation
cases are fulfilled/held in memory, with every other write rejected. Each case
closes its disposable browser context before sealing its request/key ledger.

Fourteen native-input cases cover three viewport sizes, dynamic row removal/fourth
row addition, backdrop/title clicks, F4 isolation, nested PIN cancellation, ordinary
payment pointer/Escape/Enter/Space cancellation, native CARD selection/confirmation,
and exact split payload. On the real page, preparing the frozen checkout intent
closes payment overlays and shows recovery; pending confirmation tests preserve
that existing behavior rather than asserting a permanently mounted loading modal.
Component loading controls remain covered separately in JSDOM.

Current local integration checks: 84/84 focused tests across six files passed on
Node 24.19.0, including category and close-shift regressions. Harness report/ledger
negative controls, harness TypeScript, POS TypeScript/Vite build, context validation
and 14-case discovery passed. Local pnpm 11 attempted automatic package
manager handling and stopped on a missing home store path; no dependencies were
changed. Checks then invoked the existing locked TypeScript/Vitest tools directly.
Final exact-head CI, actual Chrome execution, screenshot review and independent
review are still PENDING at this checkpoint. No real API/database/provider, physical
scanner/touch, iPad/Safari, native 200% zoom or release acceptance is claimed.

Run the pure guards with `node --test pos-ui/e2e/dialog-acceptance/run.test.mjs`.
CI supplies `DIALOG_QA_HEAD` and runs `node pos-ui/e2e/dialog-acceptance/run.mjs`.
Evidence is written exclusively to
`$RUNNER_TEMP/dialog-qa-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT/`, with source/tree/run
identity, source hashes, official Chrome version, report, screenshots, context-closed
network/key ledgers, and an acceptance receipt only after every case/ledger passes.

### Evidence-publication safety gate

Each child phase revokes publication until the owned process supervisor confirms
that its entire process group is quiescent. Cleanup failure leaves no GitHub
`evidence_dir` output, so CI cannot upload an actively written bundle. Normal test
failure may publish diagnostic evidence only after verified quiescence; it never
creates an acceptance receipt. Pure controls cover cleanup throw/false after a
previous successful phase and a safely stopped failed phase. The initial fixed-path
upload proposal was rejected during review coordination and was never run.

The inherited supervisor only tracks its direct process group; independent review
proved Playwright's detached descendants could outlive that group. The dedicated
`owned-run.mjs` supplements it with same-UID, exact per-run nonce, and PID start-time
ownership checks before every signal. Cleanup runs after each phase and again before
publication; an unreadable identity, changed PID, or surviving process fails closed.
No executable-name search or shared process-owner modification is used. The reviewed
algorithm is copied from #98 source `9843b855e625f79680aed63814d6853d3108e30e`
with only the nonce variable renamed. Dedicated controls create benign detached
Node descendants, verify owned cleanup, preserve another nonce, and reject stale
PID/non-quiescent/unknown identity. The final browser receipt is created only after
this final cleanup. Both guard files must run before native acceptance.

The first copied algorithm passed local guards but its #98 native runner control
failed closed on an unreadable preexisting same-UID process environment, before
Chrome launched. The independently reviewed `9406acd86f8146b9ef4cb99ee3cc89125dcc5665`
revision now snapshots PID/start-time/UID before any child receives the new nonce.
Only those exact pre-run identities are excluded without reading their environment.
New/reused unreadable identities, mid-read ownership drift and stale signal targets
remain blockers. The dialog copy changes only its nonce variable; its dedicated
controls retain the same baseline and detached-child counterexamples. This is
SOURCE/GUARD evidence only; successful native Chrome is still pending.
