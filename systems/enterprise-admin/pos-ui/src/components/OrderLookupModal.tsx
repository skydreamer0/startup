import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { posApi, PosOrderSummary } from '../api/pos';
import { PAYMENT_LABELS, PaymentMethod } from '../constants';

interface Props {
  shiftId?: string;
  onRefund: (order: PosOrderSummary) => void;
  onClose: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  completed: '已完成',
  refunded: '已退款',
  pending: '待處理',
  cancelled: '已取消',
};

const STATUS_COLOR: Record<string, string> = {
  completed: 'var(--success)',
  refunded: 'var(--danger)',
  pending: 'var(--warning)',
  cancelled: 'var(--text-muted)',
};

export default function OrderLookupModal({ shiftId, onRefund, onClose }: Props) {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['pos-today-orders', shiftId],
    queryFn: () => posApi.getTodayOrders(shiftId).then((r) => r.data.data),
    staleTime: 10_000,
  });

  const filtered = orders.filter((o) =>
    !search ||
    o.orderNumber?.toLowerCase().includes(search.toLowerCase()) ||
    o.items.some((i) => i.product.name.toLowerCase().includes(search.toLowerCase())),
  );

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
      <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', width: 560, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-lg)' }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1.5px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>今日訂單</h3>
            <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-muted)', lineHeight: 1 }}>×</button>
          </div>
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜尋訂單號或商品名稱..."
            style={{ width: '100%', boxSizing: 'border-box', padding: '8px 14px', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-full)', fontSize: 13, background: 'var(--bg-app)', outline: 'none' }}
          />
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {isLoading && <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>載入中...</div>}
          {!isLoading && filtered.length === 0 && (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>今日無訂單紀錄</div>
          )}
          {filtered.map((order) => (
            <div key={order.id} style={{ borderBottom: '1px solid var(--border)' }}>
              {/* Row */}
              <div
                style={{ padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
                onClick={() => setExpanded(expanded === order.id ? null : order.id)}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{order.orderNumber ?? order.id.slice(0, 8)}</span>
                    <span style={{ fontSize: 11, color: STATUS_COLOR[order.status] ?? 'var(--text-muted)', background: `${STATUS_COLOR[order.status]}1a`, padding: '1px 8px', borderRadius: 999, fontWeight: 600 }}>
                      {STATUS_LABEL[order.status] ?? order.status}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                    {new Date(order.createdAt).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}
                    {' · '}
                    {PAYMENT_LABELS[order.paymentMethod as PaymentMethod] ?? order.paymentMethod}
                    {' · '}
                    {order.items.length} 件
                  </div>
                </div>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--accent)', whiteSpace: 'nowrap' }}>
                  ${Number(order.totalAmount).toFixed(0)}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{expanded === order.id ? '▲' : '▼'}</div>
              </div>

              {/* Expanded detail */}
              {expanded === order.id && (
                <div style={{ padding: '0 24px 14px', background: 'var(--bg-app)' }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>品項明細</div>
                  {order.items.map((item) => (
                    <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                      <span>{item.product.name} × {item.quantity}</span>
                      <span>${(Number(item.finalUnitPrice) * item.quantity).toFixed(0)}</span>
                    </div>
                  ))}
                  {order.status === 'completed' && (
                    <button
                      type="button"
                      onClick={() => onRefund(order)}
                      style={{ marginTop: 10, width: '100%', padding: '9px', background: '#FEF2F2', color: 'var(--danger)', border: '1px solid #FECACA', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}
                    >
                      退款此訂單
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
