import { useEffect, useRef, useState } from 'react';
import api from '../api/client';
import brandMarkLight from '../assets/brand/flow-capsule-v1/mark-light.svg?no-inline';

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

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') handleLogin(code);
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-app)', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', padding: '48px 44px', width: 400, boxShadow: 'var(--shadow-lg)', textAlign: 'center', border: '1.5px solid var(--border)' }}>
        <img src={brandMarkLight} alt="" width={68} height={68} style={{ display: 'block', margin: '0 auto 20px', borderRadius: 22 }} />
        <h2 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>PharmaSaaS POS</h2>
        <p style={{ margin: '0 0 6px', color: 'var(--text-muted)', fontSize: 13 }}>健康生活藥局</p>
        <p style={{ margin: '0 0 28px', color: 'var(--text-muted)', fontSize: 13 }}>
          請掃描員工條碼或輸入員工代碼登入
        </p>

        <input
          ref={inputRef}
          data-testid="login-employee-code-input"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="員工條碼 / 員工代碼"
          disabled={loading}
          style={{
            width: '100%', padding: '13px 16px', fontSize: 15,
            border: `1.5px solid ${error ? 'var(--danger)' : 'var(--border)'}`,
            borderRadius: 'var(--radius-sm)', boxSizing: 'border-box',
            textAlign: 'center', background: 'var(--bg-app)', color: 'var(--text-primary)',
            outline: 'none',
          }}
        />

        {error && (
          <div role="alert" style={{ color: 'var(--danger)', fontSize: 13, marginTop: 10, background: 'var(--danger-bg)', padding: '8px 12px', borderRadius: 'var(--radius-xs)' }}>
            {error}
          </div>
        )}

        <button
          type="button"
          data-testid="login-submit-button"
          onClick={() => handleLogin(code)}
          disabled={loading || !code.trim()}
          style={{
            marginTop: 14, width: '100%', padding: '14px', border: 'none',
            borderRadius: 'var(--radius-full)',
            background: loading || !code.trim() ? 'var(--border)' : 'linear-gradient(135deg, #D97706, #F59E0B)',
            color: loading || !code.trim() ? 'var(--text-muted)' : '#fff',
            fontSize: 15, fontWeight: 800,
            cursor: loading || !code.trim() ? 'not-allowed' : 'pointer',
            boxShadow: loading || !code.trim() ? 'none' : '0 4px 14px rgba(217,119,6,0.35)',
          }}
        >
          {loading ? '登入中...' : '登入 →'}
        </button>
      </div>
    </div>
  );
}
