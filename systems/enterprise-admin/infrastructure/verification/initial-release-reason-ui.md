# Initial receipt release reason UI (#46)

This small UI slice starts at PR #81 head
`e4c204024f62bfe4bc0c343c6193525ff967c414`, tree
`92876e50015040946cf03b4ad98e17ebaf0e10c2`, on independent branch
`feat/46-initial-release-reason-ui`. Remote master was
`9ec05fbb62688d02dc96df2099e39745762a02be`; Issue #46's latest evidence comment
leaves the initial receipt reason UI, actual browser/device acceptance and store
role policy open. PR #79/#81 are preserved and this PR targets #81's branch.

## Behavior and regression evidence

`BatchListPage` uses the existing AuthProvider permission check, including `*`.
Loading or missing `create:products` disables receipt entry. Missing
`release:product_batches` disables RELEASED and explains the available quarantine
and blocked receipt paths. RELEASED requires a reason with 1–1000 trimmed
characters, sends only its trimmed reason through the existing receipt client,
and preserves the existing complete date and batch/product query invalidation.
Other statuses omit the reason. No API, schema, permission seed or role is changed.

Pending receipt disables edits, cancellation, backdrop closing and reopening.
A synchronous request guard also rejects same-turn repeated submits. Rejected
writes show an inline alert, retain all fields and do not refresh stock or claim
success. Network uncertainty asks the operator to check batch/stock before retry;
there is no automatic receipt retry or command replay guarantee. Cancel/backdrop
reset the draft and its reason without posting.

Six incremental RED→GREEN cycles covered reason/contract, independent release
permission, receipt authority, blank/overlong reason guards, inline server denial,
and immediate repeated submission. Additional regressions cover 409/500/network
errors, both cancellation paths, status changes, wildcard permissions and profile
loading. The new 15 JSDOM cases use real AuthProvider/page/API clients with only
synthetic HTTP-boundary fixtures. The old three screen cases and all old pagination
and history assertions remain; their fixtures now supply the required auth context.

Locked Node22.22.0, pnpm10.34.6 and Vitest4.1.11: full admin suite **89/89** passed,
including all previous 74 cases. Admin lint, TypeScript/build, agent context,
dependency lock boundary and whitespace checks passed. Current exact source-head
CI and browser evidence are recorded in the Draft PR; earlier PR #81 CI is not
claimed as acceptance of this UI change. Workspace raw logs and any browser
evidence are in `/workspace/receipt-ui-evidence/` for the parent's independent review.

## Remaining acceptance

The JSDOM results are not true browser or native PostgreSQL acceptance. Browser,
keyboard/touch/zoom and real API/DB results must be reported separately in the
Draft PR, with source hashes and synthetic fixture/cleanup evidence if run.
Physical devices, Safari/iPad, store role approval, production migration/recovery,
full inventory/accounting and parent/G0–G7 gates remain separate. The parent will
arrange independent review. Keep #46 open and this PR Draft; do not merge, deploy
or grant formal roles. No production DB connection or operational receipt is used.
