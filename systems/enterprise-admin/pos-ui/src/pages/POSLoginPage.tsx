import { useEffect, useRef, useState } from 'react';
import api from '../api/client';

export default function POSLoginPage() {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus so barcode scanner fires directly into the input
  useEffect(() => { inputRef.current?.focus(); }, []);

  async function handleLogin(employeeCode: string) {
    if (!employeeCode.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.post<{ success: boolean; data: { accessToken: string } }>(
        '/pos/staff-login',
        { employeeCode: employeeCode.trim() },
      );
      localStorage.setItem('pos_accessToken', res.data.data.accessToken);
      window.location.href = '/';
    } catch {
      setError('找不到此員工或帳號已停用');
      setCode('');
      setTimeout(() => inputRef.current?.focus(), 50);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') handleLogin(code);
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', background: 'var(--bg-app)',
    }}>
      <div style={{
        background: 'var(--bg-card)', borderRadius: 'var(--radius-md)',
        padding: 48, width: 380, boxShadow: 'var(--shadow-lg)', textAlign: 'center',
      }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>💊</div>
        <h2 style={{ margin: '0 0 6px', fontSize: 22 }}>PharmaSaaS POS</h2>
        <p style={{ margin: '0 0 28px', color: 'var(--text-muted)', fontSize: 14 }}>
          請刷員工條碼或輸入員工編號登入
        </p>

        <input
          ref={inputRef}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="員工條碼 / 員工編號"
          disabled={loading}
          style={{
            width: '100%', padding: '12px 14px', fontSize: 16,
            border: `1px solid ${error ? 'var(--danger)' : 'var(--border)'}`,
            borderRadius: 'var(--radius-xs)', boxSizing: 'border-box',
            textAlign: 'center', letterSpacing: 2,
          }}
        />

        {error && (
          <div style={{ color: 'var(--danger)', fontSize: 13, marginTop: 10 }}>{error}</div>
        )}

        <button
          onClick={() => handleLogin(code)}
          disabled={loading || !code.trim()}
          style={{
            marginTop: 16, width: '100%', padding: '12px',
            background: 'var(--accent)', color: '#fff', border: 'none',
            borderRadius: 'var(--radius-sm)', fontSize: 15, fontWeight: 700,
            cursor: loading || !code.trim() ? 'not-allowed' : 'pointer',
            opacity: loading || !code.trim() ? 0.6 : 1,
          }}
        >
          {loading ? '驗證中…' : '登入'}
        </button>
      </div>
    </div>
  );
}
