import { useEffect, useRef, useState } from 'react';
import { PosStaff } from '../api/pos';

interface Props {
  staffList: PosStaff[];
  currentStaffId: string | null;
  onSelect: (staffId: string) => void;
  onClose: () => void;
}

export default function StaffSwitchModal({ staffList, currentStaffId, onSelect, onClose }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');

  useEffect(() => { inputRef.current?.focus(); }, []);

  const filtered = staffList.filter(
    (s) =>
      s.fullName.includes(query) ||
      s.email.includes(query) ||
      (s.employeeCode && s.employeeCode.includes(query)),
  );

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') onClose();
    if (e.key === 'Enter' && filtered.length === 1) onSelect(filtered[0].id);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
      <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', padding: 24, width: 360, boxShadow: 'var(--shadow-lg)' }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>切換收銀員</h3>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKey}
          placeholder="搜尋姓名、員工碼、Email…"
          style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-xs)', fontSize: 14, boxSizing: 'border-box' }}
        />
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 240, overflowY: 'auto' }}>
          {filtered.map((s) => (
            <button
              key={s.id}
              onClick={() => onSelect(s.id)}
              style={{
                padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-xs)',
                background: s.id === currentStaffId ? 'var(--accent-subtle)' : 'var(--bg-card)',
                color: 'var(--text-primary)', cursor: 'pointer', textAlign: 'left', fontSize: 14,
              }}
            >
              {s.fullName}
              {s.employeeCode && <span style={{ color: 'var(--text-muted)', fontSize: 12, marginLeft: 8 }}>#{s.employeeCode}</span>}
            </button>
          ))}
        </div>
        <button onClick={onClose} style={{ marginTop: 12, width: '100%', padding: 8, border: 'none', background: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13 }}>
          取消 (Esc)
        </button>
      </div>
    </div>
  );
}
