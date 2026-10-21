import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { prepareZXingModule, writeBarcode } from 'zxing-wasm/writer';

import { cameraLiteral } from './cases.mjs';
export { cameraLiteral };
export function cameraY4m(symbol) {
  assert.ok(Number.isSafeInteger(symbol.width) && symbol.width > 0 && symbol.width <= 100);
  assert.ok(Number.isSafeInteger(symbol.height) && symbol.height > 0 && symbol.height <= 100);
  assert.equal(symbol.data.length, symbol.width * symbol.height);
  assert.ok([...symbol.data].every(value => value === 0 || value === 255));
  const width = 480, height = 480;
  const scale = Math.min(10, Math.floor(400 / Math.max(symbol.width, symbol.height)));
  const y = Buffer.alloc(width * height, 235);
  const left = Math.floor((width - symbol.width * scale) / 2);
  const top = Math.floor((height - symbol.height * scale) / 2);
  for (let row = 0; row < symbol.height; row++) for (let col = 0; col < symbol.width; col++) {
    if (symbol.data[row * symbol.width + col] !== 0) continue;
    for (let dy = 0; dy < scale; dy++) y.fill(16, (top + row * scale + dy) * width + left + col * scale, (top + row * scale + dy) * width + left + (col + 1) * scale);
  }
  return Buffer.concat([Buffer.from('YUV4MPEG2 W480 H480 F30:1 Ip A1:1 C420jpeg\nFRAME\n'), y, Buffer.alloc(width * height / 2, 128)]);
}
export async function generateCameraFixture(file) {
  const require = createRequire(import.meta.url);
  await prepareZXingModule({ overrides: { wasmBinary: fs.readFileSync(require.resolve('zxing-wasm/writer/zxing_writer.wasm')) }, fireImmediately: true });
  const result = await writeBarcode(cameraLiteral, { format: 'QRCode' });
  assert.equal(result.error, '');
  const bytes = cameraY4m(result.symbol);
  fs.writeFileSync(file, bytes, { flag: 'wx' });
  return { file, sha256: createHash('sha256').update(bytes).digest('hex'), literal: cameraLiteral,
    writer: 'zxing-wasm 3.1.2', format: 'YUV4MPEG2 480x480 30fps synthetic QR', physicalCamera: false };
}
