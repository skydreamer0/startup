import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onBarcode, startBarcodeListener, stopBarcodeListener } from '../services/barcodeService';

function press(key: string) {
  document.dispatchEvent(new KeyboardEvent('keydown', { key }));
}

describe('barcodeService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-17T12:00:00.000Z'));
  });

  afterEach(() => {
    stopBarcodeListener();
    vi.useRealTimers();
  });

  it('emits a barcode when rapid characters are followed by Enter', () => {
    const listener = vi.fn();
    const unsubscribe = onBarcode(listener);
    startBarcodeListener();

    press('A');
    vi.advanceTimersByTime(20);
    press('B');
    vi.advanceTimersByTime(20);
    press('C');
    press('Enter');

    expect(listener).toHaveBeenCalledWith('ABC');
    unsubscribe();
  });

  it('ignores codes shorter than three characters', () => {
    const listener = vi.fn();
    const unsubscribe = onBarcode(listener);
    startBarcodeListener();

    press('A');
    press('B');
    press('Enter');

    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('resets the buffer after a long gap between keys', () => {
    const listener = vi.fn();
    const unsubscribe = onBarcode(listener);
    startBarcodeListener();

    press('A');
    press('B');
    vi.advanceTimersByTime(301);
    press('C');
    press('D');
    press('E');
    press('Enter');

    expect(listener).toHaveBeenCalledWith('CDE');
    unsubscribe();
  });

  it('stops listening after stopBarcodeListener is called', () => {
    const listener = vi.fn();
    const unsubscribe = onBarcode(listener);
    startBarcodeListener();
    stopBarcodeListener();

    press('A');
    press('B');
    press('C');
    press('Enter');

    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('does not call an unsubscribed listener', () => {
    const listener = vi.fn();
    const unsubscribe = onBarcode(listener);
    startBarcodeListener();
    unsubscribe();

    press('A');
    press('B');
    press('C');
    press('Enter');

    expect(listener).not.toHaveBeenCalled();
  });
});
