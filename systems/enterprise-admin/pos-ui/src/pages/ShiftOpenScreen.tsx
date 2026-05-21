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
      <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', padding: 48, width: 400, boxShadow: 'var(--shadow-lg)', textAlign: 'center', border: '1.5px solid var(--border)' }}>
        <div style={{ width: 64, height: 64, borderRadius: 20, background: 'var(--accent-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, margin: '0 auto 20px' }}>
          🌿
        </div>
        <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' }}>開始今天的班別</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: '0 0 28px', lineHeight: 1.6 }}>
          請輸入開班零用金金額，確認後即可開始 POS 結帳作業。
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <label style={{ fontSize: 13, color: 'var(--text-secondary)', whiteSpace: 'nowrap', fontWeight: 600 }}>開班金額</label>
          <input
            type="number"
            min={0}
            data-testid="shift-opening-cash-input"
            value={openingCash}
            onChange={(e) => onOpeningCashChange(Number(e.target.value))}
            style={{ flex: 1, padding: '10px 14px', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 15, background: 'var(--bg-app)', color: 'var(--text-primary)', outline: 'none' }}
          />
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>元</span>
        </div>
        <button
          type="button"
          data-testid="shift-open-button"
          onClick={onOpenShift}
          disabled={shiftOpening}
          style={{ width: '100%', padding: '14px', background: shiftOpening ? 'var(--border)' : 'linear-gradient(135deg, #D97706, #F59E0B)', color: shiftOpening ? 'var(--text-muted)' : '#fff', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 15, fontWeight: 800, cursor: shiftOpening ? 'not-allowed' : 'pointer', boxShadow: shiftOpening ? 'none' : '0 4px 14px rgba(217,119,6,0.35)', marginBottom: 12 }}
        >
          {shiftOpening ? '開班中...' : '開始開班 →'}
        </button>
        <button
          type="button"
          onClick={() => { localStorage.removeItem('pos_accessToken'); window.location.href = '/login'; }}
          style={{ width: '100%', padding: '10px', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13 }}
        >
          登出
        </button>
      </div>
    </div>
  );
}
