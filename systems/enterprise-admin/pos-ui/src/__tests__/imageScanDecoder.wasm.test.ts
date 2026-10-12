// @vitest-environment node
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createImageScanFixtures, fixtureInputs } from './fixtures/imageScanFixtureFactory';

// Node has no Vite asset server. Only the WASM transport is adapted to filesystem bytes;
// initialization, the actual reader WASM, compressed-image path and result mapping stay real.
vi.mock('zxing-wasm/reader', async (importOriginal) => {
  const actual = await importOriginal<typeof import('zxing-wasm/reader')>();
  const require = createRequire(import.meta.url);
  return {
    ...actual,
    prepareZXingModule: (options: Parameters<typeof actual.prepareZXingModule>[0]) => actual.prepareZXingModule({
      ...options,
      overrides: {
        ...options?.overrides,
        wasmBinary: readFileSync(require.resolve('zxing-wasm/reader/zxing_reader.wasm')),
      },
    }),
  };
});
import { decodeImageScan } from '../services/imageScanDecoder';

let fixtures: Map<string, Blob>;
let network: ReturnType<typeof vi.spyOn>;
beforeAll(async () => {
  network = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network forbidden in local decoder test'));
  fixtures = await createImageScanFixtures();
}, 30_000);
afterAll(() => { network?.mockRestore(); });

describe('real local ZXing WASM 3.1.2 with same-engine synthetic PNGs (not conformance)', () => {
  it.each(fixtureInputs)('decodes $name PNG and preserves actual text/bytes/format metadata', async (fixture) => {
    const evidence = await decodeImageScan(fixtures.get(fixture.name)!);
    expect(evidence).toHaveLength(1);
    const { scan, decoderObservation: observed } = evidence[0];
    expect(scan.literal).toBe(fixture.literal);
    expect(scan.symbology).toEqual({ status: 'observed', value: fixture.expectedSymbology });
    expect(scan.bytes).toEqual({ status: 'observed', value: Array.from(new TextEncoder().encode(fixture.literal)) });
    expect(scan.gs1).toEqual({ status: 'unknown' });
    expect(scan.decoder).toEqual({ name: 'zxing-wasm/reader', version: '3.1.2' });
    expect(scan.evidence).toEqual({ inputRoute: 'image-file', hardwareVerified: false });
    expect(observed.format).toBe(fixture.format);
    expect(observed.text).toBe(fixture.literal);
    expect(observed.bytes).toEqual(scan.bytes.status === 'observed' ? scan.bytes.value : []);
    expect(observed.bytesECI.length).toBeGreaterThan(0);
    expect(observed.symbologyIdentifier).toMatch(/^\]/);
    expect(observed.position.topLeft.x).toBeGreaterThanOrEqual(0);
    expect(network).not.toHaveBeenCalled();
  });

  it('preserves non-text raw bytes rather than encoding decoded Unicode as evidence', async () => {
    const [{ scan, decoderObservation }] = await decodeImageScan(fixtures.get('qr-binary')!);
    expect(scan.bytes).toEqual({ status: 'observed', value: [0, 29, 128, 255] });
    expect(decoderObservation.bytes).toEqual([0, 29, 128, 255]);
    expect(Array.from(new TextEncoder().encode(scan.literal))).not.toEqual(decoderObservation.bytes);
    expect(scan.gs1).toEqual({ status: 'unknown' });
  });

  it('returns every decoded symbol without automatically selecting the first', async () => {
    const evidence = await decodeImageScan(fixtures.get('multiple-qr')!);
    expect(evidence).toHaveLength(2);
    expect(evidence.map(({ scan }) => scan.literal).sort()).toEqual(['FIRST-001', 'SECOND-002']);
  });

  it.each(['blank.png', 'blank.jpg'])('separates a successfully decoded no-code %s image from failure', async (filename) => {
    const bytes = readFileSync(new URL(`./fixtures/image-scan-3.1.2/${filename}`, import.meta.url));
    await expect(decodeImageScan(new Blob([new Uint8Array(bytes)]))).resolves.toEqual([]);
  });

  it('does not call a structurally bounded but corrupt image a no-code success', async () => {
    const bytes = new Uint8Array(await fixtures.get('qr-literal')!.arrayBuffer());
    // Preserve PNG signature and dimensions but corrupt the first IDAT deflate stream.
    const view = new DataView(bytes.buffer);
    let offset = 33;
    while (view.getUint32(offset + 4) !== 0x49444154) offset += view.getUint32(offset) + 12;
    bytes[offset + 8] = 0; bytes[offset + 9] = 0;
    await expect(decodeImageScan(new Blob([bytes]))).rejects.toMatchObject({ code: 'decode-failed' });
  });
});
