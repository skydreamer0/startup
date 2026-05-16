import { useState } from 'react';
import { posApi } from '../api/pos';

export default function POSLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await posApi.login(email, password);
      localStorage.setItem('pos_accessToken', res.data.data.accessToken);
      window.location.href = '/';
    } catch {
      setError('帳號或密碼錯誤');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-app)' }}>
      <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', padding: 40, width: 360, boxShadow: 'var(--shadow-lg)' }}>
        <h2 style={{ margin: '0 0 24px', textAlign: 'center' }}>PharmaSaaS POS</h2>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="Email" required autoFocus
            style={{ padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-xs)', fontSize: 14 }}
          />
          <input
            type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="密碼" required
            style={{ padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-xs)', fontSize: 14 }}
          />
          {error && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>}
          <button
            type="submit" disabled={loading}
            style={{ padding: '12px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}
          >
            {loading ? '登入中…' : '登入'}
          </button>
        </form>
      </div>
    </div>
  );
}
