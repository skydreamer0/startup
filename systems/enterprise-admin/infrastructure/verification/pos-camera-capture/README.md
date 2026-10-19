# POS camera capture: bounded software acceptance

Tracking: #37 M0-A, #31, #48. Base source:
c4e6307e0fce99a65a83b32eef43484eefc6a7a4.

## Workflow and authority

Open camera entry → explicitly enable video → explicitly capture one local frame
→ select a decoded symbol → confirm literal evidence → explicitly open existing
package lookup → explicitly look up and select/re-resolve a reviewed package.
Only the last existing package action can alter the editable POS cart; none of
these actions posts inventory or confirms checkout. Unknown GS1 stays unknown.
This is not a camera OCR, internal-batch QR or receiving/posting implementation.

CameraCapture bounds canvas dimensions before allocation, releases streams before
PNG encoding, drops late permission/encoding/decode results, and handles denied,
unavailable, playback/capture/interruption failures. Stop/close/unmount/pagehide
and document hiding release tracks and cancel evidence. POS identity, pending
checkout, draft revision and staff changes invalidate the session, including
batched identity ABA transitions. No microphone permission is requested.

API-spec/new-endpoint tests: N/A because no API, schema, role or endpoint contract
changes. The existing ADR-024 GET package lookup and POST read-only resolution
contracts remain unchanged and are used only on explicit actions. Their native
tenant/RBAC/PG acceptance is separate from this new synthetic browser path.

## Local supplemental checkpoint (not canonical CI)

Node 24.19.0; React 19.3.0, Vitest 4.1.11, TypeScript 5.9.3,
zxing-wasm 3.1.2. Dependencies are isolated outside the repository; the repository
pnpm lock and package manifests are unchanged.

- 11 related Vitest files / 132 cases PASS: camera lifecycle, image evidence,
  real POS/scanner/cart integration, existing manual/package readers, image
  bounds/evidence and actual pinned WASM against same-engine synthetic symbols.
  Same-engine barcode generation/decoding is not an independent conformance test.
- Dialog report/ledger/font/process guards plus camera negative controls and
  generated Y4M QR decoded by the actual pinned reader: 11/11 PASS.
- Production POS source plus the three changed test files: focused tsc PASS.
- Camera/complete dialog harness tsc PASS.
- Playwright collection: 23 cases (19 retained, 4 new), NOT EXECUTED locally.
- Full supplemental test-inclusive tsc FAIL reproduces identically on the exact
  unchanged base: two existing WASM fixture files pass Node Buffer to an
  ArrayBuffer-typed wasmBinary option. This baseline failure is retained, not
  fixed or hidden by changing unrelated tests. Focused types do not replace the
  canonical locked Node22 CI build/type gate.

Earlier local failures are retained separately: missing copied blank image
fixtures; unsupported getByRole exact option fixed; camera harness element/
optional-argument types fixed; Playwright CommonJS collection could not import
the generator's import.meta, fixed by keeping the shared literal in cases.mjs.
Dependency installation had a scope-review denial, an authorized identical poll
then unknown-session result, and a single checked recovery after proving no live
owned process or new-package side effect. Recovery exit 0 and installed/lock/
official-registry manifests were verified. No alternative access route was used.

## Exact-head normal public CI route

Reuse e2e/dialog-acceptance/run.mjs and the existing POS dialog job. No new job,
paid runner, browser install, security exception or workflow setting is added.
The owned output contains the generated 480x480 synthetic QR Y4M and checksum.
Official Chrome retains its sandbox and gets only fake-device/file flags; tests
grant camera permission in their isolated browser context. Browser video,
canvas PNG encoding and bundled local WASM are real; permission denial/delay and
all business HTTP are synthetic.

Four added cases:
- 1366×768, 1024×768, 390×520: no media request on open, explicit frame capture,
  actual QR literal/observed bytes, ended tracks, warm initialized-decoder offline
  reuse, selection/confirmation without side effects, then explicit existing
  package lookup/re-resolution and one cart addition.
- Injected denial, deliberate retry, late acquired-stream cleanup after Escape,
  successful reopen and close without cart or checkout mutation.

Each positive case requires live-video, confirmed-evidence and package-choice
PNG plus focus/viewport/document-width/five-point hit-test receipts; denial has
its own PNG/geometry. All ten are required with per-capture real CJK glyph
receipts, sealed network ledgers and quiescent-owned-process completion.
Independent review must inspect the actual resulting pixels before visual PASS.
A collected test, source review or generated frame test is not Chrome execution.

## Still open

Current submitted-head locked CI, actual Chrome execution and ten PNG reviews
must be recorded on the PR after it runs. Local Chrome launch remains NOT RUN
after the known cloud sandbox limitation; no local/user-computer retry.

Physical camera/USB/FNC1, actual OS permission prompts, LAN HTTPS, Safari/iPad,
native 200% browser zoom, cold offline asset installation and measured 8 GB
CPU-only P50/P95/RAM remain NOT RUN. Warm decoder reuse is narrower than offline
installation. Real API→PG evidence belongs to the existing package suite and
cannot be claimed from these synthetic HTTP cases. No parent Issue/G0–G7 gate
is closed, and no formal database/migration/deployment/device operation occurs.

## Camera to real package API / owned PostgreSQL follow-up
The existing package-native harness additionally exercises the 390px camera entry against its real production HTTP/JWT/RBAC API and exclusively owned empty PostgreSQL15 fixture. It preserves all original three-width package, obsolete-response, revision409, stock-reconciliation and label journeys. No extra workflow, service, runner, security permission, dependency, application runtime or production migration is introduced.

The fixed local Y4M QR uses `00Case-390 `, including its trailing space. Official sandboxed Chrome consumes a fake video device; the actual video/canvas/bundled WASM reader supplies the literal. Opening and cancelling, one synthetic permission rejection, and cancelling a real fake-device stream preserve the cart and issue no package lookup. Explicit capture, selection and confirmation precede the sole real lookup; only explicit package selection resolves the actual persisted replacement revision2 (6 stock units). Existing cart3 becomes9 once, two real pointer reactivations while the authentic resolve response is held cannot create another resolve/add; consumed choices disappear, unknown conversion stays disabled. Request-start phase receipts prove zero initiated package requests before explicit lookup, separate from the server-finish ledger. No checkout or stock mutation endpoint is allowed. Before/after business snapshots are equal.

Receipt files in the existing package artifact: camera-native-fixture.json and owned Y4M; camera-native.json; raw camera-native-lookup.json / camera-native-resolve.json and their SHA256; camera-native-database.json (synthetic persisted revision/identifiers); camera-native-business.json; camera-native.geometry.json and original camera-native-package-390.png. All remain covered by the original source hashes, API/network ledger, exact-head/run/service identity and zero-row/process cleanup. The database revision must match response revisionId/packageId/tenant/revision/conversion/exact identifier, rather than merely counting HTTP200. Twenty-five supplemental controls include receipt mutations and decoding the generated frame with the pinned reader. The harness runs those controls before native flow.

This follow-up needs its own exact-head public CI and non-author original-pixel review. Until then it is a candidate, not executed native acceptance. The earlier PR151 23-case syntheticHTTP Chrome receipt remains independently valid for its old head and is not relabelled realAPI/PG. Fake media and injected NotAllowedError do not prove physical camera or OS permission prompts, iPad/Safari, native zoom, cold-offline installation, 8GB performance, login UI, production migration or store operation. The image evidence is the focused package-selection stage, not whole-page simultaneous visibility.
