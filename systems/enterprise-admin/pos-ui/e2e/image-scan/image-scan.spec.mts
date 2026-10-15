import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { prepareZXingModule, writeBarcode } from 'zxing-wasm/writer';

// Real built app + bundled reader/WASM; only business HTTP is synthetic.
// Viewports/touch emulation do not establish physical iPad/scanner acceptance.
for (const viewport of [{ width: 1366, height: 900 }, { width: 390, height: 844 }, { width: 1024, height: 768 }]) {
  test(`local decode, explicit selection and warm offline at ${viewport.width}px`, async ({ page, context }, info) => {
    await page.setViewportSize(viewport);
    const require = createRequire(import.meta.url);
    await prepareZXingModule({ overrides: { wasmBinary: readFileSync(require.resolve('zxing-wasm/writer/zxing_writer.wasm')) }, fireImmediately: true });
    const fixture = await writeBarcode('  001aBc\r\n\u001dhttps://example.invalid/item  ', { format: 'QRCode', scale: 4, addQuietZones: true });
    expect(fixture.error).toBe('');
    const buffer = Buffer.from(await fixture.image!.arrayBuffer());
    const unexpected: string[] = [];
    const errors: string[] = [];
    const wasmResponses: { url: string; status: number; mime: string }[] = [];
    let failWasm = true;
    let loginUsed = false;
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {
      if (response.url().endsWith('.wasm')) wasmResponses.push({ url: response.url(), status: response.status(), mime: response.headers()['content-type'] ?? '' });
    });
    await context.routeWebSocket('**/*', socket => { unexpected.push(socket.url()); void socket.close(); });
    await context.route('**/*', async route => {
      const request = route.request(); const url = new URL(request.url());
      if (url.origin === 'https://fonts.googleapis.com' && request.resourceType() === 'stylesheet') {
        await route.fulfill({ contentType: 'text/css', body: '' }); return;
      }
      if (url.origin !== 'http://127.0.0.1:4293') { unexpected.push(url.href); await route.abort(); return; }
      if (request.method() === 'POST' && url.pathname === '/api/v1/admin/pos/staff-login' && !loginUsed
        && request.postDataJSON().employeeCode === 'SYNTHETIC-CASHIER') {
        loginUsed = true;
        await route.fulfill({ json: { success: true, data: { accessToken: 'synthetic-image-only-token' } } }); return;
      }
      if (request.method() !== 'GET') { unexpected.push(`${request.method()} ${url.pathname}`); await route.abort(); return; }
      if (url.pathname.startsWith('/api/')) {
        const data: Record<string, unknown> = {
          '/api/v1/admin/pos/products': [], '/api/v1/admin/pos/categories': [],
          '/api/v1/admin/pos/checkout-context': { tenantId: 'synthetic-tenant', userId: 'synthetic-cashier' },
          '/api/v1/admin/pos/shift/active': { id: 'synthetic-shift', status: 'OPEN', openedAt: '2026-10-13T00:00:00Z', staff: { id: 'synthetic-cashier', fullName: '合成收銀員' } },
          '/api/v1/admin/pos/staff': [], '/api/v1/admin/pos/recommendations': [],
          '/api/v1/admin/pos/reorder-forecast': [], '/api/v1/admin/pos/orders/today': [],
        };
        if (Object.hasOwn(data, url.pathname)) { await route.fulfill({ json: { success: true, data: data[url.pathname] } }); return; }
        unexpected.push(url.pathname); await route.abort(); return;
      }
      if (url.pathname.endsWith('.wasm') && failWasm) { await route.abort(); return; }
      if (['/', '/login', '/manifest.json', '/favicon.ico', '/brand/flow-capsule-v1/favicon.svg', '/brand/flow-capsule-v1/favicon-32.png', '/brand/flow-capsule-v1/favicon-16.png'].includes(url.pathname)
        || url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) { await route.continue(); return; }
      unexpected.push(url.pathname); await route.abort();
    });
    await page.goto('/');
    await page.getByTestId('login-employee-code-input').fill('SYNTHETIC-CASHIER');
    await page.getByTestId('login-submit-button').click();
    const opener = page.getByRole('button', { name: '圖片掃碼', exact: true });
    await opener.click();
    const dialog = page.getByRole('dialog', { name: '圖片掃碼' });
    const input = dialog.getByLabel('選擇條碼或 QR Code 圖片');
    const upload = async (name: string) => {
      await input.setInputFiles({ name: `${name}.png`, mimeType: 'image/png', buffer });
    };
    await upload('retry-first');
    await expect(dialog.getByRole('alert')).toContainText('本地辨識元件載入失敗');
    failWasm = false;
    await upload('retry-second');
    await expect(dialog.getByRole('radio')).toHaveCount(1);
    const confirm = dialog.getByRole('button', { name: '確認這段辨識文字' });
    await expect(confirm).toBeDisabled();
    await dialog.getByRole('radio').first().check();
    await confirm.click();
    await expect(dialog.getByRole('status')).toContainText('已人工確認');
    await expect(confirm).toBeDisabled();
    // An already initialized decoder needs no network for subsequent local files.
    await context.setOffline(true);
    await upload('qr-literal');
    await expect(dialog.getByRole('radio')).toHaveCount(1);
    await dialog.getByRole('radio').check();
    await dialog.getByText('查看選定結果的完整辨識證據').click();
    const evidence = JSON.parse(await dialog.getByLabel('圖片掃描證據 JSON').innerText());
    expect(evidence.scan.literal).toBe('  001aBc\r\n\u001dhttps://example.invalid/item  ');
    expect(evidence.scan.decoder.version).toBe('3.1.2');
    await page.screenshot({ path: info.outputPath('local-image.png') });
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
    await opener.click();
    await expect(dialog.getByRole('radio')).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: '確認這段辨識文字' })).toBeDisabled();
    expect(wasmResponses.some(response => response.status === 200 && response.mime.includes('application/wasm'))).toBe(true);
    expect(unexpected).toEqual([]);
    expect(errors).toEqual([]);
    await info.attach('decoder-network', { body: JSON.stringify({ viewport, wasmResponses, unexpected, errors, warmOffline: true }), contentType: 'application/json' });
  });
}
