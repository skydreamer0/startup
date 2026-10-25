import { test, expect, login, capture, browserFixture } from './fixtures';
import type { Page } from '@playwright/test';

async function fresh(page: Page) {
  await page.getByRole('button', { name: '新增私人草稿', exact: true }).click();
  await expect(page.getByLabel('草稿名稱')).toBeVisible();
}

for (const width of [1440, 390]) test.describe(`receiving real API ${width}`, () => {
  test.use({ viewport: { width, height: 900 } });

  test('real login, ten-line save, reopen and immutable history', async ({ page }, info) => {
    await login(page); await fresh(page); await page.getByLabel('草稿名稱').fill(`真 API 十行草稿 ${width}`);
    for (let i = 0; i < 10; i++) await page.getByRole('button', { name: '新增一行', exact: true }).click();
    await expect(page.locator('fieldset')).toHaveCount(10);
    const first = page.locator('fieldset').first();
    await first.getByRole('combobox', { name: '商品', exact: true }).selectOption((await browserFixture()).productId);
    await first.getByLabel('實收單位（人工核對）').fill('盒');
    await first.getByLabel('實到數量', { exact: true }).fill('2');
    await first.getByLabel('批號', { exact: true }).fill('SYNTHETIC-LOT');
    await first.getByLabel('完整效期 YYYY-MM-DD').fill('2028-12-31');
    await first.getByRole('button', { name: '核對此行資料', exact: true }).click();
    await expect(first.locator('legend')).toContainText('已核對');
    await first.getByLabel('實到數量', { exact: true }).fill('3');
    await expect(first.locator('legend')).toContainText('待核對');
    await capture(page, info, 'before-save');
    await page.getByRole('button', { name: '保存草稿', exact: true }).click();
    await expect(page.getByText('草稿已保存，尚未入庫。', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '關閉本頁草稿', exact: true }).click();
    await page.getByRole('button', { name: `真 API 十行草稿 ${width} · v1`, exact: true }).click();
    await expect(page.locator('fieldset')).toHaveCount(10);
    await expect(page.locator('fieldset').first().getByLabel('實到數量', { exact: true })).toHaveValue('3');
    await page.getByRole('button', { name: '查看版本歷史', exact: true }).click();
    await page.getByRole('button', { name: /^版本 1 ·/ }).click();
    await expect(page.getByText('歷史版本 1，僅供核對，不會覆蓋目前草稿。', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '保存草稿', exact: true })).toBeDisabled();
    await capture(page, info, 'readonly-history');
  });

  test('lost committed response resolves by GET without a second PUT', async ({ page }, info) => {
    await login(page); await fresh(page); await page.getByLabel('草稿名稱').fill(`失回應真 API 草稿 ${width}`);
    const put = page.waitForRequest(request => request.method() === 'PUT' && request.url().includes('/receiving-drafts/'));
    await page.route('**/api/v1/admin/receiving-drafts/*', async route => {
      if (route.request().method() !== 'PUT') return route.fallback();
      const actual = await route.fetch();
      expect(actual.status()).toBe(200);
      await actual.dispose();
      await route.abort('failed');
    });
    await page.getByRole('button', { name: '保存草稿', exact: true }).click(); await put;
    await expect(page.getByRole('button', { name: '查回保存結果', exact: true })).toBeVisible();
    await capture(page, info, 'unknown-outcome');
    const get = page.waitForRequest(request => request.method() === 'GET' && /\/receiving-drafts\/[0-9a-f-]{36}$/.test(new URL(request.url()).pathname));
    await page.getByRole('button', { name: '查回保存結果', exact: true }).click(); await get;
    await expect(page.getByText('查回內容與本次草稿完全一致，已確認保存，沒有再次送出。', { exact: true })).toBeVisible();
    await page.reload(); await expect(page.getByLabel('草稿名稱')).toHaveValue(`失回應真 API 草稿 ${width}`);
    await expect(page.getByRole('button', { name: '保存草稿', exact: true })).toBeDisabled();
  });

  test('two real pages race the same revision and expose an explicit CAS choice', async ({ page, context }, info) => {
    await login(page); await fresh(page); await page.getByLabel('草稿名稱').fill(`CAS 真 API 草稿 ${width}`);
    await page.getByRole('button', { name: '保存草稿', exact: true }).click(); await expect(page.getByText('草稿已保存，尚未入庫。', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '關閉本頁草稿', exact: true }).click();
    await page.getByRole('button', { name: `CAS 真 API 草稿 ${width} · v1`, exact: true }).click();
    const second = await context.newPage(); await second.goto(page.url()); await expect(second.getByLabel('草稿名稱')).toHaveValue(`CAS 真 API 草稿 ${width}`);
    await page.getByLabel('草稿名稱').fill('CAS 真 API 勝者 A'); await second.getByLabel('草稿名稱').fill('CAS 真 API 勝者 B');
    const requests = [page.waitForResponse(r => r.request().method() === 'PUT' && r.url().includes('/receiving-drafts/')),
      second.waitForResponse(r => r.request().method() === 'PUT' && r.url().includes('/receiving-drafts/'))];
    await Promise.all([page.getByRole('button', { name: '保存草稿', exact: true }).click(), second.getByRole('button', { name: '保存草稿', exact: true }).click()]);
    const responses = await Promise.all(requests); expect(responses.map(r => r.status()).sort()).toEqual([200, 409]);
    const loser = responses[0].status() === 409 ? page : second;
    const winner = loser === page ? second : page;
    await expect(winner.getByText('草稿已保存，尚未入庫。', { exact: true })).toBeVisible();
    await loser.getByRole('button', { name: '查回保存結果', exact: true }).click();
    await expect(loser.getByRole('region', { name: '伺服器版本比較' })).toBeVisible();
    await expect(loser.getByRole('button', { name: '保留本頁內容，準備另存下一版', exact: true })).toBeVisible();
    await capture(loser, info, 'cas-choice');
  });
});

test('unsaved close cancellation retains content; malformed URL and identity are isolated', async ({ page }, info) => {
  await login(page); await page.goto('http://127.0.0.1:4287/receiving?draft=new-');
  await expect(page.getByText('草稿連結格式無效，請回到清單重新選取。', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '回到草稿清單', exact: true }).click(); await fresh(page);
  await page.getByLabel('草稿名稱').fill('切換身份前未保存內容');
  await page.getByRole('button', { name: '關閉本頁草稿', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '確認放棄未保存內容' })).toBeVisible();
  await page.getByRole('button', { name: '繼續編輯', exact: true }).click();
  await expect(page.getByLabel('草稿名稱')).toHaveValue('切換身份前未保存內容');
  await capture(page, info, 'unsaved-content-retained');
  await page.getByRole('button', { name: 'Logout', exact: true }).click();
  await page.locator('#login-email').fill((JSON.parse(await (await import('node:fs/promises')).readFile(process.env.RECEIVING_BROWSER_CREDENTIAL_FILE!, 'utf8'))).secondEmail);
  await page.locator('#login-password').fill((JSON.parse(await (await import('node:fs/promises')).readFile(process.env.RECEIVING_BROWSER_CREDENTIAL_FILE!, 'utf8'))).secondPassword);
  await page.locator('#login-submit').click(); await page.locator('a[href="/receiving"]').click();
  await expect(page.getByText('尚無已保存草稿。', { exact: true })).toBeVisible();
  await expect(page.getByText('切換身份前未保存內容', { exact: true })).toHaveCount(0);
});
