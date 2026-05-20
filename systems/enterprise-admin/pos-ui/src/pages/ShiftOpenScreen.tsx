import PosToast, { PosToastMessage } from '../components/PosToast';

interface Props {
  openingCash: number;
  onOpeningCashChange: (val: number) => void;
  onOpenShift: () => void;
  shiftOpening: boolean;
  toast: PosToastMessage | null;
  onDismissToast: () => void;
}

export default function ShiftOpenScreen({
  openingCash,
  onOpeningCashChange,
  onOpenShift,
  shiftOpening,
  toast,
  onDismissToast,
}: Props) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-app)', fontFamily: 'Inter, sans-serif' }}>
      <PosToast toast={toast} onDismiss={onDismissToast} />
      <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', padding: 48, width: 380, boxShadow: 'var(--shadow-lg)', textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>開班</div>
        <h2 style={{ margin: '0 0 8px' }}>目前沒有開啟班別</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: '0 0 28px' }}>請先輸入開班金額，再開始 POS 結帳作業。</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <label style={{ fontSize: 13, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>開班金額</label>
          <input
            type="number"
            min={0}
            data-testid="shift-opening-cash-input"
            value={openingCash}
            onChange={(event) => onOpeningCashChange(Number(event.target.value))}
            style={{ flex: 1, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-xs)', fontSize: 14 }}
          />
          <span style={{ fontSize: 13 }}>元</span>
        </div>
        <button
          type="button"
          data-testid="shift-open-button"
          onClick={onOpenShift}
          disabled={shiftOpening}
          style={{ width: '100%', padding: '12px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 16, fontWeight: 700, cursor: shiftOpening ? 'not-allowed' : 'pointer', opacity: shiftOpening ? 0.7 : 1 }}
        >
          {shiftOpening ? '開班中...' : '開始開班'}
        </button>
        <button
          type="button"
          onClick={() => { localStorage.removeItem('pos_accessToken'); window.location.href = '/login'; }}
          style={{ marginTop: 12, width: '100%', padding: '8px', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13 }}
        >
          登出
        </button>
      </div>
    </div>
  );
}
