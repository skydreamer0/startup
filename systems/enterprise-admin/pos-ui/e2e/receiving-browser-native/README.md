# Receiving draft browser acceptance

This is the Admin ReceivingDraft harness, located under the existing POS-owned
Playwright package. It changes no POS product behavior, receiving API, inventory
posting, permission, schema, lockfile or CI job.

## Current lifecycle increment

The original seven cases and 1440/390 matrix remain. Two existing cases now
require more evidence:

- CAS: one initial save and a concurrent 200/409 pair, then the losing page's
  explicit retain choice and one save against revision 2. Reload must show
  revision 3. The actual version-history API and rendered history must preserve
  the original v1, winning v2 and retained v3 titles. Choosing retain alone cannot
  submit. Both the browser and real API ledgers must record the history reads.
- Response loss: hold a genuine committed 200 response at the outer transport,
  exercise browser Back while the UI is pending, then lose that response and
  repeat Back while unknown. The discard action must be disabled, cancelling
  navigation must retain the same URL/title, and only one PUT is allowed. The
  response hold has a 20-second deadline and is released in the test's finally.
  Recovery still uses GET, followed by reload with no repeated save.

The per-case ledger includes only synthetic draft titles, revision numbers and
observed navigation state. It does not record login bodies or tokens. Acceptance
rejects missing lifecycle receipts, wrong revisions, changed historical titles,
another draft's guard observations, unexpected extra writes or missing real API
history reads. Existing hosted ownership, browser sandbox, deadlines, source,
HTTP drain, append-only snapshot and owned cleanup gates are unchanged.

`receivingBrowserScope.verified` describes the conditional scope of a successful
native run of that exact source. Merely loading that constant, passing control
tests or collecting Playwright tests does not establish native acceptance.

## Verification commands

Use the repository's Node 22 and pinned pnpm 10.34.6 installation boundaries.
From the repository root, run:

```sh
node --test systems/enterprise-admin/pos-ui/e2e/receiving-browser-native/*.test.mjs systems/enterprise-admin/backend/scripts/receiving-*.test.mjs
cd systems/enterprise-admin
pnpm --dir pos-ui exec tsc --project tsconfig.receiving-browser-native.json
```

The native producer remains `backend/scripts/receiving-drafts-browser-native.mjs`
inside the existing hosted receiving worker. It requires the same source's real
Admin build, real login/API, original ten PostgreSQL cases and exact owned
database proof. Never spoof hosted variables or use another database to run it.
Source changes require a fresh native run and independent evidence review.

## Acceptance boundary

The lifecycle increment is implemented but its native browser/API/PostgreSQL
execution is **NOT RUN** at this checkpoint. Local control tests are synthetic;
TypeScript and test collection are not browser evidence. Existing historical
native results remain tied to their own source, without being relabelled.

Opening another actor's saved draft/history, cross-tenant browser isolation and
read-only actor PUT rejection remain outside these cases. Sidebar/query changes,
native window-close warnings, touch, Safari, zoom and store devices are also
unverified. This does not complete formal receiving, physical returns, bins,
all-writer inventory reconciliation or any parent Issue/G0–G7 gate.
