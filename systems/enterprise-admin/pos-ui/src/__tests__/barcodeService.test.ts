import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  onBarcode, onBarcodeSequence, getBarcodeInputSequence, startBarcodeListener, stopBarcodeListener,
} from '../services/barcodeService';

function press(key: string) {
  document.dispatchEvent(new KeyboardEvent('keydown', { key }));
}

describe('barcodeService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-17T12:00:00.000Z'));
    startBarcodeListener();
    press('Enter');
    stopBarcodeListener();
  });

  afterEach(() => {
    stopBarcodeListener();
    vi.useRealTimers();
  });

  it.each(['button', 'a', 'select', 'textarea', 'contenteditable', 'role-button'])('leaves Enter/Space activation to %s without starting a scanner sequence', (kind) => {
    const target = document.createElement(kind === 'contenteditable' || kind === 'role-button' ? 'div' : kind);
    if (kind === 'a') target.setAttribute('href', '#');
    if (kind === 'contenteditable') target.setAttribute('contenteditable', 'true');
    if (kind === 'role-button') target.setAttribute('role', 'button');
    document.body.append(target);
    const events = vi.fn(); const listener = vi.fn();
    const unsequence = onBarcodeSequence(events); const unsubscribe = onBarcode(listener);
    startBarcodeListener();
    for (const key of [' ', 'Enter']) {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      target.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }
    expect(events).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
    unsequence(); unsubscribe(); target.remove();
  });

  it('marks a completed scan Enter consumed before window shortcuts', () => {
    const listener = vi.fn(); const unsubscribe = onBarcode(listener);
    const shortcut = vi.fn((event: KeyboardEvent) => { expect(event.defaultPrevented).toBe(true); });
    startBarcodeListener();
    press('A'); press('B'); press('C');
    window.addEventListener('keydown', shortcut);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(listener).toHaveBeenCalledWith('ABC');
    expect(shortcut).toHaveBeenCalledOnce();
    window.removeEventListener('keydown', shortcut); unsubscribe();
  });

  it('cannot splice an unfinished scan through a native control activation', () => {
    const target = document.createElement('button'); document.body.append(target);
    const listener = vi.fn(); const unsubscribe = onBarcode(listener);
    startBarcodeListener();
    press('A'); press('B');
    target.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    press('C'); press('Enter');
    expect(listener).not.toHaveBeenCalled();
    unsubscribe(); target.remove();
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

  it('keeps exactly 300ms gaps valid and completes the source before decoding', () => {
    const events: string[] = [];
    const unsubscribeSequence = onBarcodeSequence((event) => events.push(event.kind));
    const unsubscribe = onBarcode((code) => events.push(code));
    startBarcodeListener();
    press(' ');
    vi.advanceTimersByTime(300);
    press('A');
    vi.advanceTimersByTime(300);
    press('B');
    vi.advanceTimersByTime(300);
    press('C');
    vi.advanceTimersByTime(300);
    press(' ');
    vi.advanceTimersByTime(300);
    press('Enter');
    expect(events).toEqual(['started', 'completed', 'ABC']);
    unsubscribe();
    unsubscribeSequence();
  });

  it('cancels unfinished source at 301ms and does not complete it later', () => {
    const events = vi.fn();
    const unsubscribe = onBarcodeSequence(events);
    startBarcodeListener();
    press('A');
    press('B');
    press('C');
    vi.advanceTimersByTime(300);
    expect(events.mock.calls.map(([event]) => event.kind)).toEqual(['started']);
    vi.advanceTimersByTime(1);
    press('Enter');
    expect(events.mock.calls.map(([event]) => event.kind)).toEqual(['started', 'cancelled']);
    unsubscribe();
  });

  it('attributes only insertText from the matching keyboard source', () => {
    const input = document.createElement('input');
    const other = document.createElement('input');
    document.body.append(input, other);
    const sources = vi.fn();
    const unsubscribe = onBarcodeSequence(sources);
    startBarcodeListener();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'A', bubbles: true }));
    const inspect = (target: HTMLInputElement, inputType: string, data: string | null, isComposing = false) => {
      const event = new InputEvent('input', { inputType, data, isComposing, bubbles: true });
      target.dispatchEvent(event);
      return getBarcodeInputSequence(event);
    };
    expect(inspect(input, 'insertText', 'A')).toBe(sources.mock.calls[0][0].id);
    expect(inspect(other, 'insertText', 'A')).toBeNull();
    expect(inspect(input, 'insertFromPaste', 'A')).toBeNull();
    expect(inspect(input, 'deleteContentBackward', null)).toBeNull();
    expect(inspect(input, 'insertText', 'B')).toBeNull();
    expect(inspect(input, 'insertText', 'A', true)).toBeNull();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
    expect(inspect(input, 'insertText', 'A')).toBeNull();
    expect(sources.mock.calls.map(([event]) => event.kind)).toEqual(['started', 'cancelled']);
    unsubscribe();
    input.remove();
    other.remove();
  });

  it('cancels a short sequence and an unfinished stopped listener', () => {
    const events = vi.fn();
    const unsubscribe = onBarcodeSequence(events);
    startBarcodeListener();
    press('A');
    press('B');
    press('Enter');
    press('C');
    stopBarcodeListener();
    vi.advanceTimersByTime(301);
    expect(events.mock.calls.map(([event]) => event.kind)).toEqual([
      'started', 'cancelled', 'started', 'cancelled',
    ]);
    unsubscribe();
  });
});
