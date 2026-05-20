import { useEffect, useRef, useState } from 'react';
import api from '../api/client';

export default function POSLoginPage() {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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
      setError('登入失敗，請確認員工代碼後再試');
      setCode('');
      setTimeout(() => inputRef.current?.focus(), 50);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') handleLogin(code);
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
        <div style={{ fontSize: 36, marginBottom: 12 }}>POS</div>
        <h2 style={{ margin: '0 0 6px', fontSize: 22 }}>PharmaSaaS POS</h2>
        <p style={{ margin: '0 0 28px', color: 'var(--text-muted)', fontSize: 14 }}>
          請掃描員工條碼或輸入員工代碼登入
        </p>

        <input
          ref={inputRef}
          data-testid="login-employee-code-input"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="員工條碼 / 員工代碼"
          disabled={loading}
          style={{
            width: '100%', padding: '12px 14px', fontSize: 16,
            border: `1px solid ${error ? 'var(--danger)' : 'var(--border)'}`,
            borderRadius: 'var(--radius-xs)', boxSizing: 'border-box',
            textAlign: 'center', letterSpacing: 0,
          }}
        />

        {error && (
          <div role="alert" style={{ color: 'var(--danger)', fontSize: 13, marginTop: 10 }}>{error}</div>
        )}

        <button
          type="button"
          data-testid="login-submit-button"
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
          {loading ? '登入中...' : '登入'}
        </button>
      </div>
    </div>
  );
}
