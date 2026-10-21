# ADR-022: Versioned local scan evidence, separate from POS effects

## Status

Proposed for #37 M0-A first slice; no business or hardware acceptance claimed.

## Context and decision

Retain the existing shared `@pharmasaas/types` boundary. `ScanResultV1` is a local
capture contract, not a new API, database model or product/packaging authority.
Keep raw text as received by the adapter, including leading zeroes, case,
whitespace and control characters; do not trim, normalize, parse GS1 or open URLs.
Text does not prove original bytes: never UTF-8 encode it as purported raw bytes.
Unknown symbology, bytes and GS1/FNC1 boundaries use explicit unknown states.

The keyboard route captures the pre-trim buffer at the same accepted Enter gate
as the old scanner: >300ms resets, exactly 300ms remains allowed, and trimmed
length must be >=3. Enter framing is not part of literal. `source: usb` means
keyboard-wedge-compatible acquisition only; a person can produce identical
keyboard events. No scanner hardware or firmware is authenticated. Decoder
version `1` denotes the adapter algorithm revision. A GS separator in literal
alone does not prove GS1 or reconstruct FNC1 lost by the device/OS.

`onScanResult` is opt-in and unused by the POS auto-add hook. Existing string
subscribers still receive trimmed strings first. Pure manual capture accepts
empty/short text for consumers to validate and never emits into either stream.
Neither adapter does lookup, navigation, cart mutation, persistence or posting.
Camera/image source labels reserve contract vocabulary, not implemented support.

## Consequences and acceptance limits

No new dependency, package, API, schema, device permission or business writer.
No second product mapping authority. Future camera/image or workspace consumers
must retain acquisition evidence and independently authorize business effects.

Synthetic unit regressions cover literal preservation and no inference/dispatch,
plus actual keyboard-listener compatibility and subscription lifecycle. Existing
scanner and page-keyboard tests remain in CI unchanged. This checkout has no
installed dependencies: local unit/type/build are NOT RUN; no RED/GREEN claim.
A Node 24.19.0 native type-stripping smoke checked 10 pure-adapter fixtures
(literal retention and unknown metadata), PASS. It does not execute Vitest,
typecheck, DOM listeners or the Node 22 CI environment. Context validation and
`git diff --check` also passed. CI for the submitted head and independent review
must be recorded on the PR.
True USB/FNC1, camera/image, browser/manual UI, Safari/iPad, offline CPU/RAM and
real API/DB are NOT RUN. This first slice does not complete M0-A/B/C or G0–G7.

## Manual evidence UI continuation (#37)

The POS toolbar can open `ManualScanDialog`, an ephemeral read-only consumer of
`captureManualScan`. Pasting replaces the entire draft with clipboard `text/plain`
before the textarea normalizes CR/CRLF. Typing captures the browser's current text.
No trimming, GS1 inference, URL navigation, lookup, legacy barcode emission, cart
mutation or persistence is added. JSON-escaped literal display exposes whitespace
and controls without claiming decoded bytes. Editing clears the displayed result;
closing/unmounting discards both input and evidence.

The dialog owns focus and keyboard input while open. The existing scanner hook's
blocked boundary invalidates prior asynchronous lookups; `cancelBarcodeInput` also
cancels an unfinished buffer/sequence on either blocked transition without changing
subscriptions or the Enter/300ms/min3 decoder gates. This prevents a pre-modal
partial scan from contaminating the first post-modal scan. Background attributes
and the connected, enabled opener are restored on unmount. Frozen checkout intent
and cart authority remain with their existing stores.

This is only manual text evidence UI, not M0-A completion. Exact-head component,
page/scanner and type/build results belong in the PR. Browser, real USB/FNC1, native
200% zoom, Safari/iPad, camera/image, offline CPU/RAM and real API/DB acceptance
remain separate; synthetic DOM events do not establish those gates.

## Local image evidence UI continuation (#37 / #31)

The next bounded route is a visible `圖片掃碼` toolbar entry, local PNG/JPEG import,
preview of the source image and all decoded results, explicit result selection,
and a second deliberate confirmation of the decoded text. This confirmation has
no business callback and lasts only while the dialog is open. It is not approval
of a product/package mapping, receipt, sale or inventory posting. Existing USB and
manual routes retain their own behavior; no image result is emitted into either
barcode subscription stream.

The decoder dependency is pinned to `zxing-wasm` 3.1.2, matching the version already
used by the user's ep-expense scanner. The reusable approach is Vite's local WASM
asset import and an explicit `locateFile`; invoice-specific parsing is not reused.
The exact JS and WASM come from the same package, with no runtime CDN fallback.
`textMode: Plain` retains the decoder's text representation alongside copied raw
bytes, ECI bytes, format, symbology and symbology identifier. These are observed
decoder outputs, not proof of correct product identity or inferred GS1 boundaries.
The shared `ScanResultV1` is unchanged; additional observed image metadata stays
in the local `ImageScanEvidence` wrapper.

PNG/JPEG signature/header checks cap compressed input at 10 MiB and pixel count at
16 million before image decoding. These are defensive bounds, not an 8 GB PC
performance claim. Multiple symbols remain separate; zero symbols, invalid image,
initialization failure and decode failure have distinct presentation. A failed
initialization clears its own cached attempt and retries only the same bundled
asset. A new file selection or unmount discards late results; object URLs and modal
keyboard/focus/background state are cleaned up. All content remains temporary.

This slice excludes camera permissions, OCR text recognition, GS1 field parsing,
manufacturer/package mapping, internal-batch QR routing and business writes. Each
remains on its existing M0/M1 tracking path. Real WASM fixtures, cold-cache offline
asset delivery, browser interaction, supported runtime/build and device/CPU/RAM
acceptance are separate gates and must not be inferred from source or mocked tests.

## Camera acquisition continuation (#37 M0-A / #31 / #48)

The POS camera entry reuses ImageScanDialog's evidence selection/confirmation and
the explicit ADR-024 package lookup handoff. CameraCapture requests video only
after the user presses its enable button; merely opening the dialog requests
nothing. It never requests microphone access, automatically captures, records,
uploads, dispatches scanner input, opens decoded URLs, or writes inventory.

A user-triggered single frame is copied into an aspect-preserving canvas with
both dimensions <=1600 before allocation, encoded as bounded PNG, and passed to
the same pinned local WASM reader. Requested 1280x720 dimensions are hints, not
guarantees. Camera source/frame-route replace acquisition metadata only; decoder
literal, observed bytes and symbology remain untouched, GS1 remains unknown, and
hardwareVerified remains false. The evidence coordinates refer to the bounded
captured frame, not original sensor resolution. These memory bounds are not
measured 8 GB PC performance acceptance.

Capture releases the live stream before asynchronous PNG encoding/decoding.
Stop, close/unmount, pagehide, hidden document and interrupted tracks release
every acquired track. Unresolved getUserMedia cannot be forcibly cancelled by
the web API; generation invalidation immediately stops a late returned stream.
Late encoding and decoding cannot restore cancelled evidence. Retake clears
selection, confirmation, errors and object URLs. Permission/device/play/canvas
errors expose retry or the existing image/manual alternatives.

POS camera evidence is scoped to checkout identity, cart draft revision and
sales staff. Scope/draft/staff changes or a frozen pending checkout remove the
camera dialog and clean its resources. Existing scanner partial/late-result
invalidation and modal keyboard ownership remain in force. Capture, text
confirmation and package handoff each have no cart or stock effect. The existing
explicit package lookup and re-resolution/selection can add reviewed base units
to the editable POS cart; it is still not checkout or inventory posting.

The exact-head official Chrome dialog harness uses a generated synthetic Y4M QR
with fake-device flags, real browser media/video/canvas and the bundled reader.
Business HTTP and injected permission-denial/delay cases are synthetic. It
checks three viewports, warm initialized-decoder offline reuse, raw evidence,
explicit package handoff, no unapproved writes, ended tracks, CJK glyphs and
bounded control geometry/hit tests. Unit media mocks and official fake-device
Chrome are separate evidence. Real permission prompts, physical camera/USB,
LAN HTTPS, Safari/iPad, cold offline startup, native 200% zoom and CPU/RAM/P50/P95
measurements remain NOT RUN. No parent M0/G0–G7 gate closes with this software PR.
