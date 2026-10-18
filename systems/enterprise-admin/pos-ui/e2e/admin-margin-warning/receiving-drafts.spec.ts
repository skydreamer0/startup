import { test, expect, origin } from './fixtures';
import type { Page, Locator, TestInfo } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import type { SavedReceivingDraft, SavedDraftPayload } from '../../../admin-ui/src/api/receivingDrafts';
const productId = '11111111-1111-4111-8111-111111111111';
const otherProductId = '22222222-2222-4222-8222-222222222222';
const path = '/receiving';
const api = '/api/v1/admin/receiving-drafts';
async function tabTo(page: Page, target: Locator) {
  for (let i = 0; i < 220; i++) { await page.keyboard.press('Tab'); if (await target.evaluate(el => document.activeElement === el)) return; }
  throw Error('Receiving control is not keyboard reachable');
}
async function capture(page: Page, info: TestInfo, name: string, target: Locator) {
  await tabTo(page, target); await expect(target).toBeFocused(); await target.scrollIntoViewIfNeeded(); await page.evaluate(() => document.fonts.ready);
  const geometry = await target.evaluate(el => { const b = el.getBoundingClientRect(); return { subject: 'receiving-draft', keyboardReachable: document.activeElement === el,
    target: { x: b.x, y: b.y, right: b.right, bottom: b.bottom, width: b.width, height: b.height }, viewport: { width: innerWidth, height: innerHeight }, documentWidth: document.documentElement.scrollWidth }; });
  expect(geometry.target.x).toBeGreaterThanOrEqual(0); expect(geometry.target.right).toBeLessThanOrEqual(geometry.viewport.width + 1);
  const png = info.outputPath(name+'.png'), json = info.outputPath(name+'.json'); await page.screenshot({ path: png }); await writeFile(json, JSON.stringify(geometry));
  await info.attach(name+'.png', { path: png, contentType: 'image/png' }); await info.attach(name+'.json', { path: json, contentType: 'application/json' });
}
function fixture(harness: { readerId?: string; receivingHandler?: (url: URL, method: string, body?: unknown) => any }) {
  const rows = new Map<string, SavedReceivingDraft>(), history = new Map<string, SavedReceivingDraft[]>();
  const control = { loseResponse: false, conflict: false, pause: null as null | Promise<void>, listFailure: false };
  harness.receivingHandler = async (url, method, raw) => {
    const endpoint = url.pathname;
    if (endpoint.endsWith('/inventory/products')) {
      const page = Number(url.searchParams.get('page') ?? 1); return { status: 200, data: { page, limit: 50, total: 51,
        data: [{ id: page === 1 ? productId : otherProductId, sku: `SYNTHETIC-${page}`, name: `合成分頁商品 ${page}` }] } };
    }
    if (endpoint === api) return control.listFailure ? { status: 500 } : { status: 200, data: { tenantId: 'synthetic-tenant', ownerId: harness.readerId ?? 'synthetic-user',
      data: [...rows.values()].filter(row => row.ownerId === (harness.readerId ?? 'synthetic-user')).map(row => ({ id: row.id, revision: row.revision, title: row.payload.title, updatedAt: row.updatedAt })), total: rows.size, page: 1, limit: 50 } };
    const match = new RegExp(`^${api}/([0-9a-f-]{36})(?:/history(?:/([1-9][0-9]*))?)?$`).exec(endpoint);
    if (!match) throw Error('Unexpected synthetic draft endpoint');
    const id = match[1];
    if (method === 'PUT') {
      expect(endpoint).toBe(api+'/'+id); expect(raw && Object.keys(raw).sort()).toEqual(['expectedRevision','payload']);
      const body = raw as { expectedRevision: number; payload: SavedDraftPayload };
      expect(body.payload.lines.length).toBeLessThanOrEqual(100); expect(body.payload.title).toMatch(/人工收貨草稿|合成/);
      if (control.pause) await control.pause;
      const current = rows.get(id);
      if (control.conflict) { control.conflict = false; const changed = { ...current!, revision: current!.revision + 1, payload: { ...current!.payload, title: '合成伺服器新版本' } }; rows.set(id, changed); history.get(id)!.push(structuredClone(changed)); return { status: 409 }; }
      if ((current?.revision ?? 0) !== body.expectedRevision) return { status: 409 };
      const row: SavedReceivingDraft = { id, revision: body.expectedRevision + 1, tenantId: 'synthetic-tenant', ownerId: harness.readerId ?? 'synthetic-user', updatedAt: '2026-10-10T12:00:00.000Z', payload: structuredClone(body.payload) };
      rows.set(id, row); history.set(id, [...(history.get(id) ?? []), structuredClone(row)]);
      const abort = control.loseResponse; control.loseResponse = false; return { status: 200, data: row, abort };
    }
    const row = rows.get(id); if (!row || row.ownerId !== (harness.readerId ?? 'synthetic-user')) return { status: 404 };
    if (match[2]) return { status: 200, data: history.get(id)!.find(item => item.revision === Number(match[2])) };
    if (endpoint.endsWith('/history')) return { status: 200, data: history.get(id)!.map(item => ({ revision: item.revision, createdAt: item.updatedAt })) };
    return { status: 200, data: row };
  };
  return { rows, history, control };
}
async function fresh(page: Page) { await page.goto(origin+path); await page.getByRole('button', { name: '新增私人草稿', exact: true }).click(); await expect(page.getByLabel('草稿名稱')).toBeVisible(); }
for (const width of [1440, 390]) test.describe(`receiving ${width}`, () => {
  test.use({ viewport: { width, height: 900 } });
  test(`receiving ${width}: ten-line save reopen history`, async ({ page, harness }, info) => {
    const state = fixture(harness); await fresh(page); await page.getByLabel('草稿名稱').fill('合成十行私人草稿');
    for (let i=0;i<10;i++) await page.getByRole('button', { name: '新增一行', exact: true }).click();
    await expect(page.locator('fieldset')).toHaveCount(10);
    const first = page.locator('fieldset').first(); await first.getByLabel('商品', { exact: true }).selectOption(productId);
    await first.getByLabel('實收單位（人工核對）').fill('盒'); await first.getByLabel('實到數量', { exact: true }).fill('2');
    await first.getByLabel('批號', { exact: true }).fill('SYNTHETIC-LOT'); await first.getByLabel('完整效期 YYYY-MM-DD').fill('2028-12-31');
    await first.getByRole('button', { name: '核對此行資料', exact: true }).click(); await expect(first.locator('legend')).toContainText('已核對');
    await first.getByLabel('實到數量', { exact: true }).fill('3'); await expect(first.locator('legend')).toContainText('待核對');
    await page.getByRole('button', { name: '商品下一頁', exact: true }).click(); await expect(page.getByText('商品第 2 頁', { exact: false })).toBeVisible();
    await expect(first.getByLabel('商品', { exact: true })).toHaveValue(productId); await expect(first.getByLabel('商品', { exact: true }).locator('option:checked')).toContainText('本頁未載入');
    await capture(page, info, 'receiving-before', page.getByRole('button', { name: '保存草稿', exact: true })); await page.keyboard.press('Enter');
    await expect(page.getByText('草稿已保存，尚未入庫。', { exact: true })).toBeVisible(); expect([...state.rows.values()][0].payload.lines).toHaveLength(10);
    await page.getByRole('button', { name: '關閉本頁草稿', exact: true }).click(); await page.getByRole('button', { name: '合成十行私人草稿 · v1', exact: true }).click();
    await expect(page.locator('fieldset')).toHaveCount(10); await expect(page.locator('fieldset').first().getByLabel('實到數量', { exact: true })).toHaveValue('3');
    await page.getByRole('button', { name: '查看版本歷史', exact: true }).click(); await page.getByRole('button', { name: /^版本 1 ·/ }).click();
    await expect(page.getByText('歷史版本 1，僅供核對，不會覆蓋目前草稿。', { exact: true })).toBeVisible(); await expect(page.getByRole('button', { name: '保存草稿', exact: true })).toBeDisabled();
    await capture(page, info, 'receiving-after', page.getByRole('button', { name: '收起版本歷史', exact: true }));
    expect(harness.receivingRequests.filter(x=>x.method==='PUT')).toHaveLength(1);
  });
  test(`receiving ${width}: lost response and navigation`, async ({ page, harness }, info) => {
    const state = fixture(harness); await fresh(page); await page.getByLabel('草稿名稱').fill('合成失回應草稿');
    await page.getByRole('button', { name: '關閉本頁草稿', exact: true }).click(); await expect(page.getByRole('dialog', { name: '確認放棄未保存內容' })).toBeVisible(); await page.getByRole('button', { name: '繼續編輯', exact: true }).click(); await expect(page.getByLabel('草稿名稱')).toHaveValue('合成失回應草稿');
    await page.locator('a[href="/inventory"]').click(); await expect(page.getByRole('dialog', { name: '離開草稿確認' })).toBeVisible(); await page.getByRole('button', { name: '留在草稿', exact: true }).click();
    await page.goBack(); await expect(page.getByRole('dialog', { name: '離開草稿確認' })).toBeVisible(); await page.getByRole('button', { name: '留在草稿', exact: true }).click();
    let release!: () => void; state.control.pause = new Promise<void>(resolve => { release = resolve; }); state.control.loseResponse = true;
    await page.getByRole('button', { name: '保存草稿', exact: true }).click(); await expect(page.getByText('保存中，請等待確認…', { exact: true })).toBeVisible();
    await page.locator('a[href="/inventory"]').click(); await expect(page.getByRole('button', { name: '放棄未保存變更並離開', exact: true })).toBeDisabled(); await page.getByRole('button', { name: '留在草稿', exact: true }).click();
    release(); await expect(page.getByRole('button', { name: '查回保存結果', exact: true })).toBeVisible();
    await page.locator('a[href="/inventory"]').click(); await expect(page.getByRole('button', { name: '放棄未保存變更並離開', exact: true })).toBeDisabled(); await page.getByRole('button', { name: '留在草稿', exact: true }).click();
    await capture(page, info, 'receiving-before', page.getByRole('button', { name: '查回保存結果', exact: true })); await page.keyboard.press('Enter');
    await expect(page.getByText('查回內容與本次草稿完全一致，已確認保存，沒有再次送出。', { exact: true })).toBeVisible(); expect(new URL(page.url()).searchParams.get('draft')).toBe([...state.rows.keys()][0]);
    await page.reload(); await expect(page.getByLabel('草稿名稱')).toHaveValue('合成失回應草稿'); await expect(page.getByRole('button', { name: '保存草稿', exact: true })).toBeDisabled();
    await capture(page, info, 'receiving-after', page.getByRole('button', { name: '查看版本歷史', exact: true })); expect(harness.receivingRequests.filter(x=>x.method==='PUT')).toHaveLength(1);
  });
  test(`receiving ${width}: CAS explicit choice`, async ({ page, harness }, info) => {
    const state = fixture(harness); await fresh(page); await page.getByRole('button', { name: '保存草稿', exact: true }).click(); await expect(page.getByText('草稿已保存，尚未入庫。', { exact: true })).toBeVisible();
    await page.getByLabel('草稿名稱').fill('合成本頁修改'); state.control.conflict = true;
    await page.getByRole('button', { name: '保存草稿', exact: true }).click(); await page.getByRole('button', { name: '查回保存結果', exact: true }).click();
    await expect(page.getByRole('region', { name: '伺服器版本比較' })).toBeVisible(); await expect(page.getByLabel('草稿名稱')).toHaveValue('合成本頁修改');
    await capture(page, info, 'receiving-before', page.getByRole('button', { name: '保留本頁內容，準備另存下一版', exact: true })); await page.keyboard.press('Enter');
    state.control.listFailure = true; await page.getByRole('button', { name: '保存草稿', exact: true }).click(); await expect(page.getByText('草稿已保存，尚未入庫。', { exact: true })).toBeVisible(); await expect(page.getByRole('button', { name: '重試清單', exact: true })).toBeVisible();
    await expect(page.getByLabel('草稿名稱')).toHaveValue('合成本頁修改'); await expect(page.getByRole('button', { name: '保存草稿', exact: true })).toBeDisabled(); expect([...state.rows.values()][0].revision).toBe(3);
    state.control.listFailure = false; await page.getByRole('button', { name: '重試清單', exact: true }).click();
    await capture(page, info, 'receiving-after', page.getByRole('button', { name: '查看版本歷史', exact: true })); expect(harness.receivingRequests.filter(x=>x.method==='PUT').map(x=>(x.body as { expectedRevision: number }).expectedRevision)).toEqual([0,1,2]);
  });
});
test('receiving 1440: identity and invalid URL', async ({ page, harness }, info) => {
  await page.setViewportSize({width:1440,height:900}); fixture(harness); await page.goto(origin+path+'?draft=new-');
  await expect(page.getByText('草稿連結格式無效，請回到清單重新選取。', { exact: true })).toBeVisible(); await page.getByRole('button', { name: '回到草稿清單', exact: true }).click(); await page.getByRole('button', { name: '新增私人草稿', exact: true }).click();
  await page.getByLabel('草稿名稱').fill('合成舊身份私人草稿'); await capture(page, info, 'receiving-before', page.getByRole('button', { name: '保存草稿', exact: true }));
  await tabTo(page,page.getByRole('button',{name:'Logout',exact:true})); await page.keyboard.press('Enter'); await expect(page.locator('#login-email')).toBeVisible(); await expect(page.getByLabel('草稿名稱')).toHaveCount(0);
  harness.readerId='synthetic-other-reader'; await page.locator('#login-email').fill('synthetic@example.invalid'); await page.locator('#login-password').fill('synthetic-password-not-a-credential'); await page.locator('#login-submit').click(); await page.locator(`a[href="${path}"]`).click();
  await expect(page.getByText('尚無已保存草稿。',{exact:true})).toBeVisible(); expect(await page.locator('input').evaluateAll(inputs=>inputs.map(x=>(x as HTMLInputElement).value))).not.toContain('合成舊身份私人草稿');
  await capture(page,info,'receiving-after',page.getByRole('button',{name:'新增私人草稿',exact:true})); expect(harness.receivingRequests.filter(x=>x.method==='PUT')).toEqual([]);
});
