# Issue #31: truthful held-draft action feedback

Bounded repair of existing editable-draft/frozen-checkout state consistency.
The existing cart store refuses mutations while recovery is pending, unknown or
conflict. HoldOrderBar previously displayed successful hold/recall/deletion even
when that guard refused the action. This is a source-confirmed defect; no runtime
RED reproduction is claimed.

## Scope

- Read live recovery/cart state when each action is activated, including before a
  React rerender. A frozen checkout shows a warning without mutating either store.
- Empty current carts and stale held-row references do not claim success.
- Read the synchronous store result before showing applied-operation feedback;
  only an applied recall closes the held list.
- Preserve existing hold/recall/delete semantics, memory-only ordinary drafts,
  immutable recovery intent, authenticated scope, member/payment/staff context,
  identifiers and store contracts. No API, schema, security, dependency or
  workflow change. This does not implement a new persistence or deletion policy.

Files: HoldOrderBar.tsx, HoldOrderBar.feedback.test.tsx and this record only.
No overlap with the changed paths of existing #109/#113/#114/#115/#116/#118.
The inspected base is master bcc216e62877094470bebe9692c0a09439e4d071,
whose tree is b05c99daad849de20964b5e7ed1b2debc29212d1. It differs from the
initial b56ad9b1 inspection only in unrelated backend acceptance files.

## Verification at Draft preparation

PASS: repository agent-context validator and git diff --check.

BLOCKED before assertions: local `npm test --
src/__tests__/HoldOrderBar.feedback.test.tsx` exited 127, `vitest: not found`.
There are no installed POS dependencies in this isolated source workspace;
Node is 24.19.0, not the required Node 22. The local source checkout was copied
from an older existing checkout; relevant instructions/component/store files
were checked against the immutable remote base. It is not a claimed full-base
runtime checkout. No dependency installation, lock or runtime configuration was
changed to conceal this gap.

NOT RUN locally: the 18 authored focused cases, full POS tests, strict TypeScript,
build and lint; browser, native keyboard/pointer/touch, scanner, iPad/Safari and
real API/database acceptance. Exact-head GitHub CI and Devin Review are recorded
separately; they do not replace native/device acceptance. Existing category-browser
FAIL and downstream stock-browser skips remain separate; no #109 retry is made.

## Reproduction and acceptance

In the canonical Node 22, frozen pnpm workspace:

```sh
pnpm --filter pos-ui test -- src/__tests__/HoldOrderBar.feedback.test.tsx
pnpm --filter pos-ui test
pnpm --filter pos-ui build
```

The 18 synthetic React/JSDOM cases use real cart/recovery actions: each frozen
status blocks all three operations and leaves both stores unchanged; each action
also checks a pending transition in the same React batch. Editable hold, recall
with B preserved, and selected deletion succeed; empty-cart and removed-row
activation before rerender have no false success.

Native acceptance still needs actual built POS interaction: open held A beside
editable B, enter pending/unknown/conflict via an authorized synthetic workflow,
activate each action with keyboard/pointer, verify warning and unchanged drafts/
frozen payload, then verify normal actions after recovery is properly completed.
Inspect list close/preservation, focus, small/touch layouts and actual captures.
This record does not authorize production transactions or new test environments.
Issue #31 and all wider operational gates stay open; no merge/deployment included.
