import { useEffect, useState } from 'react';

interface CartSnapshot {
  items: { name: string; quantity: number; unitPrice: number; lineTotal: number }[];
  subtotal: number;
  discount: number;
  total: number;
  paymentMethod: string;
}

// Customer-facing display — opened as a secondary window via BroadcastChannel
export default function CustomerDisplayPage() {
  const [cart, setCart] = useState<CartSnapshot | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    const channel = new BroadcastChannel('pos-customer-display');
    channel.onmessage = (e: MessageEvent<CartSnapshot | { type: 'clear' }>) => {
      if ('type' in e.data && e.data.type === 'clear') {
        setCart(null);
      } else {
        setCart(e.data as CartSnapshot);
        setLastUpdated(new Date());
      }
    };
    return () => channel.close();
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: '#FBF8F3', display: 'flex', flexDirection: 'column', fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ background: '#1C1917', padding: '18px 32px', display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: '#D97706', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>🌿</div>
        <div>
          <div style={{ color: '#fff', fontWeight: 800, fontSize: 18 }}>PharmaSaaS</div>
          <div style={{ color: '#A8A29E', fontSize: 13 }}>健康生活藥局</div>
        </div>
        <div style={{ marginLeft: 'auto', color: '#A8A29E', fontSize: 12 }}>
          {lastUpdated ? lastUpdated.toLocaleTimeString('zh-TW') : '等待中...'}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, padding: '32px 40px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        {!cart || cart.items.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, opacity: 0.5 }}>
            <div style={{ fontSize: 64 }}>🛍️</div>
            <div style={{ fontSize: 18, color: '#78716C' }}>歡迎光臨！</div>
          </div>
        ) : (
          <>
            {/* Items */}
            <div style={{ background: '#fff', borderRadius: 16, border: '1.5px solid #E8DDD0', overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', background: '#F5EFE8', borderBottom: '1px solid #E8DDD0', display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 16, fontSize: 12, color: '#78716C', fontWeight: 700, letterSpacing: '0.05em' }}>
                <span>商品</span>
                <span style={{ textAlign: 'right' }}>數量</span>
                <span style={{ textAlign: 'right', minWidth: 80 }}>小計</span>
              </div>
              {cart.items.map((item, i) => (
                <div key={i} style={{ padding: '14px 20px', borderBottom: '1px solid #F5EFE8', display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 16, alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#1C1917' }}>{item.name}</div>
                    <div style={{ fontSize: 12, color: '#A8A29E', marginTop: 2 }}>${item.unitPrice.toFixed(0)} / 件</div>
                  </div>
                  <div style={{ fontSize: 15, color: '#78716C', textAlign: 'right' }}>× {item.quantity}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#D97706', textAlign: 'right', minWidth: 80 }}>${item.lineTotal.toFixed(0)}</div>
                </div>
              ))}
            </div>

            {/* Totals */}
            <div style={{ background: '#fff', borderRadius: 16, border: '1.5px solid #E8DDD0', padding: '20px 24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: '#78716C', marginBottom: 8 }}>
                <span>小計</span><span>${cart.subtotal.toFixed(0)}</span>
              </div>
              {cart.discount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: '#DC2626', marginBottom: 8 }}>
                  <span>折扣</span><span>-${cart.discount.toFixed(0)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderTop: '1.5px solid #E8DDD0', paddingTop: 14, marginTop: 8 }}>
                <span style={{ fontSize: 20, fontWeight: 700, color: '#1C1917' }}>合計</span>
                <span style={{ fontSize: 42, fontWeight: 900, color: '#D97706', letterSpacing: '-0.02em' }}>${cart.total.toFixed(0)}</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: '14px 32px', background: '#F5EFE8', borderTop: '1.5px solid #E8DDD0', textAlign: 'center', fontSize: 12, color: '#A8A29E' }}>
        感謝您的光臨 · 請確認品項與金額無誤
      </div>
    </div>
  );
}
