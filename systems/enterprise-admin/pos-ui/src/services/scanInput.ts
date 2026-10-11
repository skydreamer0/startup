import type { ScanResultV1 } from '@pharmasaas/types';

/** Pure adapters: no dispatch, lookup, URL navigation, cart or inventory effects.
 * Version is the adapter algorithm revision, not a hardware firmware version.
 */
function captureText(literal: string, source: 'usb' | 'manual'): ScanResultV1 {
  return {
    contractVersion: 1,
    source,
    literal,
    bytes: { status: 'unknown' },
    symbology: { status: 'unknown' },
    gs1: { status: 'unknown' },
    decoder: { name: source === 'usb' ? 'keyboard-wedge-text' : 'manual-text', version: '1' },
    evidence: {
      inputRoute: source === 'usb' ? 'keyboard-wedge' : 'manual-text',
      hardwareVerified: false,
    },
  };
}

/** Input is the pre-trim keyboard buffer, not the legacy onBarcode string.
 * `usb` denotes the compatible keyboard route, not proof of physical hardware.
 */
export function captureKeyboardScan(literal: string): ScanResultV1 {
  return captureText(literal, 'usb');
}

/** Text is retained even when empty/short: validation belongs to the consumer. */
export function captureManualScan(literal: string): ScanResultV1 {
  return captureText(literal, 'manual');
}
