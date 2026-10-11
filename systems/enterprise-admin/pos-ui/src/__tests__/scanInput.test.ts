import { describe, expect, it, vi } from 'vitest';
import { captureKeyboardScan, captureManualScan } from '../services/scanInput';
import { onBarcode, onScanResult } from '../services/barcodeService';

describe('local scan input adapters', () => {
  it.each(['  001aBc  ', 'https://example.invalid/item', ']C101000123\u001d10LOT', '中文', 'e\u0301', '', '0'])('preserves literal %j without inference or dispatch', (literal) => {
    const legacy = vi.fn(); const results = vi.fn();
    const unsubscribe = onBarcode(legacy); const unsubscribeResult = onScanResult(results);
    try {
      for (const capture of [captureKeyboardScan, captureManualScan]) {
        const result = capture(literal);
        expect(result.contractVersion).toBe(1);
        expect(result.literal).toBe(literal);
        expect(result.bytes).toEqual({ status: 'unknown' });
        expect(result.symbology).toEqual({ status: 'unknown' });
        expect(result.gs1).toEqual({ status: 'unknown' });
        expect(result.evidence.hardwareVerified).toBe(false);
        expect(result.decoder.version).toBe('1');
      }
      expect(legacy).not.toHaveBeenCalled();
      expect(results).not.toHaveBeenCalled();
    } finally { unsubscribe(); unsubscribeResult(); }
  });

  it('records the acquisition route without authenticating scanner hardware', () => {
    expect(captureKeyboardScan('001')).toMatchObject({
      source: 'usb', evidence: { inputRoute: 'keyboard-wedge', hardwareVerified: false },
      decoder: { name: 'keyboard-wedge-text', version: '1' },
    });
    expect(captureManualScan('001')).toMatchObject({
      source: 'manual', evidence: { inputRoute: 'manual-text', hardwareVerified: false },
      decoder: { name: 'manual-text', version: '1' },
    });
  });
});
