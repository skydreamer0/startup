import { PosProduct } from '../api/pos';
import ProductCard from './ProductCard';

interface Props {
  products: PosProduct[];
  loading: boolean;
}

export default function ProductGrid({ products, loading }: Props) {
  if (loading) {
    return <div style={{ padding: 24, color: 'var(--text-muted)', textAlign: 'center' }}>載入中…</div>;
  }
  if (products.length === 0) {
    return <div style={{ padding: 24, color: 'var(--text-muted)', textAlign: 'center' }}>無符合商品</div>;
  }
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
        gap: 8,
        padding: 12,
        overflowY: 'auto',
        flex: 1,
      }}
    >
      {products.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </div>
  );
}
