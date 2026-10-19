import { useId } from 'react';
import { issuesFor, summarizeDraft } from '../../domain/receiptDraft';
import type { ReceiptDraft, ReceiptFields } from '../../domain/receiptDraft';
import type { WorkspaceCommand } from '../../domain/receiptDraftWorkspace';
import './ReceiptDraftEditor.css';

export type ReceiptProductOption = { id: string; sku: string; name: string };
const labels: Record<keyof ReceiptFields, string> = {
  productId: '商品', baseUnit: '實收單位（人工核對）', batchNumber: '批號',
  expiryDate: '完整效期 YYYY-MM-DD', quantity: '實到數量', note: '一般備註',
  orderedQuantity: '單據／訂貨數量', quarantineQuantity: '待隔離數量', rejectedQuantity: '拒收數量',
  packageDescription: '包裝描述（人工記錄）', unitCost: '單位成本（原文，未入帳）', sourceReference: '來源單據編號／版本',
};

/** Draft data checks only. No receipt, stock release or posting client is imported. */
export default function ReceiptDraftEditor({ draft, products, productsState, disabled, dispatch, onProductsRetry }: {
  draft: ReceiptDraft; products: readonly ReceiptProductOption[];
  productsState: 'loading' | 'ready' | 'error'; disabled: boolean;
  dispatch: (command: WorkspaceCommand) => void; onProductsRetry: () => void;
}) {
  const prefix = useId();
  const summary = summarizeDraft(draft);
  return <section className="receipt-draft-editor" aria-label="收貨草稿明細">
    <p role="status">{draft.lines.length} 行，{summary.reviewed.length} 行已核對，{summary.needsReview.length} 行待核對，{summary.invalid.length} 行待補資料。</p>
    <p>核對只記錄本份草稿的資料確認，不表示已收貨、已入庫或可售。單位不做自動換算；未知批號與效期請留空。單據、實到、隔離、拒收及成本都是人工草稿，不計算可售量或金額。</p>
    {productsState === 'loading' && <p role="status">載入商品中，已有輸入保留。</p>}
    {productsState === 'error' && <p role="alert">商品載入失敗，請重試；不會更換已選商品。<button type="button" onClick={onProductsRetry} disabled={disabled}>重試商品</button></p>}
    {productsState === 'ready' && products.length === 0 && <p>尚無可選商品，可先保留未完成草稿。</p>}
    {draft.lines.map((line, index) => {
      const invalid = issuesFor(line.fields);
      const selected = products.find(item => item.id === line.fields.productId);
      return <fieldset key={line.id} disabled={disabled}>
        <legend>第 {index + 1} 行 · {line.review ? '已核對' : '待核對'}</legend>
        <div className="receipt-draft-fields">
          <label htmlFor={`${prefix}-${line.id}-productId`}>商品
            <select id={`${prefix}-${line.id}-productId`} value={line.fields.productId}
              disabled={productsState !== 'ready'} onChange={event => dispatch({ type: 'update', lineId: line.id, patch: { productId: event.target.value } })}>
              <option value="">尚未選定商品</option>
              {line.fields.productId && !selected && <option value={line.fields.productId}>已選商品 {line.fields.productId}（本頁未載入）</option>}
              {products.map(product => <option key={product.id} value={product.id}>{product.sku} · {product.name}</option>)}
            </select>
          </label>
          {(['baseUnit', 'orderedQuantity', 'quantity', 'quarantineQuantity', 'rejectedQuantity', 'batchNumber', 'expiryDate', 'packageDescription', 'unitCost', 'sourceReference', 'note'] as const).map(field => <label key={field} htmlFor={`${prefix}-${line.id}-${field}`}>{labels[field]}
            <input id={`${prefix}-${line.id}-${field}`} value={line.fields[field] ?? ''} maxLength={field === 'note' ? 1000 : 256}
              inputMode={field === 'quantity' ? 'decimal' : 'text'}
              aria-invalid={invalid.some(issue => issue.field === field) || undefined}
              onChange={event => dispatch({ type: 'update', lineId: line.id, patch: { [field]: event.target.value } })} />
          </label>)}
        </div>
        {invalid.length > 0 && <p>待補或核對：{invalid.map(issue => `${labels[issue.field]}${issue.code === 'required' ? '未填' : '格式不完整'}`).join('、')}。仍可保存草稿。</p>}
        <div className="receipt-draft-actions">
          <button type="button" disabled={invalid.length > 0 || productsState !== 'ready' || !selected || !!line.review}
            onClick={() => dispatch({ type: 'review', lineId: line.id })}>核對此行資料</button>
          <button type="button" disabled={!line.review} onClick={() => dispatch({ type: 'revokeReview', lineId: line.id })}>撤銷此行核對</button>
          <button type="button" onClick={() => dispatch({ type: 'remove', lineId: line.id })}>移除此行</button>
        </div>
      </fieldset>;
    })}
    <button type="button" disabled={disabled || draft.lines.length >= 100}
      onClick={() => dispatch({ type: 'add', lineId: crypto.randomUUID() })}>新增一行</button>
    {draft.lines.length >= 100 && <p>本份草稿已達 100 行。</p>}
  </section>;
}
