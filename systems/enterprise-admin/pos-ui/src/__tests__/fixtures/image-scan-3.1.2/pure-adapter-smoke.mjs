// Dependency-free adapter smoke. Does not import or execute ZXing, Vitest or a browser.
// node --experimental-strip-types src/__tests__/fixtures/image-scan-3.1.2/pure-adapter-smoke.mjs
import assert from 'node:assert/strict';
import { imageScanResult } from '../../../services/imageScanResult.ts';

function observation(overrides = {}) {
  return {
    isValid: true, error: '', format: 'QRCode', symbology: 'QRCode',
    text: '  001aBc\r\n\u001dhttps://example.invalid/item  ',
    bytes: new Uint8Array([0, 29, 128, 255]), bytesECI: new Uint8Array([93, 81, 50, 128]),
    symbologyIdentifier: ']Q2', hasECI: true, contentType: 'Binary',
    position: { topLeft: { x: 1, y: 2 }, topRight: { x: 3, y: 2 }, bottomRight: { x: 3, y: 4 }, bottomLeft: { x: 1, y: 4 } },
    orientation: 90, isMirrored: true, isInverted: false, sequenceSize: 2, sequenceIndex: 0,
    sequenceId: '001', lineCount: 0, symbol: { data: new Uint8ClampedArray([0, 255]), width: 2, height: 1 },
    extra: '{"UPCE":"01234565"}', version: '2', readerInit: true, ecLevel: 'M',
    ...overrides,
  };
}

let checks = 0;
for (const [format, symbology] of Object.entries({ EAN8: 'ean-8', EAN13: 'ean-13', UPCA: 'upc-a', UPCE: 'upc-e', Code128: 'code-128', QRCode: 'qr', DataMatrix: 'data-matrix' })) {
  const result = imageScanResult(observation({ format }), '3.1.2');
  assert.deepEqual(result.scan.symbology, { status: 'observed', value: symbology });
  assert.equal(result.decoderObservation.format, format); checks++;
}
for (const text of ['', '0', '  001aBc  ', 'https://unknown.invalid/item', 'javascript:alert(1)', 'e\u0301中文', '\u0000\u001d\r\n']) {
  const result = imageScanResult(observation({ text }), '3.1.2');
  assert.equal(result.scan.literal, text);
  assert.deepEqual(result.scan.gs1, { status: 'unknown' });
  assert.deepEqual(result.scan.bytes, { status: 'observed', value: [0, 29, 128, 255] }); checks++;
}
const raw = observation(); const captured = imageScanResult(raw, '3.1.2');
assert.deepEqual(Object.keys(captured.decoderObservation).sort(), Object.keys(raw).sort());
for (const key of Object.keys(raw)) {
  const expected = key === 'bytes' || key === 'bytesECI' ? Array.from(raw[key])
    : key === 'symbol' ? { ...raw.symbol, data: Array.from(raw.symbol.data) } : raw[key];
  assert.deepEqual(captured.decoderObservation[key], expected);
}
checks++;
raw.bytes[0] = 254; raw.bytesECI[0] = 254; raw.symbol.data[0] = 254; raw.position.topLeft.x = 999;
assert.deepEqual(captured.decoderObservation.bytes, [0, 29, 128, 255]);
assert.deepEqual(captured.decoderObservation.bytesECI, [93, 81, 50, 128]);
assert.deepEqual(captured.decoderObservation.symbol.data, [0, 255]);
assert.equal(captured.decoderObservation.position.topLeft.x, 1);
assert.ok(Object.isFrozen(captured.decoderObservation.bytes)); checks++;
assert.deepEqual(imageScanResult(observation({ format: 'unknown-future' }), '3.1.2').scan.symbology, { status: 'unknown' }); checks++;
assert.throws(() => imageScanResult(observation({ isValid: false }), '3.1.2')); checks++;
assert.throws(() => imageScanResult(observation({ error: 'checksum' }), '3.1.2')); checks++;
console.log(JSON.stringify({
  scope: 'Dependency-free pure imageScanResult adapter smoke only', node: process.version,
  result: 'PASS', checks, wasmExecuted: false, vitestExecuted: false, typesChecked: false,
  browserExecuted: false, sameEngineBarcodeFixturesExecuted: false,
}, null, 2));
