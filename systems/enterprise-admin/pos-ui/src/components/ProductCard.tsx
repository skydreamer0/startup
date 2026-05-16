import { PosProduct } from '../api/pos';
import { useCartStore } from '../store/cartStore';

interface Props {
  product: PosProduct;
}

function stockLabel(product: PosProduct): { label: string; color: string } {
  if (product.stockQuantity <= 0) return { label: '缺貨', color: '#EF4444' };
  if (product.safetyStock && product.stockQuantity <= product.safetyStock) {
    return { label: `低庫存 ${product.stockQuantity}`, color: '#F59E0B' };
  }
  return { label: `庫存 ${product.stockQuantity}`, color: '#10B981' };
}

export default function ProductCard({ product }: Props) {
  const addItem = useCartStore((state) => state.addItem);
  const outOfStock = product.stockQuantity <= 0;
  const { label, color } = stockLabel(product);

  return (
    <button
      type="button"
      onClick={() => !outOfStock && addItem(product)}
      disabled={outOfStock}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        padding: '12px',
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        cursor: outOfStock ? 'not-allowed' : 'pointer',
        textAlign: 'left',
        opacity: outOfStock ? 0.5 : 1,
        transition: 'var(--transition-fast)',
        minHeight: 90,
      }}
    >
      <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.3 }}>
        {product.name}
      </span>
      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{product.sku}</span>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
        <span style={{ fontWeight: 700, color: 'var(--accent)', fontSize: 14 }}>
          ${product.retailPrice.toFixed(0)}
        </span>
        <span style={{ fontSize: 11, color, fontWeight: 500 }}>{label}</span>
      </div>
    </button>
  );
}
