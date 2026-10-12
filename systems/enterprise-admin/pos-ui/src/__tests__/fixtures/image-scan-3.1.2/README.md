# Local image scanner fixture scope

- `blank.png` and `blank.jpg` are synthetic 64 × 64 white RGB images generated with
  Pillow 12.3.0. They contain no user data. Their purpose is the valid-image / no-code
  boundary and PNG/JPEG header checks.
- `../imageScanFixtureFactory.ts` creates QR, EAN-13, EAN-8, UPC-A, Code 128,
  Data Matrix, binary QR and two-symbol PNG inputs during the real-WASM tests.
  It pins the fixture writer to `zxing-wasm` **3.1.2**, loads its installed local
  writer WASM, and uses only fictional literal strings and binary bytes.
- These generated barcodes use the same upstream engine family as the reader.
  They are repeatable pipeline regressions, **not independent barcode/GS1
  conformance, real-label quality, camera, scanner-hardware or pharmacy acceptance**.
- The two-symbol fixture uses a small local grayscale PNG encoder to arrange the
  writer's two symbol matrices, with white margins. No external images are read.

Run from `systems/enterprise-admin/pos-ui` after the canonical root pnpm install:

```sh
pnpm exec vitest run src/__tests__/imageScanEvidence.test.ts \
  src/__tests__/imageScanDecoder.guards.test.ts \
  src/__tests__/imageScanDecoder.wasm.test.ts
```

The real-WASM test adapts only WASM byte loading to Node's filesystem. Production
uses Vite's bundled `?url` asset and strict `locateFile`; browser asset loading needs
its own built-app verification. The Node test denies `fetch` and exercises the real
compressed-image decoder and evidence mapper. Guard tests explicitly mock the
engine to exercise initialization failure/concurrency and pre-allocation rejection.

Input limits are 10 MiB compressed bytes and 16,000,000 declared pixels. Those
guards are not a hard total WASM memory/time budget or malicious-image conformance
certification. Browser CPU/RAM, offline cache availability, Safari/iPad, and
independent real-label/GS1 cases remain separate acceptance gates.

## Verification receipt, 2026-10-12

The canonical dependency install was cancelled twice; acquisition and runtime
decoder testing were stopped. No alternative package was fetched or substituted.
The Vitest suites, generated-barcode fixtures, real WASM, full TypeScript check and
application build are **NOT RUN** for this candidate.

`pure-adapter-smoke.mjs` ran with the already-installed Node 22.22.0 native type
stripping: **19 pure-adapter check groups passed**. The machine-readable
`pure-adapter-smoke.result.json` explicitly marks WASM, Vitest, type checks and
browser execution false. The two service files, three test files and fixture
factory also passed Node's `--experimental-transform-types --check` parser only.
Neither result is a decoder-runtime or build-readiness claim.
