export async function printReceipt(base64Buffer: string): Promise<void> {
  const bytes = Uint8Array.from(atob(base64Buffer), (c) => c.charCodeAt(0));

  // Try WebUSB first (Chrome on desktop)
  if ('usb' in navigator) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const usb = (navigator as unknown as { usb: any }).usb;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const devices: any[] = await usb.getDevices();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let device: any = devices.find((d: any) => d.configuration !== null);

      if (!device) {
        device = await usb.requestDevice({ filters: [] });
      }

      await device.open();
      if (device.configuration === null) await device.selectConfiguration(1);
      await device.claimInterface(0);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const endpoint = device.configuration.interfaces[0].alternates[0].endpoints.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (ep: any) => ep.direction === 'out',
      );
      if (!endpoint) throw new Error('No OUT endpoint found');

      await device.transferOut(endpoint.endpointNumber, bytes);
      await device.close();
      return;
    } catch (err) {
      console.warn('WebUSB print failed, falling back to window.print()', err);
    }
  }

  // Fallback: browser print dialog
  const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  const win = window.open('', '_blank', 'width=400,height=600');
  if (win) {
    win.document.write(`<pre style="font-family:monospace;font-size:12px">${text}</pre>`);
    win.document.close();
    win.print();
    win.close();
  }
}

// ESC/POS cash drawer kick: ESC p m t1 t2
const CASH_DRAWER_CMD = new Uint8Array([0x1b, 0x70, 0x00, 0x19, 0xfa]);

export async function openCashDrawer(): Promise<void> {
  if (!('usb' in navigator)) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const usb = (navigator as unknown as { usb: any }).usb;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const devices: any[] = await usb.getDevices();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const device = devices.find((d: any) => d.configuration !== null);
    if (!device) return;
    await device.open();
    if (device.configuration === null) await device.selectConfiguration(1);
    await device.claimInterface(0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const endpoint = device.configuration.interfaces[0].alternates[0].endpoints.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (ep: any) => ep.direction === 'out',
    );
    if (endpoint) await device.transferOut(endpoint.endpointNumber, CASH_DRAWER_CMD);
    await device.close();
  } catch {
    // Drawer open is best-effort; non-critical
  }
}

export type PrinterType = 'usb' | 'fallback' | 'unavailable';

export async function getPrinterStatus(): Promise<PrinterType> {
  if (!('usb' in navigator)) return 'fallback';
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const usb = (navigator as unknown as { usb: any }).usb;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const devices: any[] = await usb.getDevices();
    const connected = devices.some((d: any) => d.configuration !== null);
    return connected ? 'usb' : 'fallback';
  } catch {
    return 'fallback';
  }
}
