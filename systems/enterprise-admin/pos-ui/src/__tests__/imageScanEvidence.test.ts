import { describe, expect, it } from 'vitest';
import { imageScanResult, type ImageDecoderObservation } from '../services/imageScanResult';

function observation(overrides: Partial<ImageDecoderObservation> = {}): ImageDecoderObservation {
  return {
    isValid: true, error: '', format: 'QRCode', symbology: 'QRCode',
    text: '  001aBc\r\n\u001dhttps://example.invalid/item  ',
    bytes: new Uint8Array([0, 29, 128, 255]), bytesECI: new Uint8Array([93, 81, 50, 128]),
    symbologyIdentifier: ']Q2', hasECI: true, contentType: 'Binary',
    orientation: 90, isMirrored: true, isInverted: false,
    sequenceSize: 2, sequenceIndex: 0, sequenceId: '123', lineCount: 0,
    symbol: { data: new Uint8ClampedArray([0, 255]), width: 2, height: 1 },
    extra: '{"ReaderInit":true,"UPCE":"01234565"}', version: '2', readerInit: true, ecLevel: 'M',
    position: {
      topLeft: { x: 1, y: 2 }, topRight: { x: 3, y: 2 },
      bottomRight: { x: 3, y: 4 }, bottomLeft: { x: 1, y: 4 },
    },
    ...overrides,
  };
}

describe('image scan evidence, independent from business effects', () => {
  it('retains literal and decoder bytes separately without synthesizing bytes or inferring GS1', () => {
    const raw = observation();
    const evidence = imageScanResult(raw, '3.1.2');
    expect(evidence.scan).toEqual({
      contractVersion: 1, source: 'image', literal: raw.text,
      bytes: { status: 'observed', value: [0, 29, 128, 255] },
      symbology: { status: 'observed', value: 'qr' }, gs1: { status: 'unknown' },
      decoder: { name: 'zxing-wasm/reader', version: '3.1.2' },
      evidence: { inputRoute: 'image-file', hardwareVerified: false },
    });
    expect(evidence.decoderObservation).toEqual({
      text: raw.text, bytes: [0, 29, 128, 255], bytesECI: [93, 81, 50, 128],
      format: 'QRCode', symbology: 'QRCode', symbologyIdentifier: ']Q2',
      hasECI: true, contentType: 'Binary', position: raw.position,
      isValid: true, error: '', orientation: 90, isMirrored: true, isInverted: false,
      sequenceSize: 2, sequenceIndex: 0, sequenceId: '123', lineCount: 0,
      symbol: { data: [0, 255], width: 2, height: 1 },
      extra: '{"ReaderInit":true,"UPCE":"01234565"}', version: '2', readerInit: true, ecLevel: 'M',
    });
  });

  it.each([
    ['EAN8', 'ean-8'], ['EAN13', 'ean-13'], ['UPCA', 'upc-a'], ['UPCE', 'upc-e'],
    ['Code128', 'code-128'], ['QRCode', 'qr'], ['DataMatrix', 'data-matrix'],
  ])('maps canonical 3.1.2 format %s without changing its raw label', (format, expected) => {
    const evidence = imageScanResult(observation({ format }), '3.1.2');
    expect(evidence.scan.symbology).toEqual({ status: 'observed', value: expected });
    expect(evidence.decoderObservation.format).toBe(format);
  });

  it('preserves an unfamiliar format as raw metadata with unknown contract symbology', () => {
    const evidence = imageScanResult(observation({ format: 'future-format' }), '3.1.2');
    expect(evidence.scan.symbology).toEqual({ status: 'unknown' });
    expect(evidence.decoderObservation.format).toBe('future-format');
  });

  it('copies decoder arrays and positions before the next read can mutate them', () => {
    const raw = observation();
    const evidence = imageScanResult(raw, '3.1.2');
    raw.bytes[0] = 254; raw.bytesECI[0] = 254;
    raw.symbol.data[0] = 254;
    Object.assign(raw.position.topLeft, { x: 999 });
    expect(evidence.scan.bytes).toEqual({ status: 'observed', value: [0, 29, 128, 255] });
    expect(evidence.decoderObservation.bytesECI).toEqual([93, 81, 50, 128]);
    expect(evidence.decoderObservation.position.topLeft.x).toBe(1);
    expect(Object.isFrozen(evidence.decoderObservation.bytes)).toBe(true);
    expect(Object.isFrozen(evidence.decoderObservation.position.topLeft)).toBe(true);
    expect(evidence.decoderObservation.symbol.data).toEqual([0, 255]);
    expect(Object.isFrozen(evidence.decoderObservation.symbol.data)).toBe(true);
  });

  it.each([{ isValid: false }, { error: 'checksum error' }])('rejects decoder error %j', (overrides) => {
    expect(() => imageScanResult(observation(overrides), '3.1.2')).toThrow('Invalid image decoder result');
  });

  it('retains unknown URLs, whitespace, Unicode and controls strictly as strings', () => {
    for (const text of [' https://unknown.invalid/path?a=001 ', 'javascript:alert(1)', 'e\u0301中文', '\u0000\u001d\r\n']) {
      expect(imageScanResult(observation({ text }), '3.1.2').scan.literal).toBe(text);
    }
  });

  it('preserves unknown structured-append size and opaque metadata without interpretation', () => {
    const raw = observation({ sequenceSize: 0, sequenceIndex: 7, sequenceId: '000X', extra: 'not JSON\u0000' });
    const { scan, decoderObservation } = imageScanResult(raw, '3.1.2');
    expect(decoderObservation).toMatchObject({ sequenceSize: 0, sequenceIndex: 7, sequenceId: '000X', extra: 'not JSON\u0000' });
    expect(scan.gs1).toEqual({ status: 'unknown' });
    expect(scan.literal).toBe(raw.text);
  });
});
