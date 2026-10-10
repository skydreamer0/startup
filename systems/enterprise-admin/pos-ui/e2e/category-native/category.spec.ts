import { writeFileSync } from 'node:fs';
import { test, expect, capture, cartSnapshot, assertReachable } from './fixtures';
import { widths, stableCases, origin } from './contract.mjs';
for (const [index, width] of widths.entries()) {
  test(stableCases[index], async ({ page, guard }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(origin);
    const nav = page.getByRole('navigation', { name: '商品分類' });
    const names = ['全部', ...guard.bootstrap.categories.map(category => category.name)];
    const search = page.getByTestId('product-search-input');
    const productA = guard.bootstrap.products.find(product => product.sku === 'CATEGORY-ONLY-1')!;
    const productB = guard.bootstrap.products.find(product => product.sku === 'CATEGORY-ONLY-2')!;
    const productIds = () => page.locator('[data-testid^="product-card-"]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-testid')!.replace('product-card-', '')).sort());
    const stable = async () => {
      await expect(nav.getByRole('button')).toHaveCount(names.length);
      for (const name of names) await expect(nav.getByRole('button', { name, exact: true })).toBeEnabled();
    };
    await stable(); await expect(search).toBeEnabled();
    await expect.poll(productIds).toEqual([productA.id, productB.id].sort());
    await page.getByTestId(`product-card-${productA.id}`).click();
    await expect(page.getByLabel('商品數量')).toHaveValue('1');
    await expect(page.locator('.pos-cart-panel')).toContainText('合成分類收銀員');
    const baseline = await cartSnapshot(page);
    await capture(page, info, 'initial', baseline, guard.bootstrap.categories);
    await search.fill(productA.sku); await expect.poll(productIds).toEqual([productA.id]); await stable();
    await capture(page, info, 'single-sku', baseline, guard.bootstrap.categories);
    await search.fill('CATEGORY-NO-SUCH-SKU'); await expect(page.getByText('沒有符合條件的商品', { exact: true })).toBeVisible();
    await expect.poll(productIds).toEqual([]); await stable();
    await capture(page, info, 'empty-search', baseline, guard.bootstrap.categories);
    const reachability = [];
    // Real native Tab traverses every category while an empty product search is active.
    for (const name of [names[2], names[3], names[1], names[0]]) {
      await page.keyboard.press('F2'); await expect(search).toBeFocused();
      const button = nav.getByRole('button', { name, exact: true });
      for (let i = 0; i < 64 && !(await button.evaluate(node => node === document.activeElement)); i++) await page.keyboard.press('Tab');
      await expect(button).toBeFocused();
      reachability.push({ mode: 'keyboard', name, ...(await assertReachable(page, button)) });
      await page.keyboard.press(name === names[1] ? ' ' : 'Enter'); await expect(button).toHaveAttribute('aria-pressed', 'true'); await stable();
      expect(await cartSnapshot(page)).toEqual(baseline); await expect(page.locator('[data-pos-modal]')).toHaveCount(0);
      await expect(page.getByText('沒有符合條件的商品', { exact: true })).toBeVisible();
      if (name === names[2]) await capture(page, info, 'keyboard-category', baseline, guard.bootstrap.categories);
    }
    await search.fill(''); await expect.poll(productIds).toEqual([productA.id, productB.id].sort());
    for (const [name, expected, stage] of [
      [names[2], [productB.id], 'pointer-category'], [names[3], [], 'empty-category'],
      [names[1], [productA.id], null], [names[0], [productA.id, productB.id].sort(), 'restored-all'],
    ] as const) {
      const button = nav.getByRole('button', { name, exact: true });
      await button.scrollIntoViewIfNeeded();
      reachability.push({ mode: 'pointer', name, ...(await assertReachable(page, button)) });
      await button.click(); await expect(button).toHaveAttribute('aria-pressed', 'true');
      await expect.poll(productIds).toEqual(expected);
      if (!expected.length) await expect(page.getByText('沒有符合條件的商品', { exact: true })).toBeVisible();
      await stable(); expect(await cartSnapshot(page)).toEqual(baseline);
      if (stage) await capture(page, info, stage, baseline, guard.bootstrap.categories);
    }
    writeFileSync(info.outputPath('reachability.json'), JSON.stringify({ test: info.title, nonce: process.env.CATEGORY_UI_NONCE,
      width, expectedNames: names, reachability, cartBefore: baseline, cartAfter: await cartSnapshot(page) }, null, 2) + '\n');
  });
}
