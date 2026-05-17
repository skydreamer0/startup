interface Props {
  closingCash: number;
  onClosingCashChange: (val: number) => void;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}

export default function CloseShiftDialog({ closingCash, onClosingCashChange, onConfirm, onCancel, loading }: Props) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', padding: 32, width: 360, boxShadow: 'var(--shadow-lg)' }}>
        <h3 style={{ margin: '0 0 16px' }}>確認交班</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <label style={{ fontSize: 13, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>結帳金額</label>
          <input type="number" min={0} value={closingCash} onChange={(e) => onClosingCashChange(Number(e.target.value))} style={{ flex: 1, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-xs)', fontSize: 14 }} />
          <span style={{ fontSize: 13 }}>元</span>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button type="button" onClick={onCancel} style={{ flex: 1, padding: '10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-card)', cursor: 'pointer', fontSize: 14 }}>取消</button>
          <button type="button" onClick={onConfirm} disabled={loading} style={{ flex: 1, padding: '10px', background: 'var(--danger)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', cursor: loading ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 700, opacity: loading ? 0.7 : 1 }}>
            {loading ? '交班中...' : '確認交班'}
          </button>
        </div>
      </div>
    </div>
  );
}
