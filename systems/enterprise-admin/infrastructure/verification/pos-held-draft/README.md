# Issue #31 — in-memory held draft context

This bounded correction preserves member and payment selection across ordinary
hold/recall and the automatic save of a nonempty current cart. It does not complete
Issue #31. Source checkpoint `f41db41280198bd442a38870b853dc2ea1a672eb`, source tree
`df4870b79fcfe2fb7316891ffcdd27bd4fc514e0`; base master
`d5dcc6c22e3bd78d8efc68f120a8546ae615534a`.

## Behavior and boundaries

`EditableDraft` shares items/quantities/item discounts, order discount/note,
member ID and in-memory lookup profile, payment, sales staff and draft revision.
Hold and automatic save use the same explicit snapshot. Recall restores that
context under a new monotonic revision, so an old A/B/A callback cannot become
current again. Clear and confirmed checkout discard only the appropriate active
member/payment/discount; held drafts remain intact. Existing current-sales-staff
preservation on clear/hold is retained. A different authenticated checkout scope
clears active and held editable context even if the old recovery intent is frozen.

The controlled customer panel has no private fallback member. Synchronous store
subscriptions invalidate lookup/create responses across hold, recall, clear,
member replacement, pending and scope transitions, including ABA. Edited queries
and unmount invalidate earlier lookups. A late successful create does not select
into a new draft; same-scope feedback states that the member was created and asks
for a new lookup, without including the old profile. A detached write is never
reported as successfully cancelled. A different current scope/unmount suppress old feedback; returning to the original
scope after ABA allows only generic detached-write feedback, never old selection.

Checkout reads customerId from the current editable store and keeps the existing
commandId/frozen payload/pending/unknown/conflict/recovery semantics. Confirmation
also checks the submitted in-memory revision and customerId before clearing.
Recovery explicitly whitelists its prior draft fields; the complete member object,
phone, spending profile, held carts and ordinary draft scope/revision are not
persisted. Restored recovery gets only the frozen customerId and a fresh in-memory
revision, with no customer profile. Ordinary drafts have no new storage mechanism.

## Evidence

`local-raw.zip` and `local-manifest.json` retain original failures and corrections,
source hashes and final local checks. All fixture identities are synthetic.
The author used Node 22.23.3 / pnpm 10.34.6 and the unchanged canonical frozen lock.
A temporary package-tool directory under /tmp was used, not a global install.

- Page RED: 1 failure, recalled A still visibly showed B. Corrected page passes.
- Late lookup RED: 1 failure, lookup selected A after hold. Corrected boundary passes.
- Recovery privacy RED: passing the whole editable store leaked extra draft keys.
  Explicit whitelisting removes them; normal recovery keeps only the member ID.
- First focused run: 45/46; preserving the original sales-staff behavior fixed it.
- First full POS: 379/380; an existing inventory test initialization omitted the
  newly added draftScope, retaining a previous test identity. Only its reset fields
  changed; category behavior, category-native and category fixture are untouched.
- Final full POS: 37 files / 380 passed, zero skipped. Focused source: 13 files /
  210 passed, zero skipped; these overlap the full suite and are not added together.
- POS TypeScript/Vite build, context validation, lock boundaries and whitespace pass.
  POS has no configured lint script. Existing JSDOM navigation-not-implemented
  diagnostics remain in the full raw log; they are not native navigation evidence.

The new real-page JSDOM cases cover F4 and user-event pointer hold, A/CARD → B/CASH
confirmed → recall A/CARD, automatic save of B, two-step clear, payment cancel and
PIN cancel. Store/panel tests cover full context, fresh revisions, frozen editing,
late success/miss/error, new query order, member clear, scope ABA, pending ABA and
late successful customer creation. Hook cases cover ID-only recovery and unchanged
frozen resends, profile exclusion, and same-content/new-revision or member-only
later drafts. Existing scanner, pending/recovery, split/PIN and payment tests run.
These are synthetic API + JSDOM/unit checks, not browser-native input or DB checks.

## BLOCKED / NOT RUN

One existing Chromium 151 sandbox-enabled Playwright preflight failed before UI
with SIGABRT: the sandbox helper is owned by nobody, and crashpad reports a missing
database directory. The environment has NoNewPrivs=1 and no official Chrome, Xvfb
or sudo. The original launch log is preserved. No retry, no sandbox bypass,
permission change, alternate environment, or speculative CI rerun was attempted.

Native keyboard/pointer at 1366x768, 1024x768 and 390px, actual screenshots, native
200% browser zoom, physical touch/scanner, iPad/Safari and screen readers are NOT
RUN. Native API/DB/member-create writes are NOT RUN: no confirmed isolated owned
service was used. No Production/Preview DB or real member/payment data was accessed.
Price and salable-quantity revalidation on recall, ordinary hold persistence and
complete Issue #31 are outside this slice's completion claim. Real financial/provider
payments, deployment and release gates remain separate.

## Independent review and remote checks

Non-author agent `/root/independent_draft_review` reviewed exact source `f41db41`
and evidence checkpoint `9a9c700`: bounded PASS, no introduced must-fix findings.
The reviewer independently executed 11 files / 169 focused cases and six additional
synthetic probes (counts overlap author tests; do not sum coverage). Those probes
cover rejected creates after hold/pending/scope, a late lookup under sustained
pending, and old checkout success/409 after scope change preserving the new draft
and its pending record. `independent-review.zip` contains their raw logs, scratch
probe source and report; the scratch test was removed from the workspace.
All 11 source hashes and 18 original raw ZIP entries match the manifest, and ZIP
integrity and final author counts were independently checked. No browser/API/DB
rerun was claimed. The Draft PR records the exact remote head/tree/readback. Existing CI
runs triggered by publication must be assessed at that exact remote head; previous
heads and historical browser jobs are not acceptance for this held-draft slice.

No category-native, category fixture, shared test-pyramid, POS MODULE, security,
backend, schema, dependency, workflow, merge or deployment changes are included.
Reproduce local source checks from pos-ui with `pnpm exec vitest run` and
`pnpm run build`; preserve the configured Node22/pnpm10 versions and canonical lock.
