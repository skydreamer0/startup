# Issue #49 category lifecycle acceptance

Base master: `d5dcc6c22e3bd78d8efc68f120a8546ae615534a`.
This extends the existing category runner and leaves production source, API,
schema, permissions, dependencies, CI YAML and checkout-command files unchanged.
Issue #49 remains open. Initial local checks are passed; native CI evidence is
pending until the exact submitted head and raw artifacts are independently reviewed.

## Finite matrix

| Cases | Widths | Required behavior |
| --- | --- | --- |
| Existing stable navigation (3) | 1366, 1024, 390 | Single SKU, empty search/category, keyboard/pointer switching and All retain category set/cart |
| Lifecycle (3) | 1366, 1024, 390 | Slow initial error shows loading; 500 at 1366/390, 403 at 1024; manual retry reaches real successful API; rapid A/B switch leaves B after late A; real stale expiry, injected refetch 403/500 and manual recovery preserve search/selection/cart |
| Real empty tenant (1) | 390 | Production category API returns an empty list from its separate empty synthetic tenant; empty state differs from loading/error |

Each lifecycle uses the unchanged QueryClient: four initial failing GETs and four
refetch failing GETs (one attempt plus three automatic retries), then exactly one
successful manual GET in each recovery phase. Initial requests delay 1500ms;
manual successful reads delay 1500ms; the old A product request delays 2000ms.
The API ledger records case, phase, planned injection, actual elapsed time and
completion time. B must complete before delayed A, remain selected, and keep its
products after A finishes. All browser API calls are GET; checkout/refund is denied.
The test uses real wall-clock 61000ms expiry and background/foreground browser tabs,
without fake timers, application hooks or cache mutation.

## Identity and evidence

Use only the ordinary GitHub-hosted SKU job and its fresh, exclusive PostgreSQL15
service. The original environment, source, service/network/empty-schema guards,
Chrome sandbox, installed CJK fonts and process quiescence requirements remain.
Issue #123 corrects the former `newCDPSession().send(false)` workaround. Chrome
keeps a session-owned capturer when Playwright enables focus emulation; disabling
it from a fresh session does not release the original session's capturer.
See [Chromium EmulationHandler](https://github.com/chromium/chromium/blob/main/content/browser/devtools/protocol/emulation_handler.cc)
and [Playwright noDefaults](https://playwright.dev/docs/api/class-browsertype#browser-type-connect-over-cdp-option-no-defaults).

`native-context.ts` uses Playwright's public `launchServer` with headed official
Chrome and chromiumSandbox=true, so Playwright owns process/profile cleanup and
its standard launch flags. An ephemeral loopback CDP port is used only within this
owned test process. The second, public `connectOverCDP({noDefaults:true})` attaches
to the default context without installing focus emulation; newContext would not
honor this option and must not be used. Each test owns a fresh browser/profile.
The default-context fixture explicitly retains service-worker registration blocking,
all-page HTTP/WebSocket guards, nonce correlation and rejection of unexpected workers.
The actual owned browser server closes before the network receipt is accepted;
merely disconnecting a CDP client is insufficient cleanup.

Before the category API/DB fixture, a standalone about:blank preflight verifies
same-window tabs and trusted hidden/visible events on a fresh run-owned Xvfb.
It is driver evidence only. Each of the seven cases repeats this prerequisite.
The lifecycle cases retain real 61000ms expiry and additionally require exactly
one trusted hidden/visible pair with at least 61000ms between events. No document
property, event, timer or query state is synthesized. The Xvfb display remains
1920x1080, TCP-disabled and fresh; ambient DISPLAY is rejected and all children
inherit the run nonce for the existing quiescence checks. This is virtual-display
browser evidence, not physical device evidence.

Draft verification: a supplemental typecheck with available TypeScript and
Playwright 1.62.1 types passes (not locked 1.63/Node22 validation). Six synthetic
resource-ownership scenarios pass; the corresponding authored Vitest regressions
await canonical CI. These do not exercise Chrome. Local official Chrome/Xvfb and canonical Node22/pnpm runtime
are unavailable. Native preflight, three 61-second journeys, API/PG acceptance and
exact-head CI are NOT RUN locally. Historical master/PR120–122 category 4 PASS /
3 FAIL and downstream stock skips remain failures/missing acceptance until a new
exact-head run is independently verified. No HOLD #109 rerun or deployment.

Do not invent CI environment values or use an ambient/Preview/Production URL.
The existing job owns service creation/migrations; this fixture only creates and
removes its generated UUID tenants/users/shifts/categories/products. Complete
business-table snapshots before/after must match. Every table must be empty after
exact tenant cleanup; the subsequent unchanged SKU receipt proves database removal.

The existing `pos-category-native-*` artifact contains raw API bodies and unique
request IDs/status/SHA256 matched to browser receipts, source hashes, database
identity/full snapshots/counts, report, captures/glyphs/geometry/cart, reachability,
lifecycle receipts, quiescent phase/cleanup, completion and accepted JSON. The
original 21 stable captures plus 24 lifecycle and one empty capture are required.
Missing/skipped/retried cases, failed cleanup, uncorrelated/extra responses or
nonquiescent producers cannot produce accepted evidence. Ephemeral JWT bootstrap
is deleted before publication. Actual PNGs still require non-author pixel review.

403/500 responses are injected by finite test-only outer Express middleware and
never described as real authorization denial or an actual database outage.
Successful/slow reads reach the unchanged production Express/JWT/RBAC/tenant/
controller/service/Prisma path and isolated PostgreSQL. Real auth evidence remains
in the separate nine-case category backend suite from #93.

## Local checks and boundaries

Node22.23.3, canonical locked backend npm/workspace pnpm installs; both category TS
projects, production POS build, fixture ESLint, category guard/ownership negative
controls, existing inventory/CategoryNav component regressions, context and lock
validation, and whitespace checks. Local loader collection never starts a browser
or database and is not native acceptance. CI raw results are recorded in the PR.

Login/tenant-switch UI, unknown/conflict checkout recovery, scanner hardware,
Safari/iPad, touch/soft keyboard, screen readers, native zoom, complete POS layout,
cross-terminal freshness, actual DB outages and production deployment remain outside
this slice. Existing confirmed stock/refund evidence from #102 is retained by the
unchanged stock runner. No merge, manual deploy, permission or production DB action
is authorized by this acceptance result.

