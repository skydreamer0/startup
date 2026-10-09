import type { Page, Route, Locator } from '@playwright/test';
import { test, expect, intercept, success, readKeys, screenshot, type Guard } from './fixtures';
import { expectedCases as names } from './cases.mjs';

const origin = 'http://127.0.0.1:4276';
const product = (sku: string, id = sku, stockQuantity = 10) => ({
  id, sku, name: `合成商品 ${id}`, retailPrice: 100, stockQuantity,
});
type Product = ReturnType<typeof product>;
type Result = Product[] | number;
const cart = (page: Page) => page.locator('.pos-cart-panel');
const input = (page: Page) => page.getByTestId('product-search-input');
const selection = (page: Page) => page.getByRole('region', { name: '掃碼候選商品' });
const settle = (page: Page) => page.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))));

async function setup(page: Page, guard: Guard, options: { initial?: Product[]; unknown?: boolean } = {}) {
  const held = new Map<string, Route[]>();
  const waiting = new Set<string>();
  const results: Record<string, Result> = {};
  const tenant = 'tenant-a';
  const contexts: string[] = [];
  await intercept(page.context(), guard, origin, async (route, url) => {
    const path = url.pathname;
    if (path === '/api/v1/admin/pos/products/lookup') {
      const code = url.searchParams.get('code') ?? '';
      if (waiting.has(code)) { held.set(code, [...(held.get(code) ?? []), route]); return true; }
      const result = results[code] ?? [];
      if (typeof result === 'number') await route.fulfill({ status: result, json: { success: false, error: { message: 'Synthetic lookup failure' } } });
      else await success(route, result);
      return true;
    }
    if (path === '/api/v1/admin/pos/products') {
      const query = url.searchParams.get('q') ?? '';
      await success(route, (options.initial ?? []).filter(row => !query || row.sku.includes(query) || row.name.includes(query)).slice(0, 100)); return true;
    }
    if (path === '/api/v1/admin/pos/categories') {
      await success(route, [{ id: `${tenant}-first`, name: '合成分類一' }, { id: `${tenant}-second`, name: '合成分類二' }]); return true;
    }
    if (path === '/api/v1/admin/pos/checkout-context') {
      contexts.push(tenant);
      await success(route, { tenantId: tenant, userId: 'cashier' }); return true;
    }
    if (path === '/api/v1/admin/pos/shift/active') {
      await success(route, { id: 'synthetic-shift', status: 'OPEN', openedAt: '2026-10-09T00:00:00Z', staff: { id: 'cashier', fullName: '合成收銀員' } }); return true;
    }
    if (path === '/api/v1/admin/pos/staff') {
      await success(route, [{ id: 'cashier', fullName: '合成收銀員' }]); return true;
    }
    if (['/api/v1/admin/pos/recommendations', '/api/v1/admin/pos/reorder-forecast', '/api/v1/admin/pos/orders/today'].includes(path)) {
      await success(route, []); return true;
    }
    return false;
  }, { employeeCode: 'SYNTHETIC-CASHIER', accessToken: 'synthetic-ui-only-token' });
  await page.addInitScript(({ unknown, safe }) => {
    if (unknown) localStorage.setItem('pos-checkout-intent-v1:tenant-a:cashier', JSON.stringify({
      status: 'unknown', payload: { commandId: 'synthetic-unknown', cartItems: [{ productId: safe.id, quantity: 1, discountRate: 0 }], paymentMethod: 'CASH' },
      draft: { items: [{ product: safe, quantity: 1, discountRate: 0 }], orderDiscountAmount: 0,
        orderDiscountNote: '', paymentMethod: 'CASH', currentSalesStaffId: 'cashier' },
    }));
  }, { unknown: !!options.unknown, safe: product('SAFE') });
  await page.goto(origin);
  await expect(page.getByTestId('login-employee-code-input')).toBeVisible();
  await page.getByTestId('login-employee-code-input').fill('SYNTHETIC-CASHIER');
  await page.getByTestId('login-submit-button').click();
  await expect(cart(page)).toBeVisible();
  await expect(input(page)).toBeVisible();
  if (!options.unknown) await expect(input(page)).toBeEnabled();
  return {
    results, contexts,
    hold(code: string) { waiting.add(code); },
    count(code: string) { return held.get(code)?.length ?? 0; },
    async release(code: string, rows: Product[]) {
      waiting.delete(code);
      const routes = held.get(code) ?? [];
      held.delete(code);
      expect(routes.length).toBeGreaterThan(0);
      await Promise.all(routes.map(async route => {
        const received = route.request().response();
        await success(route, rows);
        const response = await received;
        expect(response).not.toBeNull();
        expect(await response!.finished()).toBeNull();
      }));
      await settle(page);
    },
  };
}
async function scan(page: Page, code: string) {
  await input(page).focus();
  const start = (await readKeys(page)).length;
  await page.keyboard.type(code);
  await page.keyboard.press('Enter');
  const keys = (await readKeys(page)).slice(start);
  expect(keys.map(event => event.key)).toEqual([...code, 'Enter']);
  expect(keys.every(event => event.trusted)).toBe(true);
  for (let i = 1; i < keys.length; i++) expect(keys[i].at - keys[i - 1].at).toBeLessThanOrEqual(300);
}
async function candidates(page: Page, api: Awaited<ReturnType<typeof setup>>, code = 'AMB') {
  api.results[code] = [product(code, 'first'), product(code, 'second')];
  await scan(page, code);
  await expect(selection(page)).toBeVisible();
  await expect(selection(page).getByRole('button')).toHaveCount(3);
  await screenshot(page, test.info(), 'candidate-state.png');
}
async function tabTo(page: Page, control: Locator) {
  for (let step = 0; step < 150; step++) {
    await page.keyboard.press('Tab');
    if (await control.evaluate(el => el === document.activeElement)) return;
  }
  throw new Error('Control is not reachable by Tab');
}
async function touchTarget(control: Locator) {
  const box = await control.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await test.info().attach('touch-target-measurement', { body: Buffer.from(JSON.stringify({ text: await control.innerText(), box })), contentType: 'application/json' });
}
async function visibleFocus(control: Locator) {
  await expect(control).toBeFocused();
  const style = await control.evaluate(el => {
    const css = getComputedStyle(el);
    return { visible: el.matches(':focus-visible'), style: css.outlineStyle, width: parseFloat(css.outlineWidth), color: css.outlineColor };
  });
  expect(style.visible).toBe(true);
  expect(style.style).not.toBe('none');
  expect(style.width).toBeGreaterThanOrEqual(2);
  expect(style.color).not.toBe('rgba(0, 0, 0, 0)');
  await test.info().attach('keyboard-focus-measurement', { body: Buffer.from(JSON.stringify({ text: await control.innerText(), ...style })), contentType: 'application/json' });
}

test(names[0], async ({ page, guard }) => {
  const initial = Array.from({ length: 100 }, (_, i) => product(`A00123-${i}`));
  const api = await setup(page, guard, { initial });
  await expect(page.locator('[data-testid^="product-card-"]')).toHaveCount(100);
  await expect(page.getByTestId('product-card-00123')).toHaveCount(0);
  api.results['00123'] = [product('00123')];
  await scan(page, '00123');
  await expect(cart(page).getByText('合成商品 00123', { exact: true })).toBeVisible();
  await expect(cart(page).getByLabel('商品數量')).toHaveValue('1');
  expect(guard.requests).toContain('GET /api/v1/admin/pos/products/lookup?code=00123');
  await expect(page.getByRole('button', { name: '合成分類一', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '合成分類二', exact: true })).toBeVisible();
  await expect(input(page)).toBeFocused();
  await input(page).fill('不存在的合成搜尋');
  await expect(page.getByText('沒有符合條件的商品', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '合成分類二', exact: true }).click();
  await expect(page.getByRole('button', { name: '合成分類二', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: '合成分類一', exact: true })).toBeVisible();
  await expect(cart(page).getByLabel('商品數量')).toHaveValue('1');
});

test(names[1], async ({ page, guard }) => {
  const api = await setup(page, guard);
  api.hold('ONE'); api.hold('TWO');
  await scan(page, 'ONE'); await expect.poll(() => api.count('ONE')).toBe(1);
  await scan(page, 'TWO'); await expect.poll(() => api.count('TWO')).toBe(1);
  await api.release('TWO', [product('TWO')]);
  await expect(cart(page).getByText('合成商品 TWO', { exact: true })).toBeVisible();
  await api.release('ONE', [product('ONE')]);
  await expect(cart(page).getByLabel('商品數量')).toHaveCount(2);
  api.hold('ONE');
  await scan(page, 'ONE'); await scan(page, 'ONE');
  await expect.poll(() => api.count('ONE')).toBe(2);
  await api.release('ONE', [product('ONE')]);
  await expect(cart(page).getByLabel('商品數量').nth(0)).toHaveValue('1');
  await expect(cart(page).getByLabel('商品數量').nth(1)).toHaveValue('3');
  await expect(page.getByTestId('payment-confirm-button')).not.toBeVisible();
});

test(names[2], async ({ page, guard }) => {
  const api = await setup(page, guard, { initial: [product('SAFE')] });
  await page.getByTestId('product-card-SAFE').click();
  api.hold('LATE'); await scan(page, 'LATE'); await expect.poll(() => api.count('LATE')).toBe(1);
  await input(page).fill('人工搜尋');
  await api.release('LATE', [product('LATE')]);
  await expect(input(page)).toHaveValue('人工搜尋');
  await expect(cart(page).getByLabel('商品數量')).toHaveCount(1);
  await input(page).fill('');
  api.hold('NEW'); await scan(page, 'NEW'); await expect.poll(() => api.count('NEW')).toBe(1);
  await page.getByRole('button', { name: '清空購物車 (F5)', exact: true }).click();
  await page.getByRole('button', { name: '再按一次確認清空', exact: true }).click();
  await api.release('NEW', [product('NEW')]);
  await expect(cart(page).getByLabel('商品數量')).toHaveCount(0);
});

test(names[3], async ({ page, guard }) => {
  await setup(page, guard);
  expect(guard.expectedWrites).toEqual(['POST /api/v1/admin/pos/staff-login']);
  expect(guard.writes).toEqual([]);
  await expect(page.getByTestId('login-employee-code-input')).toHaveCount(0);
  await expect(input(page)).toBeEnabled();
  await test.info().attach('tenant-switch-limitation', {
    body: Buffer.from('NOT RUN: POS has no tenant-switch UI. No route/storage/fixture replacement counts as tenant-switch acceptance.'),
    contentType: 'text/plain',
  });
});

test(names[4], async ({ page, guard }) => {
  await setup(page, guard, { unknown: true });
  await expect(page.getByTestId('checkout-recovery')).toContainText('synthetic-unknown');
  await expect(input(page)).toBeDisabled();
  await page.locator('body').click({ position: { x: 1, y: 1 } });
  await page.keyboard.type('NEW'); await page.keyboard.press('Enter'); await settle(page);
  await expect(cart(page).getByLabel('商品數量')).toHaveValue('1');
  expect(guard.requests.some(url => url.includes('/products/lookup'))).toBe(false);
  await page.reload();
  await expect(page.getByTestId('checkout-recovery')).toContainText('synthetic-unknown');
  await expect(cart(page).getByText('合成商品 SAFE', { exact: true })).toBeVisible();
});

test(names[5], async ({ page, guard }) => {
  const api = await setup(page, guard);
  for (const key of ['Enter', 'Space']) {
    await candidates(page, api);
    const choice = selection(page).getByRole('button', { name: /合成商品 first/ });
    await tabTo(page, choice); await visibleFocus(choice); await page.keyboard.press(key);
    await expect(selection(page)).toHaveCount(0);
    await expect(page.getByTestId('payment-confirm-button')).not.toBeVisible();
  }
  await expect(cart(page).getByLabel('商品數量')).toHaveValue('2');
  await candidates(page, api);
  const cancel = selection(page).getByRole('button', { name: '取消選擇' });
  await tabTo(page, cancel); await page.keyboard.press('Enter');
  await expect(selection(page)).toHaveCount(0);
  await expect(cart(page).getByLabel('商品數量')).toHaveValue('2');
  // Function shortcuts are explicitly tested from a non-input native control.
  await page.getByTestId('cart-checkout-button').focus(); await page.keyboard.press('F2');
  await expect(input(page)).toBeFocused();
  await page.getByTestId('cart-checkout-button').focus(); await page.keyboard.press('F7');
  await expect(page.getByRole('heading', { name: '今日訂單' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: '今日訂單' })).toHaveCount(0);
});

test(names[6], async ({ page, guard }) => {
  const api = await setup(page, guard, { initial: [product('SAFE')] });
  await page.getByTestId('product-card-SAFE').click();
  await page.getByTestId('cart-checkout-button').click();
  await expect(page.getByTestId('payment-confirm-button')).toBeVisible();
  const before = guard.requests.filter(url => url.includes('/products/lookup')).length;
  // Native focused text input behind the modal still must not add a scan.
  await scan(page, 'NEW'); await settle(page);
  expect(guard.requests.filter(url => url.includes('/products/lookup')).length).toBe(before);
  await expect(cart(page).getByLabel('商品數量')).toHaveValue('1');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(page.getByTestId('payment-confirm-button')).not.toBeVisible();
  await test.info().attach('focus-immediately-after-payment-cancel', {
    body: Buffer.from(await page.evaluate(() => document.activeElement?.outerHTML ?? 'null')), contentType: 'text/plain',
  });
  // No scan/fill/focus may manufacture restoration after the closing action.
  await expect(page.getByTestId('cart-checkout-button')).toBeFocused();
  api.results['NEW'] = [product('NEW')]; await input(page).fill(''); await scan(page, 'NEW');
  await expect(cart(page).getByLabel('商品數量')).toHaveCount(2);
  await expect(input(page)).toBeFocused();
});

test(names[7], async ({ page, guard }) => {
  const api = await setup(page, guard, { initial: [product('SAFE')] });
  await page.getByTestId('product-card-SAFE').click();
  api.hold('WAIT'); await scan(page, 'WAIT');
  await expect(page.getByText('正在查詢 SKU WAIT…', { exact: true })).toBeVisible();
  await api.release('WAIT', []);
  await expect(page.getByText('找不到 SKU WAIT，請檢查代碼或使用人工搜尋', { exact: true })).toBeVisible();
  for (const [code, result, message] of [
    ['123', [product('A123B')], '沒有完全相符的商品，請使用人工搜尋'],
    ['ZERO', [product('ZERO', 'ZERO', 0)], '已找到 合成商品 ZERO，但庫存不足，未加入購物車'],
    ['DENY', 403, '沒有商品查詢權限，請聯絡管理員；草稿已保留'],
    ['ERR', 500, '查詢商品失敗，請保留草稿並重新掃描或使用人工搜尋'],
  ] as [string, Result, string][]) {
    api.results[code] = result; await input(page).fill(''); await scan(page, code);
    await expect(page.getByText(message, { exact: true }).first()).toBeVisible();
    await expect(cart(page).getByLabel('商品數量')).toHaveValue('1');
    await expect(cart(page).getByText('合成商品 SAFE', { exact: true })).toBeVisible();
  }
});

test(names[8], async ({ page, guard }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  const api = await setup(page, guard); await candidates(page, api);
  for (const control of await selection(page).getByRole('button').all()) await touchTarget(control);
  const choice = selection(page).getByRole('button').first();
  await tabTo(page, choice); await visibleFocus(choice);
  await screenshot(page, test.info(), 'tablet-visible-focus.png');
  await page.keyboard.press('Enter');
  await expect(cart(page).getByLabel('商品數量')).toHaveValue('1');
});

test(names[9], async ({ page, guard }) => {
  const api = await setup(page, guard); await candidates(page, api);
  const before = await selection(page).getByRole('button').first().evaluate(el => parseFloat(getComputedStyle(el).fontSize));
  // Text-only 200%: change the root font, never DPR or CSS transform/zoom.
  await page.evaluate(() => { document.documentElement.style.fontSize = `${parseFloat(getComputedStyle(document.documentElement).fontSize) * 2}px`; });
  const choice = selection(page).getByRole('button').first();
  const after = await choice.evaluate(el => parseFloat(getComputedStyle(el).fontSize));
  expect(after).toBeCloseTo(before * 2, 1);
  await test.info().attach('text-size-measurement', { body: Buffer.from(JSON.stringify({ before, after, method: 'root font size x2, no DPR or page scale emulation' })), contentType: 'application/json' });
  await screenshot(page, test.info(), 'double-text-candidates.png');
  for (const control of await selection(page).getByRole('button').all()) {
    await touchTarget(control);
    const clipped = await control.evaluate(el => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1);
    expect(clipped, 'Candidate text must not clip at 200% text size').toBe(false);
  }
  await tabTo(page, choice); await visibleFocus(choice); await page.keyboard.press('Enter');
  await expect(cart(page).getByLabel('商品數量')).toHaveValue('1');
});

// Bounding-box presence alone does not establish reachability through clipped ancestors.
async function reachability(control: Locator) {
  return control.evaluate(el => {
    const rect = el.getBoundingClientRect();
    const visual = window.visualViewport;
    const viewport = { left: visual?.offsetLeft ?? 0, top: visual?.offsetTop ?? 0,
      right: (visual?.offsetLeft ?? 0) + (visual?.width ?? innerWidth),
      bottom: (visual?.offsetTop ?? 0) + (visual?.height ?? innerHeight) };
    const intersection = { ...viewport };
    const ancestors = [];
    for (let node = el.parentElement; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      const bounds = node.getBoundingClientRect();
      const clipX = /^(auto|scroll|hidden|clip)$/.test(style.overflowX);
      const clipY = /^(auto|scroll|hidden|clip)$/.test(style.overflowY);
      // A viewport-fixed ancestor escapes normal-flow overflow clipping. A
      // transform/filter/paint containing block keeps it subject to that block.
      if (style.position === 'fixed') {
        let containingBlock = false;
        for (let parent = node.parentElement; parent; parent = parent.parentElement) {
          const css = getComputedStyle(parent);
          if (css.transform !== 'none' || css.perspective !== 'none' || css.filter !== 'none'
            || /paint|layout|strict|content/.test(css.contain)
            || /transform|perspective|filter/.test(css.willChange)) containingBlock = true;
        }
        if (!containingBlock) break;
      }
      if (!clipX && !clipY) continue;
      const box = { left: bounds.left + node.clientLeft, top: bounds.top + node.clientTop,
        right: bounds.left + node.clientLeft + node.clientWidth, bottom: bounds.top + node.clientTop + node.clientHeight };
      if (clipX) { intersection.left = Math.max(intersection.left, box.left); intersection.right = Math.min(intersection.right, box.right); }
      if (clipY) { intersection.top = Math.max(intersection.top, box.top); intersection.bottom = Math.min(intersection.bottom, box.bottom); }
      ancestors.push({ tag: node.tagName, className: node.className, overflowX: style.overflowX, overflowY: style.overflowY,
        box, scrollTop: node.scrollTop, scrollHeight: node.scrollHeight, clientHeight: node.clientHeight });
    }
    const layoutCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    const center = { x: layoutCenter.x - viewport.left, y: layoutCenter.y - viewport.top };
    const hit = document.elementFromPoint(layoutCenter.x, layoutCenter.y);
    return { target: el.textContent, rect: rect.toJSON(), viewport, intersection, ancestors, center, layoutCenter, scrollY,
      entirelyVisible: rect.left >= intersection.left - 1 && rect.right <= intersection.right + 1
        && rect.top >= intersection.top - 1 && rect.bottom <= intersection.bottom + 1,
      hitTarget: !!hit && (hit === el || el.contains(hit)), hit: hit?.outerHTML.slice(0, 500) ?? null };
  });
}
async function assertReachable(page: Page, control: Locator, label: string) {
  const measured = await reachability(control);
  await test.info().attach(label, { body: Buffer.from(JSON.stringify(measured)), contentType: 'application/json' });
  await screenshot(page, test.info(), `${label}.png`);
  expect(measured.entirelyVisible, `${label}: entire control is inside viewport and clipping ancestors`).toBe(true);
  expect(measured.hitTarget, `${label}: visible center must hit the control, not an overlay`).toBe(true);
  return measured.center;
}
async function wheelTowards(page: Page, control: Locator) {
  // Real wheel input only; never assign scrollTop or call scrollIntoView to bypass overflow:hidden.
  for (let attempt = 0; attempt < 4; attempt++) {
    const state = await reachability(control);
    if (state.entirelyVisible && state.hitTarget) return;
    await page.mouse.move(Math.max(1, Math.min(200, page.viewportSize()!.width - 1)), 250);
    await page.mouse.wheel(0, 300);
    await settle(page);
  }
}

test(names[10], async ({ page, guard }) => {
  await page.setViewportSize({ width: 1024, height: 600 });
  const api = await setup(page, guard);
  api.results['SIX'] = Array.from({ length: 6 }, (_, i) => product('SIX', `candidate-${i + 1}`));
  await scan(page, 'SIX'); await expect(selection(page).getByRole('button')).toHaveCount(7);
  const last = selection(page).getByRole('button', { name: /合成商品 candidate-6/ });
  const before = await last.evaluate(el => parseFloat(getComputedStyle(el).fontSize));
  await page.evaluate(() => { document.documentElement.style.fontSize = `${parseFloat(getComputedStyle(document.documentElement).fontSize) * 2}px`; });
  const after = await last.evaluate(el => parseFloat(getComputedStyle(el).fontSize));
  expect(after).toBeCloseTo(before * 2, 1);
  await test.info().attach('short-tablet-text-size', { body: Buffer.from(JSON.stringify({ before, after, nativePageZoom: false })), contentType: 'application/json' });
  await tabTo(page, last); await visibleFocus(last);
  await assertReachable(page, last, 'short-tablet-last-candidate');
  await page.keyboard.press('Enter');
  await expect(cart(page).getByText('合成商品 candidate-6', { exact: true })).toBeVisible();
  await scan(page, 'SIX'); await expect(selection(page).getByRole('button')).toHaveCount(7);
  const cancel = selection(page).getByRole('button', { name: '取消選擇' });
  await wheelTowards(page, cancel);
  const point = await assertReachable(page, cancel, 'short-tablet-cancel');
  await page.mouse.click(point.x, point.y);
  await expect(selection(page)).toHaveCount(0);
  await expect(cart(page).getByLabel('商品數量')).toHaveValue('1');
});

test.describe('mobile', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test(names[11], async ({ page, guard }) => {
    await page.setViewportSize({ width: 390, height: 480 });
    const api = await setup(page, guard);
    await test.info().attach('viewport-stress-scope', { body: Buffer.from('390x480 synthetic viewport stress; no OS keyboard, iPad or Safari evidence'), contentType: 'text/plain' });
    await candidates(page, api);
    const last = selection(page).getByRole('button', { name: /合成商品 second/ });
    const point = await assertReachable(page, last, 'small-mobile-last-candidate');
    await page.touchscreen.tap(point.x, point.y);
    await expect(cart(page).getByLabel('商品數量')).toHaveValue('1');
    await candidates(page, api);
    const cancelChoice = selection(page).getByRole('button', { name: '取消選擇' });
    const cancelPoint = await assertReachable(page, cancelChoice, 'small-mobile-candidate-cancel');
    await page.touchscreen.tap(cancelPoint.x, cancelPoint.y);
    await expect(selection(page)).toHaveCount(0);
    const checkout = page.getByTestId('cart-checkout-button');
    await wheelTowards(page, checkout);
    const openPoint = await assertReachable(page, checkout, 'small-mobile-checkout');
    await page.touchscreen.tap(openPoint.x, openPoint.y);
    // Measure confirmation reachability without submitting any synthetic transaction.
    await assertReachable(page, page.getByTestId('payment-confirm-button'), 'small-mobile-payment-confirm');
    const cancelPayment = page.getByRole('button', { name: '取消', exact: true });
    const closePoint = await assertReachable(page, cancelPayment, 'small-mobile-payment-cancel');
    await page.touchscreen.tap(closePoint.x, closePoint.y);
    await expect(page.getByTestId('payment-confirm-button')).not.toBeVisible();
    await expect(checkout).toBeFocused();
    await expect(cart(page).getByLabel('商品數量')).toHaveValue('1');
  });
  test(names[12], async ({ page, guard }) => {
    const api = await setup(page, guard); await candidates(page, api);
    const choice = selection(page).getByRole('button').first();
    await touchTarget(choice); await choice.tap();
    await expect(cart(page).getByLabel('商品數量')).toHaveValue('1');
    await expect(input(page)).toBeFocused();
    await candidates(page, api);
    const cancel = selection(page).getByRole('button', { name: '取消選擇' });
    await touchTarget(cancel); await cancel.tap();
    await expect(selection(page)).toHaveCount(0);
    await expect(cart(page).getByLabel('商品數量')).toHaveValue('1');
    await expect(page.getByTestId('payment-confirm-button')).not.toBeVisible();
  });
});

// A separate, owned context probes denials; the ordinary acceptance guard remains strict.
test(names[13], async ({ browser }, info) => {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const denied: Guard = { expectedWrites: [], requests: [], writes: [], unexpected: [], pageErrors: [], stubbedStylesheets: [] };
  await intercept(context, denied, origin, async () => false);
  try {
    const second = await context.newPage();
    await second.goto('data:text/html,<title>synthetic guard probes</title>');
    await second.evaluate(async ({ origin }) => {
      await fetch(`${origin}/api/undeclared`, { method: 'POST', body: 'synthetic' }).catch(() => {});
      await fetch('https://blocked.invalid/unknown').catch(() => {});
    }, { origin });
    const popupEvent = context.waitForEvent('page');
    await second.evaluate(() => { window.open('https://blocked.invalid/popup'); });
    const popup = await popupEvent;
    await expect.poll(() => new Set(denied.unexpected).has('https://blocked.invalid/popup')).toBe(true);
    await popup.goto('data:text/html,<title>synthetic socket probe</title>');
    await popup.evaluate(async ({ origin }) => {
      await fetch(`${origin}/api/popup-write`, { method: 'DELETE' }).catch(() => {});
    }, { origin });
    await popup.evaluate(() => { const ws = new WebSocket('wss://blocked.invalid/socket'); ws.onerror = () => {}; });
    await expect.poll(() => denied.unexpected.some(value => value.startsWith('WebSocket '))).toBe(true);
    expect(denied.writes).toEqual(['POST /api/undeclared', 'DELETE /api/popup-write']);
    expect(denied.unexpected).toEqual(expect.arrayContaining([
      'https://blocked.invalid/unknown', 'https://blocked.invalid/popup', 'WebSocket wss://blocked.invalid/socket',
    ]));
    expect(denied.expectedWrites).toEqual([]);
    await info.attach('context-denial-probes', { body: Buffer.from(JSON.stringify(denied)), contentType: 'application/json' });
  } finally { await context.close(); }
});
