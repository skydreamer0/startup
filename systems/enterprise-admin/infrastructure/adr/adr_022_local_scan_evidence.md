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
