import type { ScanResultV1 } from '@pharmasaas/types';

interface ImagePoint { readonly x: number; readonly y: number }
interface ImagePosition {
  readonly topLeft: ImagePoint;
  readonly topRight: ImagePoint;
  readonly bottomRight: ImagePoint;
  readonly bottomLeft: ImagePoint;
}

/** The fields supplied by the pinned decoder, not reconstructed from its text. */
export interface ImageDecoderObservation {
  readonly isValid: boolean;
  readonly error: string;
  readonly format: string;
  readonly symbology: string;
  readonly text: string;
  readonly bytes: Uint8Array;
  readonly bytesECI: Uint8Array;
  readonly symbologyIdentifier: string;
  readonly hasECI: boolean;
  readonly contentType: string;
  readonly position: ImagePosition;
  readonly orientation: number;
  readonly isMirrored: boolean;
  readonly isInverted: boolean;
  readonly sequenceSize: number;
  readonly sequenceIndex: number;
  readonly sequenceId: string;
  readonly lineCount: number;
  readonly symbol: { readonly data: Uint8ClampedArray; readonly width: number; readonly height: number };
  readonly extra: string;
  /** Deprecated upstream fields are still observations; preserve rather than reinterpret. */
  readonly version: string;
  readonly readerInit: boolean;
  readonly ecLevel: string;
}

/** Local metadata stays outside the shared ScanResultV1 business-neutral contract. */
export interface ImageScanEvidence {
  readonly scan: ScanResultV1;
  readonly decoderObservation: {
    readonly text: string;
    readonly bytes: readonly number[];
    readonly bytesECI: readonly number[];
    readonly format: string;
    readonly symbology: string;
    readonly symbologyIdentifier: string;
    readonly hasECI: boolean;
    readonly contentType: string;
    readonly position: ImagePosition;
    readonly isValid: boolean;
    readonly error: string;
    readonly orientation: number;
    readonly isMirrored: boolean;
    readonly isInverted: boolean;
    readonly sequenceSize: number;
    readonly sequenceIndex: number;
    readonly sequenceId: string;
    readonly lineCount: number;
    readonly symbol: { readonly data: readonly number[]; readonly width: number; readonly height: number };
    readonly extra: string;
    readonly version: string;
    readonly readerInit: boolean;
    readonly ecLevel: string;
  };
}

// ZXing WASM 3.1.2 returns canonical names, not the earlier EAN-13 / UPC-A labels.
const symbologies = {
  EAN8: 'ean-8', EAN13: 'ean-13', UPCA: 'upc-a', UPCE: 'upc-e',
  Code128: 'code-128', QRCode: 'qr', DataMatrix: 'data-matrix',
} as const;

/** Pure capture: no GS1 interpretation, dispatch, URL navigation or business effects. */
export function imageScanResult(result: ImageDecoderObservation, version: string): ImageScanEvidence {
  if (!result.isValid || result.error) throw new Error('Invalid image decoder result');
  const bytes = Object.freeze(Array.from(result.bytes));
  const position = Object.freeze({
    topLeft: Object.freeze({ ...result.position.topLeft }),
    topRight: Object.freeze({ ...result.position.topRight }),
    bottomRight: Object.freeze({ ...result.position.bottomRight }),
    bottomLeft: Object.freeze({ ...result.position.bottomLeft }),
  });
  const symbology = Object.prototype.hasOwnProperty.call(symbologies, result.format)
    ? symbologies[result.format as keyof typeof symbologies] : undefined;
  return {
    scan: {
      contractVersion: 1, source: 'image', literal: result.text,
      bytes: { status: 'observed', value: bytes },
      symbology: symbology ? { status: 'observed', value: symbology } : { status: 'unknown' },
      // A modifier, GS byte, GS1-looking text or URL cannot supply boundary offsets.
      gs1: { status: 'unknown' },
      decoder: { name: 'zxing-wasm/reader', version },
      evidence: { inputRoute: 'image-file', hardwareVerified: false },
    },
    decoderObservation: {
      text: result.text, bytes, bytesECI: Object.freeze(Array.from(result.bytesECI)),
      format: result.format, symbology: result.symbology,
      symbologyIdentifier: result.symbologyIdentifier,
      hasECI: result.hasECI, contentType: result.contentType, position,
      isValid: result.isValid, error: result.error,
      orientation: result.orientation, isMirrored: result.isMirrored, isInverted: result.isInverted,
      sequenceSize: result.sequenceSize, sequenceIndex: result.sequenceIndex, sequenceId: result.sequenceId,
      lineCount: result.lineCount,
      symbol: Object.freeze({
        data: Object.freeze(Array.from(result.symbol.data)),
        width: result.symbol.width, height: result.symbol.height,
      }),
      extra: result.extra, version: result.version, readerInit: result.readerInit, ecLevel: result.ecLevel,
    },
  };
}
