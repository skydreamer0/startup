import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { deflateSync } from 'node:zlib';
import {
  prepareZXingModule, writeBarcode, ZXING_WASM_VERSION,
  type WriteInputBarcodeFormat,
} from 'zxing-wasm/writer';

const require = createRequire(import.meta.url);

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type), data]);
  let crc = 0xffffffff;
  for (const byte of body) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  const size = Buffer.alloc(4); size.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([size, body, checksum]);
}

/** Minimal lossless PNG encoder for synthetic grayscale test pixels; no external images. */
function grayscalePng(width: number, height: number, pixels: Uint8Array): Blob {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8;
  const rows = Buffer.alloc((width + 1) * height);
  for (let row = 0; row < height; row++) {
    rows.set(pixels.subarray(row * width, (row + 1) * width), row * (width + 1) + 1);
  }
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0)),
  ]);
  return new Blob([new Uint8Array(png)], { type: 'image/png' });
}

export const fixtureInputs = [
  { name: 'qr-literal', format: 'QRCode', literal: '  001aBc\r\n\u001dhttps://example.invalid/item  ', expectedSymbology: 'qr' },
  { name: 'ean13', format: 'EAN13', literal: '4006381333931', expectedSymbology: 'ean-13' },
  { name: 'ean8', format: 'EAN8', literal: '96385074', expectedSymbology: 'ean-8' },
  { name: 'upca', format: 'UPCA', literal: '012345678905', expectedSymbology: 'upc-a' },
  { name: 'code128', format: 'Code128', literal: '001aBc-LOT42', expectedSymbology: 'code-128' },
  { name: 'data-matrix', format: 'DataMatrix', literal: ']C101000123\u001d10LOT', expectedSymbology: 'data-matrix' },
] as const;

/** Same-engine generated fixtures prove the local PNG pipeline, not independent conformance. */
export async function createImageScanFixtures(): Promise<Map<string, Blob>> {
  if (ZXING_WASM_VERSION !== '3.1.2') throw new Error('Fixture writer version drift');
  await prepareZXingModule({
    overrides: { wasmBinary: readFileSync(require.resolve('zxing-wasm/writer/zxing_writer.wasm')) },
    fireImmediately: true,
  });
  const fixtures = new Map<string, Blob>();
  async function write(input: string | Uint8Array, format: WriteInputBarcodeFormat) {
    const result = await writeBarcode(input, { format, scale: 4, addQuietZones: true, addHRT: false });
    if (result.error || !result.image) throw new Error(`Synthetic fixture generation failed: ${result.error}`);
    return result;
  }
  for (const fixture of fixtureInputs) {
    const result = await write(fixture.literal, fixture.format);
    fixtures.set(fixture.name, result.image!);
  }
  const binary = await write(new Uint8Array([0, 29, 128, 255]), 'QRCode');
  fixtures.set('qr-binary', binary.image!);

  // Compose two distinct symbols in one PNG; neither reader result is preselected.
  const first = await write('FIRST-001', 'QRCode');
  const second = await write('SECOND-002', 'QRCode');
  const scale = 5; const margin = 50;
  const width = (first.symbol.width + second.symbol.width) * scale + 3 * margin;
  const height = Math.max(first.symbol.height, second.symbol.height) * scale + 2 * margin;
  const pixels = new Uint8Array(width * height).fill(255);
  let left = margin;
  for (const { symbol } of [first, second]) {
    for (let y = 0; y < symbol.height * scale; y++) {
      for (let x = 0; x < symbol.width * scale; x++) {
        pixels[(y + margin) * width + x + left] = symbol.data[Math.floor(y / scale) * symbol.width + Math.floor(x / scale)];
      }
    }
    left += symbol.width * scale + margin;
  }
  fixtures.set('multiple-qr', grayscalePng(width, height, pixels));
  return fixtures;
}
