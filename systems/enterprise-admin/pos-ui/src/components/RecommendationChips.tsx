import type { PosRecommendation } from '../api/pos';

interface Props {
  recommendations: PosRecommendation[];
  onAdd: (productId: string) => void;
}

function formatPrice(price: number) {
  return `$${price.toLocaleString('en-US')}`;
}

export default function RecommendationChips({ recommendations, onAdd }: Props) {
  if (recommendations.length === 0) return null;

  return (
    <div
      aria-label="Product recommendations"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        overflowX: 'auto',
        padding: '2px 0',
      }}
    >
      {recommendations.map((recommendation) => (
        <button
          key={recommendation.productId}
          type="button"
          aria-label={`Add ${recommendation.name}`}
          onClick={() => onAdd(recommendation.productId)}
          style={{
            minWidth: 172,
            maxWidth: 220,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            border: '1.5px solid #F4D7B4',
            borderRadius: 'var(--radius-md)',
            background: '#FFF7ED',
            color: 'var(--text-primary)',
            padding: '9px 11px',
            cursor: 'pointer',
            boxShadow: 'var(--shadow-card)',
            textAlign: 'left',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 28,
              height: 28,
              borderRadius: 'var(--radius-full)',
              background: '#FED7AA',
              color: '#9A3412',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 13,
              fontWeight: 900,
              flexShrink: 0,
            }}
          >
            AI
          </span>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, flex: 1 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {recommendation.name}
                </span>
                {recommendation.reason === 'REPLENISHMENT_DUE' && typeof recommendation.daysSincePurchase === 'number' && (
                  <span style={{ fontSize: 11, color: '#9A3412', fontWeight: 800, flexShrink: 0 }}>
                    {recommendation.daysSincePurchase}d
                  </span>
                )}
                {recommendation.reason === 'HOT_SELLER' && typeof recommendation.quantitySold === 'number' && (
                  <span style={{ fontSize: 11, color: '#9A3412', fontWeight: 800, flexShrink: 0 }}>
                    熱銷 {recommendation.quantitySold}
                  </span>
                )}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {recommendation.reason === 'HOT_SELLER' ? '本週熱銷商品' : '上次購買，可能需要補貨'}
            </span>
          </span>
          <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 900, flexShrink: 0 }}>
            {formatPrice(recommendation.retailPrice)}
          </span>
        </button>
      ))}
    </div>
  );
}
