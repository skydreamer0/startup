/// <reference types="vite/client" />
import { imageScanResult, type ImageScanEvidence } from './imageScanResult';

export type { ImageScanEvidence } from './imageScanResult';

export const MAX_IMAGE_SCAN_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_SCAN_PIXELS = 16_000_000;
export const IMAGE_SCAN_DECODER_VERSION = '3.1.2';

export type ImageScanErrorCode =
  | 'empty-image' | 'image-too-large' | 'invalid-image'
  | 'decoder-unavailable' | 'decode-failed' | 'cancelled';

export class ImageScanError extends Error {
  constructor(readonly code: ImageScanErrorCode) {
    super(code);
    this.name = 'ImageScanError';
  }
}

type Reader = typeof import('zxing-wasm/reader');
let initialization: Promise<Reader> | undefined;

/** One concurrent initialization attempt; only its failure clears the cached attempt. */
function getReader(): Promise<Reader> {
  if (initialization) return initialization;
  const attempt = (async () => {
    const [reader, asset] = await Promise.all([
      import('zxing-wasm/reader'),
      import('zxing-wasm/reader/zxing_reader.wasm?url'),
    ]);
    if (reader.ZXING_WASM_VERSION !== IMAGE_SCAN_DECODER_VERSION) {
      throw new ImageScanError('decoder-unavailable');
    }
    try {
      await reader.prepareZXingModule({
        overrides: {
          // Vite packages this exact installed WASM file. Never fall back to a CDN.
          locateFile(path) {
            if (path === 'zxing_reader.wasm') return asset.default;
            throw new Error('Unexpected decoder asset');
          },
        },
        fireImmediately: true,
      });
    } catch {
      // The upstream module also caches rejected promises: clear that cache for retry.
      reader.purgeZXingModule();
      throw new ImageScanError('decoder-unavailable');
    }
    return reader;
  })().catch(() => { throw new ImageScanError('decoder-unavailable'); });
  initialization = attempt;
  void attempt.catch(() => {
    if (initialization === attempt) initialization = undefined;
  });
  return attempt;
}

function invalidImage(): never { throw new ImageScanError('invalid-image'); }

function checkDimensions(width: number, height: number): void {
  if (width === 0 || height === 0) invalidImage();
  if (width * height > MAX_IMAGE_SCAN_PIXELS) throw new ImageScanError('image-too-large');
}

/** Inspect only bounded compressed bytes, before any image decoder allocates pixels.
 * This slice deliberately accepts PNG and JPEG only, independent of file extension/MIME.
 */
function checkImageHeader(bytes: Uint8Array): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (pngSignature.every((value, index) => bytes[index] === value)) {
    if (bytes.length < 33 || view.getUint32(8) !== 13
      || view.getUint32(12) !== 0x49484452) invalidImage(); // IHDR
    checkDimensions(view.getUint32(16), view.getUint32(20));
    // Reject duplicate headers, truncated chunks and missing image/end chunks.
    let offset = 33; let hasPixels = false;
    while (offset + 12 <= bytes.length) {
      const length = view.getUint32(offset);
      const type = view.getUint32(offset + 4);
      if (length > bytes.length - offset - 12 || type === 0x49484452) invalidImage();
      if (type === 0x49444154 && length > 0) hasPixels = true; // IDAT
      offset += length + 12;
      if (type === 0x49454e44) { // IEND
        if (length !== 0 || !hasPixels || offset !== bytes.length) invalidImage();
        return;
      }
    }
    invalidImage();
  }

  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) invalidImage();
  let offset = 2; let hasDimensions = false;
  while (offset < bytes.length) {
    if (bytes[offset++] !== 0xff) invalidImage();
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === undefined || marker === 0 || marker === 0xd8 || marker === 0xd9
      || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)
      || offset + 2 > bytes.length) invalidImage();
    const length = view.getUint16(offset);
    if (length < 2 || length > bytes.length - offset) invalidImage();
    const isFrame = marker >= 0xc0 && marker <= 0xcf
      && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrame) {
      // Baseline, extended-sequential and progressive JPEG supported by this decoder.
      if (![0xc0, 0xc1, 0xc2].includes(marker) || hasDimensions || length < 8) invalidImage();
      checkDimensions(view.getUint16(offset + 5), view.getUint16(offset + 3));
      hasDimensions = true;
    }
    if (marker === 0xda) { // SOS: dimensions precede entropy-coded pixel data.
      if (!hasDimensions || offset + length >= bytes.length) invalidImage();
      return;
    }
    offset += length;
  }
  invalidImage();
}

/** Local-only, read-only acquisition. [] is a successfully decoded image with no code.
 * No first-symbol selection, text rewriting, barcode dispatch, storage or network upload.
 */
async function decodeActiveImage(input: Blob, signal?: AbortSignal): Promise<readonly ImageScanEvidence[]> {
  checkCancellation(signal);
  if (input.size === 0) throw new ImageScanError('empty-image');
  if (input.size > MAX_IMAGE_SCAN_BYTES) throw new ImageScanError('image-too-large');
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await input.arrayBuffer());
  } catch {
    throw new ImageScanError('invalid-image');
  }
  checkCancellation(signal);
  if (bytes.byteLength !== input.size) invalidImage();
  checkImageHeader(bytes);
  const reader = await getReader();
  checkCancellation(signal);
  try {
    const results = await reader.readBarcodes(bytes, {
      formats: ['QRCode', 'EAN8', 'EAN13', 'UPCA', 'UPCE', 'Code128', 'DataMatrix'],
      textMode: 'Plain', returnErrors: true, maxNumberOfSymbols: 255,
    });
    // Invalid decodes are errors, not evidence or a misleading no-code success.
    if (results.some((result) => !result.isValid || result.error)) {
      throw new ImageScanError('decode-failed');
    }
    return results.map((result) => imageScanResult(result, IMAGE_SCAN_DECODER_VERSION));
  } catch {
    throw new ImageScanError('decode-failed');
  }
}


function checkCancellation(signal?: AbortSignal): void {
  if (signal?.aborted) throw new ImageScanError('cancelled');
}

type ScanJob = {
  input: Blob;
  signal?: AbortSignal;
  resolve: (results: readonly ImageScanEvidence[]) => void;
  reject: (error: unknown) => void;
  cancel: () => void;
  detach: () => void;
};
let activeJob: ScanJob | undefined;
let latestJob: ScanJob | undefined;

/** Hold the slot until the underlying read really settles, even after cancellation.
 * The reader has no interrupt API: cancellation suppresses results and prevents later
 * stages/queued work; it cannot preempt an already executing WASM call.
 */
async function runJob(job: ScanJob): Promise<void> {
  activeJob = job;
  try {
    const results = await decodeActiveImage(job.input, job.signal);
    checkCancellation(job.signal);
    job.resolve(results);
  } catch (error) {
    job.reject(error);
  } finally {
    job.detach();
    activeJob = undefined;
    const next = latestJob;
    latestJob = undefined;
    if (next) void runJob(next);
  }
}

/** Module-wide bound: one active byte-read/decode and one latest pending Blob.
 * Replacing a pending request rejects it as cancelled before reading its bytes.
 * Callers should abort their request on reselection and disposal.
 */
export async function decodeImageScan(input: Blob, signal?: AbortSignal): Promise<readonly ImageScanEvidence[]> {
  checkCancellation(signal);
  if (input.size === 0) throw new ImageScanError('empty-image');
  if (input.size > MAX_IMAGE_SCAN_BYTES) throw new ImageScanError('image-too-large');
  return new Promise((resolve, reject) => {
    const job: ScanJob = {
      input, signal, resolve, reject,
      cancel: () => {
        if (latestJob === job) latestJob = undefined;
        job.detach();
        reject(new ImageScanError('cancelled'));
      },
      detach: () => signal?.removeEventListener('abort', job.cancel),
    };
    signal?.addEventListener('abort', job.cancel, { once: true });
    if (activeJob) {
      latestJob?.cancel();
      latestJob = job;
    } else {
      void runJob(job);
    }
  });
}
