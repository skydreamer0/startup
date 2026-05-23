import { useMemo, useState } from 'react';
import type { ReorderForecastItem, ReorderUrgency } from '../api/pos';

interface Props {
  forecasts: ReorderForecastItem[];
}

const URGENCY_RANK: Record<ReorderUrgency, number> = {
  THIS_WEEK: 3,
  SOON: 2,
  OK: 1,
};

const URGENCY_STYLES: Record<ReorderUrgency, { label: string; bg: string; text: string; border: string }> = {
  THIS_WEEK: { label: 'This week', bg: '#FEE2E2', text: '#991B1B', border: '#FCA5A5' },
  SOON: { label: 'Soon', bg: '#FEF3C7', text: '#92400E', border: '#FBBF24' },
  OK: { label: 'OK', bg: '#E0F2FE', text: '#075985', border: '#7DD3FC' },
};

export default function ReorderForecastBadge({ forecasts }: Props) {
  const [open, setOpen] = useState(false);
  const sortedForecasts = useMemo(
    () => [...forecasts].sort((a, b) => URGENCY_RANK[b.urgency] - URGENCY_RANK[a.urgency]),
    [forecasts],
  );

  if (forecasts.length === 0) return null;

  const topUrgency = sortedForecasts[0].urgency;
  const topStyle = URGENCY_STYLES[topUrgency];

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        aria-label={`Reorder forecast: ${forecasts.length} items need attention`}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 7,
          border: `1.5px solid ${topStyle.border}`,
          borderRadius: 'var(--radius-full)',
          background: topStyle.bg,
          color: topStyle.text,
          padding: '5px 11px',
          cursor: 'pointer',
          fontSize: 12,
          fontWeight: 800,
          whiteSpace: 'nowrap',
        }}
      >
        <span>Reorder</span>
        <span
          style={{
            minWidth: 20,
            height: 20,
            borderRadius: 'var(--radius-full)',
            background: '#fff',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 6px',
          }}
        >
          {forecasts.length}
        </span>
        <span>{topStyle.label}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Reorder forecast"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: 320,
            maxWidth: 'calc(100vw - 24px)',
            background: 'var(--bg-card)',
            border: '1.5px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-lg)',
            zIndex: 600,
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: 'var(--text-primary)' }}>Reorder forecast</div>
          </div>
          <div style={{ maxHeight: 280, overflowY: 'auto' }}>
            {sortedForecasts.map((item) => {
              const style = URGENCY_STYLES[item.urgency];
              const stockoutText = item.estimatedDaysUntilStockout === null
                ? 'No sales pace'
                : `${item.estimatedDaysUntilStockout}d left`;
              return (
                <div
                  key={item.productId}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    padding: '11px 14px',
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  <span
                    style={{
                      marginTop: 2,
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: style.border,
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>{item.name}</span>
                      <span style={{ fontSize: 11, fontWeight: 800, color: style.text, background: style.bg, borderRadius: 'var(--radius-full)', padding: '2px 7px', flexShrink: 0 }}>
                        {style.label}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 5, fontSize: 11, color: 'var(--text-secondary)' }}>
                      <span>Stock {item.stockQuantity}</span>
                      <span>Safety {item.safetyStock}</span>
                    </div>
                    <div style={{ marginTop: 5, fontSize: 12, fontWeight: 800, color: 'var(--accent)' }}>
                      {stockoutText} · {item.dailySalesVelocity}/day
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
