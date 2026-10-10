import { writeFileSync } from 'node:fs';
import { test, expect, capture, cartSnapshot, assertReachable } from './fixtures';
import { widths, lifecycleCases, emptyCase, origin } from './contract.mjs';

for (const [index, width] of widths.entries()) {
  test(lifecycleCases[index], async ({ page, context, guard }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(origin);
    const nav = page.getByRole('navigation', { name: '商品分類' });
    const names = ['全部', ...guard.bootstrap.categories.map(category => category.name)];
    const search = page.getByTestId('product-search-input');
    const [productA, productB] = [1, 2].map(number => guard.bootstrap.products.find(product => product.sku === `CATEGORY-ONLY-${number}`)!);
    const productIds = () => page.locator('[data-testid^="product-card-"]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-testid')!.replace('product-card-', '')).sort());
    const alert = page.getByRole('alert').filter({ hasText: width === 1024 ? '沒有讀取商品分類的權限' : '分類載入失敗' });
    const retry = page.getByRole('button', { name: '重新載入分類', exact: true });
    // Slow server error leaves an observable initial loading state; products use the real API.
    await expect(page.getByText('分類載入中...', { exact: true })).toBeVisible();
    const initialCart = await cartSnapshot(page);
    await capture(page, info, 'initial-loading', initialCart, []);
    await expect(alert).toBeVisible();
    await expect(page.getByText('尚無商品分類，可使用全部商品與搜尋。', { exact: true })).toHaveCount(0);
    await expect(page.getByText('分類載入中...', { exact: true })).toHaveCount(0);
    await expect(nav.getByRole('button')).toHaveCount(1);
    await expect.poll(productIds).toEqual([productA.id, productB.id].sort());
    await page.getByTestId(`product-card-${productA.id}`).click();
    await expect(page.getByLabel('商品數量')).toHaveValue('1');
    const baseline = await cartSnapshot(page);
    await capture(page, info, 'initial-error', baseline, []);
    guard.phase = 'recover';
    const reachability = [];
    await retry.scrollIntoViewIfNeeded();
    if (width === 1024) {
      await page.keyboard.press('F2'); await page.keyboard.press('Tab');
      await expect(nav.getByRole('button', { name: names[0], exact: true })).toBeFocused(); await page.keyboard.press('Enter');
      reachability.push({ mode: 'pointer', ...(await assertReachable(page, retry)) }); await retry.click(); }
    else {
      await page.keyboard.press('F2'); await expect(search).toBeFocused();
      for (let count = 0; count < 64 && !(await retry.evaluate(node => node === document.activeElement)); count++) await page.keyboard.press('Tab');
      await expect(retry).toBeFocused(); reachability.push({ mode: 'keyboard', ...(await assertReachable(page, retry)) });
      await page.keyboard.press('Enter');
    }
    await expect(page.getByText('分類載入中...', { exact: true })).toBeVisible();
    await expect(retry).toHaveCount(0);
    await capture(page, info, 'retry-pending', baseline, []);
    const stable = async () => {
      await expect(nav.getByRole('button')).toHaveCount(names.length);
      for (const name of names) await expect(nav.getByRole('button', { name, exact: true })).toBeEnabled();
      expect(await cartSnapshot(page)).toEqual(baseline);
    };
    await stable(); await expect(retry).toHaveCount(0); await expect(alert).toHaveCount(0);
    await capture(page, info, 'retry-recovered', baseline, guard.bootstrap.categories);

    // Two real product requests race. A finishes last; B must remain selected/rendered.
    guard.phase = 'rapid';
    await search.fill('合成');
    await expect.poll(productIds).toEqual([productA.id, productB.id].sort());
    const oldResponse = page.waitForResponse(response => new URL(response.url()).searchParams.get('categoryId') === guard.bootstrap.categories[0].id);
    const oldRequest = page.waitForRequest(request => new URL(request.url()).searchParams.get('categoryId') === guard.bootstrap.categories[0].id);
    await nav.getByRole('button', { name: names[1], exact: true }).click(); await oldRequest;
    await nav.getByRole('button', { name: names[2], exact: true }).click();
    await expect.poll(productIds).toEqual([productB.id]);
    await oldResponse;
    await expect.poll(productIds).toEqual([productB.id]);
    await expect(nav.getByRole('button', { name: names[2], exact: true })).toHaveAttribute('aria-pressed', 'true');
    await stable(); await capture(page, info, 'rapid-latest', baseline, guard.bootstrap.categories);

    // Real wall-clock staleTime expiry, then real tab visibility/focus. No query/cache hook or fake timer.
    guard.phase = 'refetch-error';
    const background = await context.newPage(); await background.bringToFront();
    await page.waitForTimeout(61_000); await page.bringToFront(); await background.close();
    const stale = page.getByRole('alert').filter({ hasText: '分類資訊可能已過期。' });
    await expect(stale).toBeVisible(); await expect(retry).toBeEnabled();
    await stable(); await expect(search).toHaveValue('合成');
    await expect(nav.getByRole('button', { name: names[2], exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(productIds).toEqual([productB.id]);
    await capture(page, info, 'stale-error', baseline, guard.bootstrap.categories);
    guard.phase = 'refetch-recover';
    await retry.scrollIntoViewIfNeeded(); reachability.push({ mode: 'pointer', ...(await assertReachable(page, retry)) }); await retry.click();
    await expect(retry).toBeDisabled(); await expect(stale).toBeVisible();
    await capture(page, info, 'stale-retry-pending', baseline, guard.bootstrap.categories);
    await expect(stale).toHaveCount(0); await expect(retry).toHaveCount(0);
    await stable(); await expect(search).toHaveValue('合成');
    await expect(nav.getByRole('button', { name: names[2], exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(productIds).toEqual([productB.id]);
    await capture(page, info, 'stale-recovered', baseline, guard.bootstrap.categories);
    writeFileSync(info.outputPath('lifecycle.json'), JSON.stringify({ test: info.title, nonce: guard.bootstrap.nonce, width,
      initialStatus: width === 1024 ? 403 : 500, faultInjection: 'Test outer middleware; 403 is UI presentation, not authorization acceptance',
      realStaleWaitMs: 61_000, reachability, selectedCategory: guard.bootstrap.categories[1].id,
      search: '合成', latestProductIds: await productIds(), cartBefore: baseline, cartAfter: await cartSnapshot(page) }, null, 2) + '\n');
  });
}

test(emptyCase, async ({ page, guard }, info) => {
  await page.setViewportSize({ width: 390, height: 900 }); await page.goto(origin);
  await expect(page.getByText('尚無商品分類，可使用全部商品與搜尋。', { exact: true })).toBeVisible();
  await expect(page.getByText('分類載入中...', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
  const nav = page.getByRole('navigation', { name: '商品分類' });
  await expect(nav.getByRole('button')).toHaveCount(1);
  await page.keyboard.press('F2'); await page.keyboard.press('Tab');
  // Native Enter is recorded even when no tenant categories exist.
  await nav.getByRole('button', { name: '全部', exact: true }).focus(); await page.keyboard.press('Enter');
  await expect(nav.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
  await capture(page, info, 'empty-tenant', await cartSnapshot(page), guard.bootstrap.categories);
});
