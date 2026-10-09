import { createPortal } from 'react-dom';
import type { BarcodeCandidateSelection } from '../hooks/useBarcodeScanner';

export function BarcodeCandidates({ selection }: { selection: BarcodeCandidateSelection | null }) {
  if (!selection) return null;
  return createPortal(<section aria-label="掃碼候選商品" className="pos-barcode-candidates rounded-xl border p-4 text-base"
    style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
    <p role="status" style={{ flexShrink: 0 }}>條碼／SKU {selection.code} 有多筆完全相符商品，請選擇一筆</p>
    <ul className="my-3 grid gap-2" style={{ minHeight: 0, overflowY: 'auto', padding: 4 }}>
      {selection.products.map((product) => <li key={product.id}>
        <button type="button" onClick={() => selection.select(product.id)}
          disabled={product.stockQuantity <= 0}
          className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border p-3 text-left text-base focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
          style={{ borderColor: 'var(--border)', outlineColor: 'var(--accent)' }}>
          <span className="min-w-0 break-words"><strong className="block">{product.name}</strong>
            <span className="block text-sm" style={{ color: 'var(--text-secondary)' }}>SKU {product.sku}{product.barcode ? ` · 條碼 ${product.barcode}` : ''}</span>
            {product.category && <span className="block text-sm">{product.category.name}</span>}
          </span>
          <span className="shrink-0 text-right tabular-nums">
            <span className="block">${Number(product.retailPrice).toLocaleString('zh-TW')}</span>
            <span className="block text-sm">{product.stockQuantity > 0 ? `帳面庫存 ${product.stockQuantity}` : '無庫存'}</span>
          </span>
        </button>
      </li>)}
    </ul>
    <button type="button" onClick={selection.dismiss}
      className="min-h-11 rounded-lg border px-4 text-base focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{ flexShrink: 0, alignSelf: 'flex-start', borderColor: 'var(--border)', outlineColor: 'var(--accent)' }}>取消選擇</button>
  </section>, document.body);
}
