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
    const panel = page.getByRole('region', { name: '草稿保存' });
    for (const viewport of (width === 1440 ? [1366, 1024, width] : [width])) {
      await page.setViewportSize({ width: viewport, height: viewport === 1366 ? 768 : 900 });
      const save = panel.getByRole('button', { name: '保存草稿', exact: true });
      await save.focus();
      await expect(save).toBeInViewport({ ratio: 1 });
      await expect(panel).toContainText('有未保存變更');
      const rect = await panel.boundingBox(), line = await first.boundingBox();
      expect(rect!.y + rect!.height).toBeLessThanOrEqual(line!.y);
      expect(rect!.x).toBeGreaterThanOrEqual(0);
      expect(rect!.x + rect!.width).toBeLessThanOrEqual(viewport);
      if (viewport !== width) await capture(page, info, `before-save-${viewport}`);
    }
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

test('same-tenant peer cannot access or overwrite another owner’s saved draft', async ({ page, browser, harness }) => {
  const ownerTitle = '同租戶驗收 A 私人草稿';
  const peerTitle = '同租戶驗收 B 私人草稿';
  const save = async (actor: Page, title: string) => {
    await fresh(actor);
    await actor.getByLabel('草稿名稱').fill(title);
    const saved = actor.waitForResponse(r => r.request().method() === 'PUT' && r.url().includes('/receiving-drafts/'));
    await actor.getByRole('button', { name: '保存草稿', exact: true }).click();
    const result = await saved;
    expect(result.status()).toBe(200);
    const { data } = await result.json();
    await expect(actor.getByText('草稿已保存，尚未入庫。', { exact: true })).toBeVisible();
    expect(data.revision).toBe(1);
    return { url: result.url(), data, body: result.request().postDataJSON() };
  };
  await login(page);
  const owner = await save(page, ownerTitle);
  const otherContext = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1440, height: 900 } });
  await harness.watchPeer(otherContext);
  const peer = await otherContext.newPage();
  await login(peer, 'peer');
  const b = await save(peer, peerTitle);
  expect(b.data.ownerId).not.toBe(owner.data.ownerId);
  expect(b.data.tenantId).toBe(owner.data.tenantId);
  await peer.getByRole('button', { name: '關閉本頁草稿', exact: true }).click();
  await expect(peer.getByRole('button', { name: `${peerTitle} · v1`, exact: true })).toBeVisible();
  await expect(peer.getByRole('button', { name: `${ownerTitle} · v1`, exact: true })).toHaveCount(0);
  const deepLink = new URL('/receiving', owner.url);
  deepLink.searchParams.set('draft', owner.data.id);
  const denied = peer.waitForResponse(r => r.request().method() === 'GET' && r.url() === owner.url);
  await peer.goto(deepLink.href);
  const deniedRead = await denied;
  expect(deniedRead.status()).toBe(404);
  expect(await deniedRead.text()).not.toContain(ownerTitle);
  await expect(peer.getByText('草稿讀取失敗，請重試或回到清單；沒有建立替代草稿。', { exact: true })).toBeVisible();
  await expect(peer.getByLabel('草稿名稱')).toHaveCount(0);
  const probe = (actor: Page, url: string, body?: unknown) => actor.evaluate(async ({ url, body }) => {
    const token = localStorage.getItem('accessToken');
    if (!token || new URL(url).origin !== location.origin) throw new Error('Probe requires an authenticated same-origin browser');
    const response = await fetch(url, { method: body ? 'PUT' : 'GET',
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, body: await response.json() };
  }, { url, body });
  for (const suffix of ['/history', '/history/1']) {
    const result = await probe(peer, owner.url + suffix);
    expect(result.status).toBe(404);
    expect(JSON.stringify(result.body)).not.toContain(ownerTitle);
    expect(result.body.data).toBeUndefined();
  }
  const overwrite = await probe(peer, owner.url, { ...owner.body, expectedRevision: 1,
    payload: { ...owner.body.payload, title: '不應生效的覆寫' } });
  expect(overwrite.status).toBe(404);
  expect(overwrite.body.data).toBeUndefined();
  expect(JSON.stringify(overwrite.body)).not.toContain(ownerTitle);
  for (const suffix of ['', '/history/1']) {
    const unchanged = await probe(page, owner.url + suffix);
    expect(unchanged.status).toBe(200);
    expect(unchanged.body.data.revision).toBe(1);
    expect(unchanged.body.data.payload).toEqual(owner.data.payload);
  }
  const history = await probe(page, owner.url + '/history');
  expect(history.status).toBe(200);
  expect(history.body.data.map((version: { revision: number }) => version.revision)).toEqual([1]);
  harness.ownerIsolation = { ownerUrl: owner.url, peerUrl: b.url, ownerId: owner.data.ownerId,
    peerId: b.data.ownerId, tenantId: owner.data.tenantId };
});
