// @vitest-environment node
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const engine = vi.hoisted(() => ({ prepare: vi.fn(), read: vi.fn(), purge: vi.fn() }));
vi.mock('zxing-wasm/reader', () => ({
  ZXING_WASM_VERSION: '3.1.2', prepareZXingModule: engine.prepare,
  readBarcodes: engine.read, purgeZXingModule: engine.purge,
}));
vi.mock('zxing-wasm/reader/zxing_reader.wasm?url', () => ({ default: '/assets/owned-reader.wasm' }));

const png = readFileSync(new URL('./fixtures/image-scan-3.1.2/blank.png', import.meta.url));
const jpeg = readFileSync(new URL('./fixtures/image-scan-3.1.2/blank.jpg', import.meta.url));
let service: typeof import('../services/imageScanDecoder');
beforeEach(async () => {
  vi.resetModules();
  engine.prepare.mockReset().mockResolvedValue({});
  engine.read.mockReset().mockResolvedValue([]);
  engine.purge.mockReset();
  service = await import('../services/imageScanDecoder');
});

function blob(bytes: Uint8Array = png): Blob { return new Blob([new Uint8Array(bytes)]); }
function pngDimensions(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(png);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width); view.setUint32(20, height);
  return bytes;
}

describe('image input bounds before any pixel allocation (mock engine)', () => {
  it('distinguishes empty files from no-code images without loading the engine', async () => {
    await expect(service.decodeImageScan(blob(new Uint8Array()))).rejects.toMatchObject({ code: 'empty-image' });
    expect(engine.prepare).not.toHaveBeenCalled();
    expect(engine.read).not.toHaveBeenCalled();
  });

  it('rejects compressed oversize before reading file bytes or initializing the engine', async () => {
    const arrayBuffer = vi.fn();
    const input = { size: service.MAX_IMAGE_SCAN_BYTES + 1, arrayBuffer } as unknown as Blob;
    await expect(service.decodeImageScan(input)).rejects.toMatchObject({ code: 'image-too-large' });
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(engine.prepare).not.toHaveBeenCalled();
  });

  it.each([[16_000_001, 1], [4001, 4000], [0xffffffff, 0xffffffff]])(
    'rejects %s × %s PNG dimensions before engine allocation', async (width, height) => {
      await expect(service.decodeImageScan(blob(pngDimensions(width, height))))
        .rejects.toMatchObject({ code: 'image-too-large' });
      expect(engine.prepare).not.toHaveBeenCalled();
      expect(engine.read).not.toHaveBeenCalled();
    },
  );

  it.each([[0, 1], [1, 0]])('rejects zero PNG dimensions %s × %s', async (width, height) => {
    await expect(service.decodeImageScan(blob(pngDimensions(width, height))))
      .rejects.toMatchObject({ code: 'invalid-image' });
    expect(engine.read).not.toHaveBeenCalled();
  });

  it('rejects oversized JPEG dimensions before engine allocation', async () => {
    const bytes = new Uint8Array(jpeg);
    const frame = bytes.findIndex((value, i) => value === 0xff && bytes[i + 1] === 0xc0);
    expect(frame).toBeGreaterThan(0);
    const view = new DataView(bytes.buffer);
    view.setUint16(frame + 5, 65535); view.setUint16(frame + 7, 65535);
    await expect(service.decodeImageScan(blob(bytes))).rejects.toMatchObject({ code: 'image-too-large' });
    expect(engine.read).not.toHaveBeenCalled();
    expect(engine.prepare).not.toHaveBeenCalled();
  });

  it.each([
    ['SVG', new TextEncoder().encode('<svg width="1" height="1"/>')],
    ['GIF', new TextEncoder().encode('GIF89a')],
    ['false MIME', new Uint8Array([1, 2, 3])],
    ['truncated PNG', png.subarray(0, 25)],
    ['missing PNG end', png.subarray(0, png.length - 12)],
    ['truncated JPEG segment', new Uint8Array([255, 216, 255, 224, 255, 255])],
  ])('rejects %s without trusting the file MIME or allocating pixels', async (_name, bytes) => {
    await expect(service.decodeImageScan(new Blob([new Uint8Array(bytes)], { type: 'image/png' })))
      .rejects.toMatchObject({ code: 'invalid-image' });
    expect(engine.prepare).not.toHaveBeenCalled();
    expect(engine.read).not.toHaveBeenCalled();
  });

  it('classifies an unreadable file as invalid-image', async () => {
    const input = { size: 10, arrayBuffer: () => Promise.reject(new Error('disk')) } as unknown as Blob;
    await expect(service.decodeImageScan(input)).rejects.toMatchObject({ code: 'invalid-image' });
    expect(engine.prepare).not.toHaveBeenCalled();
  });
});

describe('local decoder initialization and result states (mock engine)', () => {
  it.each([['PNG', png], ['JPEG', jpeg]])('uses bounded %s bytes and explicit literal/multiple-code options', async (_name, bytes) => {
    await expect(service.decodeImageScan(blob(bytes))).resolves.toEqual([]);
    expect(engine.read).toHaveBeenCalledWith(new Uint8Array(bytes), {
      formats: ['QRCode', 'EAN8', 'EAN13', 'UPCA', 'UPCE', 'Code128', 'DataMatrix'],
      textMode: 'Plain', returnErrors: true, maxNumberOfSymbols: 255,
    });
    const options = engine.prepare.mock.calls[0][0];
    expect(options.fireImmediately).toBe(true);
    expect(options.overrides.locateFile('zxing_reader.wasm')).toBe('/assets/owned-reader.wasm');
    expect(() => options.overrides.locateFile('unexpected.wasm')).toThrow('Unexpected decoder asset');
  });

  it('reuses successful initialization when a queued request is admitted', async () => {
    let resolve!: (value: object) => void;
    engine.prepare.mockImplementationOnce(() => new Promise((yes) => { resolve = yes; }));
    const requests = Promise.all([service.decodeImageScan(blob()), service.decodeImageScan(blob())]);
    await vi.waitFor(() => expect(engine.prepare).toHaveBeenCalledTimes(1));
    expect(engine.read).not.toHaveBeenCalled();
    resolve({});
    await expect(requests).resolves.toEqual([[], []]);
    expect(engine.read).toHaveBeenCalledTimes(2);
    expect(engine.prepare).toHaveBeenCalledTimes(1);
  });

  it('reports active initialization failure and retries only the latest queued request after release', async () => {
    let reject!: (error: Error) => void;
    engine.prepare.mockImplementationOnce(() => new Promise((_yes, no) => { reject = no; }));
    const first = service.decodeImageScan(blob());
    const droppedRead = vi.fn(async () => new Uint8Array(png).buffer);
    const latestRead = vi.fn(async () => new Uint8Array(png).buffer);
    const dropped = service.decodeImageScan({ size: png.length, arrayBuffer: droppedRead } as unknown as Blob);
    const latest = service.decodeImageScan({ size: png.length, arrayBuffer: latestRead } as unknown as Blob);
    // Attach handlers before rejecting or replacing work: cancelled is a real error.
    const requests = Promise.allSettled([first, dropped, latest]);
    await vi.waitFor(() => expect(engine.prepare).toHaveBeenCalledTimes(1));
    expect(droppedRead).not.toHaveBeenCalled();
    expect(latestRead).not.toHaveBeenCalled();
    expect(engine.read).not.toHaveBeenCalled();
    reject(new Error('WASM unavailable'));
    expect(await requests).toEqual([
      { status: 'rejected', reason: expect.objectContaining({ code: 'decoder-unavailable' }) },
      { status: 'rejected', reason: expect.objectContaining({ code: 'cancelled' }) },
      { status: 'fulfilled', value: [] },
    ]);
    expect(droppedRead).not.toHaveBeenCalled();
    expect(latestRead).toHaveBeenCalledOnce();
    expect(engine.purge).toHaveBeenCalledTimes(1);
    expect(engine.prepare).toHaveBeenCalledTimes(2);
    expect(engine.read).toHaveBeenCalledTimes(1);
    // The recovered reader stays cached for a subsequent independent request.
    await expect(service.decodeImageScan(blob())).resolves.toEqual([]);
    expect(engine.prepare).toHaveBeenCalledTimes(2);
    expect(engine.purge).toHaveBeenCalledTimes(1);
    expect(engine.read).toHaveBeenCalledTimes(2);
  });

  it('settles continued initialization failures without an automatic retry loop, then releases the slot', async () => {
    let reject!: (error: Error) => void;
    engine.prepare.mockRejectedValue(new Error('still unavailable'))
      .mockImplementationOnce(() => new Promise((_yes, no) => { reject = no; }));
    const requests = Promise.allSettled([service.decodeImageScan(blob()), service.decodeImageScan(blob())]);
    await vi.waitFor(() => expect(engine.prepare).toHaveBeenCalledTimes(1));
    expect(engine.read).not.toHaveBeenCalled();
    reject(new Error('first failure'));
    expect(await requests).toEqual([
      { status: 'rejected', reason: expect.objectContaining({ code: 'decoder-unavailable' }) },
      { status: 'rejected', reason: expect.objectContaining({ code: 'decoder-unavailable' }) },
    ]);
    // Neither failed input is retried: exactly one attempt for each admitted job.
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(engine.prepare).toHaveBeenCalledTimes(2);
    expect(engine.purge).toHaveBeenCalledTimes(2);
    expect(engine.read).not.toHaveBeenCalled();
    engine.prepare.mockResolvedValue({});
    await expect(service.decodeImageScan(blob())).resolves.toEqual([]);
    expect(engine.prepare).toHaveBeenCalledTimes(3);
    expect(engine.purge).toHaveBeenCalledTimes(2);
    expect(engine.read).toHaveBeenCalledTimes(1);
  });

  it('keeps decoder errors distinct from no-code success and supports a subsequent read', async () => {
    engine.read.mockRejectedValueOnce(new Error('engine')).mockResolvedValueOnce([{ isValid: false, error: 'checksum' }]);
    await expect(service.decodeImageScan(blob())).rejects.toMatchObject({ code: 'decode-failed' });
    await expect(service.decodeImageScan(blob())).rejects.toMatchObject({ code: 'decode-failed' });
    await expect(service.decodeImageScan(blob())).resolves.toEqual([]);
  });
});

describe('bounded latest-request admission (mock engine, not WASM performance)', () => {
  it('retains only one active and the latest waiting input without reading dropped files', async () => {
    const releases: Array<() => void> = [];
    engine.read.mockImplementation(() => new Promise(yes => { releases.push(() => yes([])); }));
    const inputs = Array.from({ length: 25 }, () => ({
      size: png.length, arrayBuffer: vi.fn(async () => new Uint8Array(png).buffer),
    }));
    const settled = inputs.map(input => service.decodeImageScan(input as unknown as Blob)
      .then(value => ({ value }), error => ({ error: error.code })));
    await vi.waitFor(() => expect(engine.read).toHaveBeenCalledTimes(1));
    expect(inputs.slice(1).every(input => input.arrayBuffer.mock.calls.length === 0)).toBe(true);
    releases.shift()!();
    await vi.waitFor(() => expect(engine.read).toHaveBeenCalledTimes(2));
    expect(inputs[24].arrayBuffer).toHaveBeenCalledOnce();
    expect(inputs.slice(1, 24).every(input => input.arrayBuffer.mock.calls.length === 0)).toBe(true);
    releases.shift()!();
    const results = await Promise.all(settled);
    expect(results.filter(result => 'error' in result && result.error === 'cancelled')).toHaveLength(23);
    expect(results.filter(result => 'value' in result)).toHaveLength(2);
  });

  it('abort suppresses active results without freeing the slot and removes queued work', async () => {
    const releases: Array<() => void> = [];
    engine.read.mockImplementation(() => new Promise(yes => { releases.push(() => yes([])); }));
    const active = new AbortController();
    const first = service.decodeImageScan(blob(), active.signal).catch(error => error.code);
    await vi.waitFor(() => expect(engine.read).toHaveBeenCalledTimes(1));
    active.abort();
    expect(await first).toBe('cancelled');
    const waiting = new AbortController();
    const read = vi.fn(async () => new Uint8Array(png).buffer);
    const queued = service.decodeImageScan({ size: png.length, arrayBuffer: read } as unknown as Blob, waiting.signal)
      .catch(error => error.code);
    waiting.abort();
    expect(await queued).toBe('cancelled');
    const next = service.decodeImageScan(blob());
    expect(engine.read).toHaveBeenCalledTimes(1);
    releases.shift()!();
    await vi.waitFor(() => expect(engine.read).toHaveBeenCalledTimes(2));
    expect(read).not.toHaveBeenCalled();
    releases.shift()!();
    await expect(next).resolves.toEqual([]);
  });
});
