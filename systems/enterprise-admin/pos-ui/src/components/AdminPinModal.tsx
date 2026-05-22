import { useState } from 'react';

interface Props {
  onConfirm: (pin: string) => void;
  onClose: () => void;
  reason: string;
}

export default function AdminPinModal({ onConfirm, onClose, reason }: Props) {
  const [pin, setPin] = useState('');
  const [shake, setShake] = useState(false);

  function append(digit: string) {
    if (pin.length < 4) setPin((p) => p + digit);
  }

  function clear() {
    setPin('');
  }

  function submit() {
    if (pin.length < 4) {
      setShake(true);
      setTimeout(() => setShake(false), 400);
      return;
    }
    onConfirm(pin);
  }

  const dots = Array.from({ length: 4 }, (_, i) => i < pin.length);

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', padding: 32, width: 320, boxShadow: 'var(--shadow-lg)', textAlign: 'center' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 28, marginBottom: 8 }}>🔒</div>
        <h3 style={{ margin: '0 0 6px', fontSize: 16 }}>管理員授權</h3>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--text-muted)' }}>{reason}</p>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 14, marginBottom: 24 }}>
          {dots.map((filled, i) => (
            <div
              key={i}
              style={{
                width: 18, height: 18, borderRadius: '50%',
                background: filled ? 'var(--accent)' : 'var(--border)',
                transition: 'background 0.1s',
                animation: shake && filled ? 'shake 0.3s' : 'none',
              }}
            />
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 12 }}>
          {['1','2','3','4','5','6','7','8','9'].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => append(d)}
              style={{ padding: '14px', fontSize: 20, fontWeight: 700, border: '1.5px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-app)', cursor: 'pointer', color: 'var(--text-primary)' }}
            >
              {d}
            </button>
          ))}
          <button
            type="button"
            onClick={clear}
            style={{ padding: '14px', fontSize: 14, border: '1.5px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-app)', cursor: 'pointer', color: 'var(--danger)' }}
          >
            清除
          </button>
          <button
            type="button"
            onClick={() => append('0')}
            style={{ padding: '14px', fontSize: 20, fontWeight: 700, border: '1.5px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-app)', cursor: 'pointer', color: 'var(--text-primary)' }}
          >
            0
          </button>
          <button
            type="button"
            onClick={() => setPin((p) => p.slice(0, -1))}
            style={{ padding: '14px', fontSize: 18, border: '1.5px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-app)', cursor: 'pointer', color: 'var(--text-secondary)' }}
          >
            ⌫
          </button>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            onClick={onClose}
            style={{ flex: 1, padding: '12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-card)', cursor: 'pointer', fontSize: 14 }}
          >
            取消
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pin.length < 4}
            style={{ flex: 2, padding: '12px', background: pin.length === 4 ? 'var(--accent)' : 'var(--border)', color: pin.length === 4 ? '#fff' : 'var(--text-muted)', border: 'none', borderRadius: 'var(--radius-sm)', cursor: pin.length < 4 ? 'not-allowed' : 'pointer', fontSize: 15, fontWeight: 700 }}
          >
            確認授權
          </button>
        </div>
      </div>
    </div>
  );
}
