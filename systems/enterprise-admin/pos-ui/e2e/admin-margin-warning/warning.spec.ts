import { test, expect, origin, notice, productName, dataFor, emptyFor, loadingFor, deferred, capture, ranking, type Slug } from './fixtures';
import type { Page } from '@playwright/test';

async function ready(page: Page, slug: Slug) {
  await page.goto(`${origin}/reports/${slug}`);
  await expect(notice(page)).toBeVisible();
}
async function success(page: Page) { await expect(page.getByText(productName, { exact: true })).toBeVisible(); }
async function tabToSummary(page: Page) {
  // Exercise keyboard reachability; do not substitute programmatic .focus().
  for (let step = 0; step < 70; step++) {
    await page.keyboard.press('Tab');
    if (await notice(page).locator('summary').evaluate(el => document.activeElement === el)) return;
  }
  throw new Error('Disclosure summary was not reachable with Tab');
}

for (const slug of ['margin', 'sales-ranking'] as const) {
  for (const width of [1440, 390]) {
    test.describe(`${slug}-${width}`, () => {
      test.use({ viewport: { width, height: width === 390 ? 844 : 900 } });
      test(`${slug} ${width}: pending and empty`, async ({ page, harness }, info) => {
        const hold = deferred(); harness.handler = () => hold.promise;
        await ready(page, slug);
        await expect(page.getByText(loadingFor(slug))).toBeVisible();
        await capture(page, info, 'loading');
        hold.resolve({ status: 200, data: emptyFor(slug) });
        await expect(page.getByText(loadingFor(slug))).toHaveCount(0);
        await expect(notice(page)).toBeVisible();
        await expect(page.getByText(productName, { exact: true })).toHaveCount(0);
        if (slug === 'sales-ranking') await expect(page.getByText('No sales data for this period.')).toBeVisible();
        await capture(page, info, 'empty');
      });
      test(`${slug} ${width}: success and inputs`, async ({ page }, info) => {
        await ready(page, slug); await success(page);
        const note = notice(page), toggle = note.locator('summary'), details = note.locator('details');
        await expect(note).toContainText('折扣分攤與退款尚未完成對帳');
        await expect(page.getByRole('columnheader', { name: 'Margin %（估算）' })).toBeVisible();
        await expect(page.getByText('26.67%', { exact: true }).first()).toBeVisible();
        await tabToSummary(page);
        await expect(toggle).toBeFocused();
        await page.keyboard.press('Enter'); await expect(details).toHaveAttribute('open', '');
        await expect(note.getByText(/未使用成交時成本快照/)).toBeVisible();
        await capture(page, info, 'keyboard-open');
        await page.keyboard.press('Space'); await expect(details).not.toHaveAttribute('open');
        await toggle.click(); await expect(details).toHaveAttribute('open', '');
        await capture(page, info, 'pointer-open');
        await toggle.click(); await expect(details).not.toHaveAttribute('open');
        await expect(note.getByText('目前成本估算，非歷史實際毛利', { exact: true })).toBeVisible();
        await capture(page, info, 'closed');
      });
      test(`${slug} ${width}: initial error and recovery`, async ({ page, harness }, info) => {
        harness.handler = () => ({ status: 500 });
        await ready(page, slug);
        // Production QueryClient retries once. Do not change its policy for tests.
        await expect.poll(() => harness.responses.filter(status => status === 500).length).toBe(2);
        await expect(page.getByText(loadingFor(slug))).toHaveCount(0);
        await expect(notice(page)).toBeVisible();
        await expect(page.getByText(productName, { exact: true })).toHaveCount(0);
        await capture(page, info, 'initial-error');
        // Existing zero/empty error fallback is observed, not certified as good
        // error UX or repaired by this narrowly scoped warning acceptance.
        harness.handler = () => ({ status: 200, data: dataFor(slug) });
        await page.getByRole('button', { name: 'Refresh', exact: true }).click();
        await success(page); await capture(page, info, 'error-recovered');
      });
      test(`${slug} ${width}: refetch failure and recovery`, async ({ page, harness }, info) => {
        await ready(page, slug); await success(page);
        const hold = deferred(); harness.handler = () => hold.promise;
        const count = harness.reads.length;
        await page.getByRole('button', { name: 'Refresh', exact: true }).click();
        await expect.poll(() => harness.reads.length).toBe(count + 1);
        await success(page); await expect(notice(page)).toBeVisible();
        await capture(page, info, 'refetch-pending');
        harness.handler = () => ({ status: 500 }); hold.resolve({ status: 500 });
        await expect.poll(() => harness.responses.filter(status => status === 500).length).toBe(2);
        await success(page); await capture(page, info, 'refetch-failed');
        harness.handler = () => ({ status: 200, data: dataFor(slug) });
        const completed = harness.responses.length;
        await page.getByRole('button', { name: 'Refresh', exact: true }).click();
        await expect.poll(() => harness.responses.length).toBe(completed + 1);
        await success(page); await capture(page, info, 'refetch-recovered');
      });
      test(`${slug} ${width}: period change`, async ({ page, harness }, info) => {
        await ready(page, slug); await success(page);
        const hold = deferred(); harness.handler = () => hold.promise;
        await page.locator('input[type="month"]').fill('2026-09');
        await expect(page.getByText(loadingFor(slug))).toBeVisible();
        await expect(page.getByText(productName, { exact: true })).toHaveCount(0);
        await expect(notice(page)).toBeVisible();
        await capture(page, info, 'period-pending');
        expect(harness.reads.at(-1)).toContain('period=2026-09');
        hold.resolve({ status: 200, data: { ...dataFor(slug), period: '2026-09' } });
        await success(page); await expect(page.locator('input[type="month"]')).toHaveValue('2026-09');
        await capture(page, info, 'period-recovered');
      });
    });
  }
}
for (const width of [1440, 390]) {
  test.describe(`sort-${width}`, () => {
    test.use({ viewport: { width, height: width === 390 ? 844 : 900 } });
    test(`sales-ranking ${width}: quantity sort`, async ({ page, harness }, info) => {
      await ready(page, 'sales-ranking'); await success(page);
      const hold = deferred(); harness.handler = () => hold.promise;
      await page.getByRole('combobox').selectOption('quantity');
      await expect(page.getByText(loadingFor('sales-ranking'))).toBeVisible();
      await expect(notice(page)).toBeVisible();
      await capture(page, info, 'sort-pending');
      expect(harness.reads.at(-1)).toContain('sort=quantity&limit=20');
      hold.resolve({ status: 200, data: { ...ranking, topProducts: [...ranking.topProducts].reverse() } });
      await expect(page.getByRole('row').nth(1)).toContainText('合成數量第一商品');
      await expect(page.getByRole('row').nth(1)).toContainText('-10%');
      await expect(page.getByRole('combobox')).toHaveValue('quantity');
      await capture(page, info, 'sort-recovered');
    });
  });
}
