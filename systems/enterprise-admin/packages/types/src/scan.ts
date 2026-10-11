/** Local capture evidence only: never a product match or business command. */
export type ScanSource = 'usb' | 'camera' | 'image' | 'manual';

export type ScanObservation<T> =
  | { readonly status: 'unknown' }
  | { readonly status: 'observed'; readonly value: T };

/** Version 1 is additive to the existing POS string scanner contract. */
export interface ScanResultV1 {
  readonly contractVersion: 1;
  readonly source: ScanSource;
  /** Exactly the text received by the adapter, before trim/case/Unicode normalization.
   * It is not necessarily the original symbol text or original encoded bytes.
   */
  readonly literal: string;
  /** Original decoder bytes only; never synthesized by encoding literal text. */
  readonly bytes: ScanObservation<readonly number[]>;
  readonly symbology: ScanObservation<'ean-8' | 'ean-13' | 'upc-a' | 'upc-e' | 'code-128' | 'qr' | 'data-matrix'>;
  /** Decoder-confirmed GS1 boundaries, not inferred from text or ASCII 29 alone.
   * Offsets, when available, are UTF-16 offsets in literal.
   */
  readonly gs1: ScanObservation<{ readonly separatorOffsets: readonly number[] }>;
  readonly decoder: { readonly name: string; readonly version: string };
  /** Describes the input route. Keyboard events cannot authenticate USB hardware. */
  readonly evidence: {
    readonly inputRoute: 'keyboard-wedge' | 'manual-text' | 'camera-frame' | 'image-file';
    readonly hardwareVerified: false;
  };
}
