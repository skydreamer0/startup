import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPrinterStatus, printReceipt } from '../services/receiptService';

function setUsb(value: unknown) {
  Object.defineProperty(navigator, 'usb', {
    configurable: true,
    value,
  });
}

function removeUsb() {
  Reflect.deleteProperty(navigator, 'usb');
}

describe('receiptService', () => {
  afterEach(() => {
    removeUsb();
    vi.restoreAllMocks();
  });

  it('reports fallback printer status when WebUSB is unavailable', async () => {
    removeUsb();

    await expect(getPrinterStatus()).resolves.toBe('fallback');
  });

  it('reports usb printer status when a configured USB device is connected', async () => {
    setUsb({
      getDevices: vi.fn().mockResolvedValue([{ configuration: {} }]),
    });

    await expect(getPrinterStatus()).resolves.toBe('usb');
  });

  it('prints through WebUSB when an OUT endpoint is available', async () => {
    const transferOut = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn().mockResolvedValue(undefined);
    const device = {
      configuration: {
        interfaces: [{
          alternates: [{
            endpoints: [{ direction: 'out', endpointNumber: 1 }],
          }],
        }],
      },
      open: vi.fn().mockResolvedValue(undefined),
      claimInterface: vi.fn().mockResolvedValue(undefined),
      transferOut,
      close,
    };
    setUsb({
      getDevices: vi.fn().mockResolvedValue([device]),
    });
    const openWindow = vi.spyOn(window, 'open').mockReturnValue(null);

    await printReceipt(btoa('receipt text'));

    expect(transferOut).toHaveBeenCalledWith(1, expect.any(Uint8Array));
    expect(close).toHaveBeenCalled();
    expect(openWindow).not.toHaveBeenCalled();
  });

  it('falls back to browser printing when WebUSB printing fails', async () => {
    setUsb({
      getDevices: vi.fn().mockRejectedValue(new Error('USB unavailable')),
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const print = vi.fn();
    const close = vi.fn();
    const write = vi.fn();
    const documentClose = vi.fn();
    vi.spyOn(window, 'open').mockReturnValue({
      document: { write, close: documentClose },
      print,
      close,
    } as unknown as Window);

    await printReceipt(btoa('receipt text'));

    expect(write).toHaveBeenCalledWith(expect.stringContaining('receipt text'));
    expect(documentClose).toHaveBeenCalled();
    expect(print).toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
  });
});
