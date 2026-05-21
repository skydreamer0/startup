import { PosProduct } from '../api/pos';
import { useCartStore } from '../store/cartStore';

interface Props {
  product: PosProduct;
}

function stockLabel(product: PosProduct): { label: string; color: string; bg: string } {
  if (product.stockQuantity <= 0) return { label: '缺貨', color: '#DC2626', bg: '#FEF2F2' };
  if (product.safetyStock && product.stockQuantity <= product.safetyStock) {
    return { label: `⚠ 低庫存 ${product.stockQuantity}`, color: '#D97706', bg: '#FEF3C7' };
  }
  return { label: `✓ ${product.stockQuantity} 件`, color: '#4A7C59', bg: '#ECFDF5' };
}

function productEmoji(product: PosProduct): string {
  const sku = product.sku?.toUpperCase() ?? '';
  const name = product.name ?? '';
  if (sku.startsWith('HS-FISH') || name.includes('魚油')) return '🐟';
  if (sku.startsWith('HS-VITA') || name.includes('維他命') || name.includes('維生素')) return '🍋';
  if (sku.startsWith('HS-PROB') || name.includes('益生菌')) return '🌿';
  if (sku.startsWith('HS-CALC') || name.includes('鈣')) return '🦴';
  if (sku.startsWith('OTC-PAIN') || name.includes('普拿疼') || name.includes('止痛')) return '💊';
  if (sku.startsWith('OTC-') || name.includes('藥')) return '💊';
  if (sku.startsWith('HS-')) return '🌿';
  return '📦';
}

export default function ProductCard({ product }: Props) {
  const addItem = useCartStore((state) => state.addItem);
  const outOfStock = product.stockQuantity <= 0;
  const { label, color, bg } = stockLabel(product);
  const emoji = productEmoji(product);

  return (
    <button
      type="button"
      data-testid={`product-card-${product.id}`}
      onClick={() => !outOfStock && addItem(product)}
      disabled={outOfStock}
      style={{
        display: 'flex',
        flexDirection: 'column',
        padding: '14px 14px',
        background: 'var(--bg-card)',
        border: '1.5px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        cursor: outOfStock ? 'not-allowed' : 'pointer',
        textAlign: 'left',
        opacity: outOfStock ? 0.45 : 1,
        transition: 'transform var(--transition-fast), box-shadow var(--transition-fast)',
        boxShadow: 'var(--shadow-card)',
      }}
      onMouseEnter={e => {
        if (!outOfStock) {
          (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
          (e.currentTarget as HTMLElement).style.boxShadow = '0 6px 16px rgba(61,43,31,0.12)';
        }
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.transform = 'none';
        (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-card)';
      }}
    >
      {/* Emoji icon */}
      <div style={{
        width: 38, height: 38, borderRadius: 12,
        background: 'var(--accent-subtle)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 20, marginBottom: 10, flexShrink: 0,
      }}>
        {emoji}
      </div>

      {/* Name */}
      <span style={{
        fontWeight: 700, fontSize: 13, color: 'var(--text-primary)',
        lineHeight: 1.4,
        overflow: 'hidden', display: '-webkit-box',
        WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        marginBottom: 4,
      }}>
        {product.name}
      </span>

      {/* SKU */}
      <span style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
        {product.sku}
      </span>

      {/* Price + stock */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 900, color: 'var(--accent)', fontSize: 22, letterSpacing: '-0.02em' }}>
          ${Number(product.retailPrice).toLocaleString()}
        </span>
        <span style={{ fontSize: 11, color, background: bg, fontWeight: 600, padding: '3px 9px', borderRadius: 'var(--radius-full)' }}>
          {label}
        </span>
      </div>
    </button>
  );
}
