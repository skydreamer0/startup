import { test, expect } from './fixtures';
import { cases, origin, loginPath, readPaths } from './contract.mjs';
import { capture, controlGeometry, assertControlGeometry, fontProof, writeJson } from '../recovery-native/evidence.mjs';
for (const scenario of cases) test(scenario.title, async ({ page, guard }, info) => {
  await page.setViewportSize({ width: scenario.width, height: scenario.height });
  const record = async (stage: string, selector: string) => {
    guard.stage = stage;
    await capture(page, info.outputDir, stage, { caseId: scenario.id, nonce: guard.fixture.nonce, fonts: await fontProof(page, selector) });
  };
  const hasToken = () => page.evaluate(() => !!localStorage.getItem('pos_accessToken'));
  await page.goto(origin); await expect(page).toHaveURL(origin + '/login');
  const input = page.getByRole('textbox', { name: '員工條碼 / 員工代碼', exact: true });
  const button = page.getByTestId('login-submit-button');
  await expect(input).toBeFocused(); await expect(button).toBeDisabled();
  guard.journey.beforeToken = await hasToken(); expect(guard.journey.beforeToken).toBe(false);
  await input.press('Enter'); expect(guard.requests.filter(row => row.method === 'POST')).toHaveLength(0); guard.journey.blankPosts = 0;
  await record('login-ready', 'p');
  for (const attempt of ['inactive', 'unknown'] as const) {
    guard.stage = attempt;
    await input.fill(guard.fixture.codes[attempt]); await input.press('Enter');
    await expect(page.getByRole('alert')).toHaveText('登入失敗，請確認員工代碼後再試');
    await expect(input).toHaveValue(''); await expect(input).toBeFocused(); await expect(button).toBeDisabled();
    expect(await hasToken()).toBe(false); await expect(page).toHaveURL(origin + '/login');
    await expect.poll(() => guard.requests.filter(row => row.attempt === attempt && row.status === 401 && row.delivered).length).toBe(1);
    await record(`${attempt}-rejected`, '[role="alert"]');
  }
  guard.stage = 'active'; await input.fill(guard.fixture.codes.active);
  const inputGeometry = await controlGeometry(input); assertControlGeometry(inputGeometry, { focus: false }); expect(inputGeometry.active).toBe(true);
  await page.keyboard.press('Tab'); await expect(button).toBeFocused();
  const buttonGeometry = await controlGeometry(button); assertControlGeometry(buttonGeometry, { focus: false }); expect(buttonGeometry.active).toBe(true);
  // Record native focus styling without inventing a new outline-width policy for this legacy page.
  writeJson(info.outputDir, 'login-geometry.json', { caseId: scenario.id, nonce: guard.fixture.nonce, input: inputGeometry, button: buttonGeometry });
  await page.keyboard.press('Enter');
  await expect.poll(() => guard.activeReady).toBe(true);
  await expect(input).toBeDisabled(); await expect(button).toBeDisabled(); await expect(button).toHaveText('登入中...');
  expect(await hasToken()).toBe(false); await record('active-pending', 'button');
  // Preserve keys before the genuine full-document navigation replaces this document.
  guard.journey.loginKeys = await page.evaluate(() => (window as unknown as { __staffEntryKeys: unknown[] }).__staffEntryKeys);
  guard.releaseActive(); await expect(page).toHaveURL(origin + '/');
  const card = page.getByTestId(`product-card-${guard.fixture.productId}`);
  await expect(card).toContainText('✓ 5 件'); await expect(page.locator('.pos-cart-panel')).toBeVisible();
  const readsComplete = () => readPaths.every(path => guard.requests.some(row => row.method === 'GET' && row.path === path && row.status === 200 && row.delivered));
  await expect.poll(readsComplete, { timeout: 20_000 }).toBe(true);
  await expect.poll(() => guard.controllers.size, { timeout: 20_000 }).toBe(0);
  guard.journey.afterToken = await hasToken(); expect(guard.journey.afterToken).toBe(true);
  // Only a one-way fingerprint leaves the page; it is never written to evidence.
  const fingerprint = () => page.evaluate(async () => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(localStorage.getItem('pos_accessToken') ?? '')))).join(','));
  const beforeReload = await fingerprint();
  await record('pos-entered', `[data-testid="product-card-${guard.fixture.productId}"]`);
  const initialContextCount = guard.requests.filter(row => row.path.endsWith('/checkout-context') && row.delivered).length;
  guard.stage = 'reload'; await page.reload(); await expect(page).toHaveURL(origin + '/'); await expect(card).toContainText('✓ 5 件');
  await expect.poll(() => guard.requests.filter(row => row.path.endsWith('/checkout-context') && row.delivered).length, { timeout: 20_000 }).toBeGreaterThan(initialContextCount);
  await expect.poll(() => guard.controllers.size, { timeout: 20_000 }).toBe(0);
  guard.journey.reloadTokenUnchanged = await fingerprint() === beforeReload;
  expect(guard.journey.reloadTokenUnchanged).toBe(true);
  expect(guard.requests.filter(row => row.path === loginPath && row.dispatched)).toHaveLength(3);
  await record('pos-reloaded', `[data-testid="product-card-${guard.fixture.productId}"]`);
});
