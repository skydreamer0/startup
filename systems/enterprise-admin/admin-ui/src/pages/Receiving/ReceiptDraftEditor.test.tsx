import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, test } from 'vitest';
import ReceiptDraftEditor from './ReceiptDraftEditor';
import { createDraft, addLine, reviewLine } from '../../domain/receiptDraft';
import { createReceiptWorkspace } from '../../domain/receiptDraftWorkspace';
import type { ReceiptDraft } from '../../domain/receiptDraft';
let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement;
let latest: ReceiptDraft;
afterEach(async () => { await act(async () => root?.unmount()); host?.remove(); });
const raw = { productId: 'p1', baseUnit: '盒', batchNumber: 'LOT-1', expiryDate: '2028-02-29', quantity: '6', note: '單據 A' };
async function mount(initial: ReceiptDraft, state: 'loading' | 'ready' | 'error' = 'ready', disabled = false) {
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  const workspace = createReceiptWorkspace(); workspace.open(workspace.getSnapshot(), { tenantId: 'fixture', actorId: 'actor' }, initial);
  function Harness() {
    const [view, setView] = useState(workspace.getSnapshot());
    if (view.status !== 'open') return null;
    latest = view.draft;
    return <ReceiptDraftEditor draft={view.draft} products={[{ id: 'p1', sku: 'SKU-1', name: '測試商品' }]}
      productsState={state} disabled={disabled} onProductsRetry={() => {}}
      dispatch={command => setView(workspace.dispatch(view, command))} />;
  }
  await act(async () => root!.render(<Harness />));
}
async function click(text: string, index = 0) {
  const button = [...host.querySelectorAll('button')].filter(b => b.textContent === text)[index]!;
  await act(async () => button.click());
}
async function change(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
}
test('ten lines allow eight reviewed and two unresolved without posting controls', async () => {
  let draft = createDraft('d');
  for (let i = 0; i < 10; i++) draft = addLine(draft, draft.revision, `l${i}`, i < 8 ? raw : {});
  await mount(draft);
  for (let i = 0; i < 8; i++) await click('核對此行資料', i);
  expect(latest.lines.filter(line => line.review).length).toBe(8);
  expect(host.textContent).toContain('2 行待補資料');
  expect([...host.querySelectorAll('button')].some(b => /入庫|過帳/.test(b.textContent ?? ''))).toBe(false);
});
test('editing critical quantity invalidates current row review and keeps raw quantity', async () => {
  let d = addLine(createDraft('d'), 0, 'l1', raw); d = reviewLine(d, d.revision, 'l1', 'actor');
  await mount(d); await change(host.querySelector('input[id$="-quantity"]')!, '0004.00');
  expect(latest.lines[0].fields.quantity).toBe('0004.00'); expect(latest.lines[0].review).toBeNull();
});
test('unknown expiry remains blank, invalid and retainable without fabricated date', async () => {
  await mount(addLine(createDraft('d'), 0, 'l1', { ...raw, expiryDate: '' }));
  const button = [...host.querySelectorAll('button')].find(b => b.textContent === '核對此行資料')!;
  expect(button.disabled).toBe(true); expect(latest.lines[0].fields.expiryDate).toBe('');
});
test('failed product reads preserve selected identity and do not report an empty catalogue', async () => {
  await mount(addLine(createDraft('d'), 0, 'l1', { ...raw, productId: 'old-product' }), 'error');
  expect(host.textContent).toContain('商品載入失敗'); expect(host.textContent).not.toContain('尚無可選商品');
  expect(host.querySelector('select')!.value).toBe('old-product'); expect(host.querySelector('select')!.disabled).toBe(true);
});
test('pending save disables input and row actions; repeated activation cannot mutate', async () => {
  await mount(addLine(createDraft('d'), 0, 'l1', raw), 'ready', true);
  await click('移除此行'); await click('新增一行');
  expect(latest.lines.length).toBe(1); expect(host.querySelector('fieldset')!.disabled).toBe(true);
});
