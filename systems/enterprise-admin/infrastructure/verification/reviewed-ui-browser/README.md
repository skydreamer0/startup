# Fixed-subject scanner and supplier browser evidence

This test-only candidate is based on master `70fab32cbda0919aa1e85003318538a042a5f91b`.
It does not add either unmerged feature to master and does not modify the subjects.
The existing POS Playwright dependency and CI Chromium installation are reused.
No package, lockfile, application, database, permission or secret setting is changed.

## Immutable subjects

| Subject | Head | Tree |
| --- | --- | --- |
| #53 scanner | `6977e76fb764f83c46369d0eb78ca60c2ecaa5c9` | `df3d3d6c5a865157afc3dc0ba7f7fa8d396f36cb` |
| #54 suppliers | `2b2d02a4cd54ed393f32e08ee60bdb35183cdb3d` | `d4945f074e8970977291db385b48808e9d049c13` |

Both subjects include master 70fab via ordinary two-parent commits. Their only
conflict was ROADMAP; all original bounded evidence and 14 checkboxes were preserved.
The setup verifies these exact subject heads/trees and the QA checkout tree before
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
and `UI_QA_SOURCE_SHA` set to the exact QA source commit:

```sh
pnpm exec tsc --project tsconfig.ui-evidence.json
pnpm exec playwright test --config e2e/ui-evidence.config.ts
node e2e/ui-evidence/manifest.mjs
```

The `reviewed-ui-browser-evidence` CI artifact saves runtime-evidence.json (QA head,
checkout head/tree, subjects/trees, run ID, owned PIDs), a JSON test report, original
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
