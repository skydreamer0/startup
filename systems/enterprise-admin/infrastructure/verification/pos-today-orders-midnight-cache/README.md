# Today-order UI cache rollover: bounded Issue #30 / #31 follow-up

This branch stacks on #114 (`2881f6399101a583c1eb41300064f5631eba2a93`).
The server's existing Asia/Taipei-midnight helper remains authoritative for the
GET `/pos/orders/today` bounds. The browser date is only query cache identity;
no accounting/refund date policy, shift semantics, API contract or DB change.

## Change

- Append the Taipei calendar day after the existing scope/shift query prefix.
- A single mounted timer wakes at midnight (at most once per minute otherwise,
  to notice clock changes), with focus/pageshow/visible-tab resume rechecks.
  It does not poll the API during the same day.
- Re-read the date on rendering and before/after requests. Consume the Query
  cancellation signal so results arriving after day/scope change or unmount
  cannot publish. The unchanged API transport itself is not physically aborted.
- No previous-day placeholder rows. Loading, empty and failed read differ;
  failed same-day refetch warns that retained rows may be stale and offers retry.
- Keep the existing query invalidation prefix, search, refund action and all
  held/editable/frozen checkout state. Only the modal and its new hook change.

## Verification status at authoring

- PASS: `./scripts/validate-agent-context.sh`; `git diff --check`.
- BLOCKED locally: canonical pnpm 10.34.6 frozen/offline install lacks the locked
  `react@19.3.0` tarball. Initial default store path was unavailable; a writable
  isolated `/tmp` store confirmed the missing package. Runtime is Node 24.19.0,
  not the repository's required Node 22. No manifest or lockfile was changed.
- NOT RUN locally: new Vitest cases, complete POS tests, type/build, browser,
  native database or physical-device acceptance. Configured exact-head CI must
  run tests/build using its canonical runtime; authored assertions are not passes.
- Independent source acceptance and Devin Review remain pending at this snapshot.
- Separate native PostgreSQL boundary evidence for #114 is not supplied by these
  mocked API/real QueryClient tests. Full #30/#31 and G0–G7 remain open.

## Reproduce in the canonical workspace

From `systems/enterprise-admin`, use the standard frozen pnpm installation, then:

```
TZ=UTC pnpm --filter pos-ui test -- src/__tests__/OrderLookupModal.midnight.test.tsx src/__tests__/POSCheckoutPage.inventory.test.tsx
TZ=Asia/Taipei pnpm --filter pos-ui test -- src/__tests__/OrderLookupModal.midnight.test.tsx
TZ=America/Los_Angeles pnpm --filter pos-ui test -- src/__tests__/OrderLookupModal.midnight.test.tsx
pnpm --filter pos-ui test
pnpm --filter pos-ui build
```

The synthetic tests cover year-end Taipei rollover while still inside staleTime,
close/reopen, suspended timers and multiple midnights, late old responses,
error versus empty/retry, tenant/shift ABA isolation, cleanup, no same-day polling,
search/refund callbacks, and preservation of held A / active B / frozen intent.
Existing inventory/refund tests keep their other-scope invalidation assertions
and now address the day-suffixed keys.

Native browser visibility, real server/client clock skew, physical terminals and
full application acceptance are not established by fake timers. The client must
have a reasonably accurate clock, as before; it does not dictate server records.
