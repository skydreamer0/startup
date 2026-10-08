# Fixed-subject scanner and supplier browser evidence

The original test-only candidate was based on master `70fab32cbda0919aa1e85003318538a042a5f91b`.
This provenance-only repair is stacked on #59 (`2031bfe3d422a754780ab91823ebc7ec42509b16`).
It does not modify the subjects or establish latest-master integrated acceptance.
The existing POS Playwright dependency and CI Chromium installation are reused.
No package, lockfile, application, database, permission or secret setting is changed.

## Immutable subjects

| Subject | Head | Tree |
| --- | --- | --- |
| #53 scanner | `6977e76fb764f83c46369d0eb78ca60c2ecaa5c9` | `df3d3d6c5a865157afc3dc0ba7f7fa8d396f36cb` |
| #54 suppliers | `2b2d02a4cd54ed393f32e08ee60bdb35183cdb3d` | `d4945f074e8970977291db385b48808e9d049c13` |

Both subjects include master 70fab via ordinary two-parent commits. Their only
conflict was ROADMAP; all original bounded evidence and 14 checkboxes were preserved.
The setup verifies these exact subject heads/trees and the execution provenance below before
starting its two owned Vite processes on 127.0.0.1:4273/4274. An occupied port is
an error; no existing server is reused or stopped. Only owned child PIDs are stopped.

## Bounded acceptance

- Scanner: actual focused browser keyboard/input events plus Enter; two different
  scans with reverse replies, same-SKU quantity two, fuzzy/ambiguous/error rejection,
  and delayed results after manual search or confirmed cart clear.
- Suppliers: the real rendered apps and real API clients consume synthetic success
  envelopes; options and rows, successful empty, 403/500/offline versus error,
  edited draft/current supplier preservation and zero-submit Retry are checked.
- All API responses are intercepted synthetic fixtures. Only the three exact
  Google Fonts CSS URLs imported by the pinned subjects are fulfilled locally
  as empty `text/css` for GET stylesheet requests; they never reach the network.
  Their URLs are recorded separately in `stubbedStylesheets`. Undeclared APIs,
  other external requests (including font binaries) and every write request are
  aborted and fail the tests. No checkout,
  shift, refund, product save or real supplier write is requested.
- Every screenshot is marked as synthetic, at a recorded 1440x900 viewport.
  Page errors, attempted writes and unexpected requests are asserted empty.

Only `e2e/ui-evidence/*.spec.ts` runs under its dedicated config. The older broad
checkout-flow suite is excluded. This is real Chromium UI acceptance with mocked
HTTP, not real API/database, hardware scanner, mobile/Safari, all viewports or G0–G7.

## Reproduction and provenance

CI checks out the two pinned subjects into `.ui-evidence-subjects/` and installs
their existing frozen lockfiles. No new dependency is introduced. The normal four
CI jobs remain required; the POS job additionally runs this bounded suite.

From `systems/enterprise-admin/pos-ui`, with those checkouts/dependencies present
set the following explicit provenance values before running:

- `UI_QA_SOURCE_SHA`: exact submitted QA commit (PR head in CI).
- `UI_QA_EXECUTION_SHA`: exact commit checked out for execution (`github.sha` in CI).
- `UI_QA_EXECUTION_MODE`: `head` for an exact source checkout, or `pr-merge` for the PR merge checkout.
- `UI_QA_BASE_SHA`: unset/empty in `head` mode; exact event base commit in `pr-merge` mode.

Head mode requires source and execution SHA/tree equality. PR-merge mode requires
exactly two ordered execution parents: event base, then submitted QA head. A merge
may change other files but cannot silently change the submitted UI evidence driver,
its config or typecheck input. Both source and execution trees are recorded separately.
For a local exact-source checkout:

```sh
export UI_QA_SOURCE_SHA="$(git rev-parse HEAD)"
export UI_QA_EXECUTION_SHA="$UI_QA_SOURCE_SHA"
export UI_QA_EXECUTION_MODE=head
unset UI_QA_BASE_SHA
```

Tracked staged/unstaged changes are checked separately. Tracked files with
assume-unchanged or skip-worktree flags are rejected, without changing those flags.
Untracked QA inputs and subject files are checked against ordinary and ignored
file listings, including local Vite `.env*` files. Ignored files are only exempt
in explicitly named dependency and generated-output locations; arbitrary ignored
source/spec files are rejected before starting the affected subject. Installed
dependency contents and generated outputs are outside this source check, and this
is a pre-launch check rather than a continuous filesystem integrity guarantee. These checks do not change CI triggers, permissions or pinned subjects.

Run:

```sh
pnpm exec tsc --project tsconfig.ui-evidence.json
pnpm exec playwright test --config e2e/ui-evidence.config.ts
node e2e/ui-evidence/manifest.mjs
```

The `reviewed-ui-browser-evidence` CI artifact saves runtime-evidence.json (QA head,
execution head/tree, mode, base, ordered parents, subjects/trees, run ID, owned PIDs), a JSON test report, original
runner output, per-test network assertions, PNGs and failure traces. Its manifest
records file lengths/SHA-256. Any subject change invalidates the evidence binding
and requires a deliberate new pinned candidate/run. CI results and artifact IDs
are reported after execution; this source document does not claim an unrun pass.

The config resolves both the JSON report and test output from its own file into
`pos-ui/test-results-ui-evidence/`. Upload includes hidden files such as
`tests/.last-run.json`; the manifest covers them as well as logs, PNGs and JSON.

## 123 timeout diagnosis

Original CI run `37576560821` failed all 13 cases on blocked Google Fonts CSS.
The `123` case also had a separate missing-toast failure. Its original trace shows
product-search `q=1` at monotonic 6649.313ms and `q=12` at 7049.936ms: about
401ms apart, consistent with expiration of the existing >300ms decoder window.
Only one `q=123` request was observed, rather than search plus scanner lookup.
The trace did not record keydown timestamps, so it does not establish what caused
that scheduling gap.

With empty CSS interception, a native-keyboard 400ms-delay control reproduced
the same toast timeout, with recorded trusted keydown gaps 414/414/423ms and
zero unexpected requests. Ordinary 10ms typing passed 10 local repeats. This
isolates decoder expiry from the CSS guard failure without changing production.
The scan driver now uses native keyboard typing without added delays and sends
Enter directly; it checks the exact trusted key sequence and each <=300ms gap.
Per-test network JSON retains keydown timestamps. A future slow driver fails
explicitly at this precondition instead of misreporting a product toast defect.

No merge, readiness approval, deployment or business-gate release is implied.

## Evidence scope and remaining limits

The receipt is marked `historical-fixed-subject-ui`: these immutable scanner and
supplier subjects remain historical even when the QA driver executes in a clean
advanced-base PR merge. This is not latest-master application E2E acceptance.
Before reusing a local output directory, archive/remove its previous generated
evidence; this minimal repair does not implement stale-artifact freshness checks.
A failed setup must not be represented as a successful current run from older
artifacts. The existing runner outcome and exact receipt identities remain required.
