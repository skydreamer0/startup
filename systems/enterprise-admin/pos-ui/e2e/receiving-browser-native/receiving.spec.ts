import { test, expect, login, capture, browserFixture, type NavigationGuard } from './fixtures';
import type { Page, TestInfo } from '@playwright/test';

async function fresh(page: Page) {
  await page.getByRole('button', { name: '新增私人草稿', exact: true }).click();
  await expect(page.getByLabel('草稿名稱')).toBeVisible();
}

async function verifyBlockedBack(page: Page, info: TestInfo, phase: 'pending' | 'unknown', expectedTitle: string,
  harness: { saveCalls: number; navigationGuards: NavigationGuard[] }) {
  const fromUrl = page.url();
  await page.goBack();
  const dialog = page.getByRole('dialog', { name: '離開草稿確認', exact: true });
  const discard = dialog.getByRole('button', { name: '放棄未保存變更並離開', exact: true });
  await expect(dialog).toBeVisible();
  await expect(discard).toBeDisabled();
  await expect(page).toHaveURL(fromUrl);
  await expect(page.getByLabel('草稿名稱')).toHaveValue(expectedTitle);
  const observed = { phase, action: 'back' as const, fromUrl, blockedUrl: page.url(),
    dialogVisible: await dialog.isVisible(), discardDisabled: await discard.isDisabled() };
  await capture(page, info, `${phase}-back-blocked`);
  await dialog.getByRole('button', { name: '留在草稿', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(fromUrl);
  await expect(page.getByLabel('草稿名稱')).toHaveValue(expectedTitle);
  expect(harness.saveCalls).toBe(1);
  harness.navigationGuards.push({ ...observed, retainedUrl: page.url(), expectedTitle,
    retainedTitle: await page.getByLabel('草稿名稱').inputValue(), saveCalls: harness.saveCalls });
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

  test('lost committed response resolves by GET without a second PUT', async ({ page, harness }, info) => {
    const title = `失回應真 API 草稿 ${width}`;
    await login(page); await fresh(page); await page.getByLabel('草稿名稱').fill(title);
    let releaseResponse!: () => void;
    const responseGate = new Promise<void>(resolve => { releaseResponse = resolve; });
    let committedResponseHeld = false;
    await page.route('**/api/v1/admin/receiving-drafts/*', async route => {
      if (route.request().method() !== 'PUT') return route.fallback();
      const actual = await route.fetch({ timeout: 10_000 });
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        expect(actual.status()).toBe(200);
        committedResponseHeld = true;
        // Delay only the real committed response at the outer transport boundary.
        // The held response is released in finally even when a guard assertion fails.
        await Promise.race([responseGate, new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error('Pending navigation observation timed out')), 20_000);
        })]);
      } finally { clearTimeout(timer); await actual.dispose(); }
      await route.abort('failed');
    });
    try {
      await page.getByRole('button', { name: '保存草稿', exact: true }).click();
      await expect.poll(() => committedResponseHeld).toBe(true);
      await expect(page.getByText('保存中，請等待確認…', { exact: true })).toBeVisible();
      await verifyBlockedBack(page, info, 'pending', title, harness);
    } finally { releaseResponse(); }
    await expect(page.getByRole('button', { name: '查回保存結果', exact: true })).toBeVisible();
    await verifyBlockedBack(page, info, 'unknown', title, harness);
    await capture(page, info, 'unknown-outcome');
    const get = page.waitForRequest(request => request.method() === 'GET' && /\/receiving-drafts\/[0-9a-f-]{36}$/.test(new URL(request.url()).pathname));
    await page.getByRole('button', { name: '查回保存結果', exact: true }).click(); await get;
    await expect(page.getByText('查回內容與本次草稿完全一致，已確認保存，沒有再次送出。', { exact: true })).toBeVisible();
    await page.reload(); await expect(page.getByLabel('草稿名稱')).toHaveValue(title);
    await expect(page.getByRole('button', { name: '保存草稿', exact: true })).toBeDisabled();
    expect(harness.saveCalls).toBe(1);
  });

  test('two real pages race the same revision and expose an explicit CAS choice', async ({ page, context, harness }, info) => {
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
    const originalTitle = `CAS 真 API 草稿 ${width}`;
    const winnerTitle = await winner.getByLabel('草稿名稱').inputValue();
    const retainedTitle = await loser.getByLabel('草稿名稱').inputValue();
    const draftUrl = responses[0].url();
    await loser.getByRole('button', { name: '保留本頁內容，準備另存下一版', exact: true }).click();
    await expect(loser.getByLabel('草稿名稱')).toHaveValue(retainedTitle);
    await expect(loser.getByText('伺服器版本 2 · 有未保存變更', { exact: true })).toBeVisible();
    expect(harness.saveCalls).toBe(3); // The choice itself must not save automatically.
    const nextSave = loser.waitForResponse(response => response.request().method() === 'PUT' && response.url() === draftUrl);
    await loser.getByRole('button', { name: '保存草稿', exact: true }).click();
    const savedResponse = await nextSave;
    expect(savedResponse.status()).toBe(200);
    expect(savedResponse.request().postDataJSON().expectedRevision).toBe(2);
    const savedBody = await savedResponse.json();
    expect(savedBody.success).toBe(true);
    expect(savedBody.data.id).toBe(new URL(draftUrl).pathname.split('/').pop());
    expect(savedBody.data.revision).toBe(3);
    expect(savedBody.data.payload.title).toBe(retainedTitle);
    await expect(loser.getByText('草稿已保存，尚未入庫。', { exact: true })).toBeVisible();
    const readback = loser.waitForResponse(response => response.request().method() === 'GET' && response.url() === draftUrl);
    await loser.reload();
    const reopenedResponse = await readback;
    expect(reopenedResponse.status()).toBe(200);
    const reopenedBody = await reopenedResponse.json();
    expect(reopenedBody.success).toBe(true);
    expect(reopenedBody.data.id).toBe(savedBody.data.id);
    expect(reopenedBody.data.revision).toBe(3);
    expect(reopenedBody.data.payload.title).toBe(retainedTitle);
    await expect(loser.getByLabel('草稿名稱')).toHaveValue(retainedTitle);
    await expect(loser.getByText('伺服器版本 3 · 已保存', { exact: true })).toBeVisible();
    await expect(loser.getByRole('button', { name: '保存草稿', exact: true })).toBeDisabled();
    const reopenedTitle = await loser.getByLabel('草稿名稱').inputValue();
    await loser.getByRole('button', { name: '查看版本歷史', exact: true }).click();
    const history: { revision: number; title: string }[] = [];
    for (const [revision, expectedTitle] of [[1, originalTitle], [2, winnerTitle], [3, retainedTitle]] as const) {
      const versionResponse = loser.waitForResponse(response => response.request().method() === 'GET' && response.url() === `${draftUrl}/history/${revision}`);
      await loser.getByRole('button', { name: new RegExp(`^版本 ${revision} ·`) }).click();
      const response = await versionResponse;
      expect(response.status()).toBe(200);
      const versionBody = await response.json();
      expect(versionBody.success).toBe(true);
      expect(versionBody.data.id).toBe(savedBody.data.id);
      expect(versionBody.data.revision).toBe(revision);
      expect(versionBody.data.payload.title).toBe(expectedTitle);
      await expect(loser.getByText(`歷史版本 ${revision}，僅供核對，不會覆蓋目前草稿。`, { exact: true })).toBeVisible();
      const displayed = await loser.getByRole('region', { name: '私人草稿版本歷史' }).locator('pre').innerText();
      expect(JSON.parse(displayed)).toEqual(versionBody.data.payload);
      await expect(loser.getByLabel('草稿名稱')).toHaveValue(retainedTitle);
      history.push({ revision: versionBody.data.revision, title: versionBody.data.payload.title });
    }
    expect(harness.saveCalls).toBe(4);
    harness.casResolution = { draftUrl, expectedRevision: savedResponse.request().postDataJSON().expectedRevision,
      savedRevision: savedBody.data.revision, originalTitle, winnerTitle, retainedTitle, reopenedTitle, reopenedRevision: reopenedBody.data.revision, history };
    await capture(loser, info, 'cas-retained-v3-history');

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
