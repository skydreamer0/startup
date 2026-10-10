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
