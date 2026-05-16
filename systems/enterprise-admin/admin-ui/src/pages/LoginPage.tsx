import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import ThemeToggle from '../components/ThemeToggle';

export default function LoginPage() {
    const { login, demoLogin } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError('');
        setSubmitting(true);

        try {
            await login(email, password);
        } catch (err: any) {
            setError(err.response?.data?.error?.message || 'Login failed');
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="login-page">
            <div style={{ position: 'absolute', top: '24px', right: '24px' }}>
                <ThemeToggle />
            </div>
            <div className="login-box card">
                <h1 className="login-logo">⚡ Admin</h1>
                <p className="login-subtitle">Enterprise Management Console</p>

                {error && <div className="login-error">{error}</div>}

                <form className="login-form" onSubmit={handleSubmit}>
                    <div className="input-group">
                        <label className="input-label">Email</label>
                        <input
                            id="login-email"
                            className="input-field"
                            type="email"
                            placeholder="admin@system.local"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                    </div>

                    <div className="input-group">
                        <label className="input-label">Password</label>
                        <input
                            id="login-password"
                            className="input-field"
                            type="password"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </div>

                    <button
                        id="login-submit"
                        className="btn btn-primary login-btn"
                        type="submit"
                        disabled={submitting}
                    >
                        {submitting ? 'Signing in...' : 'Sign In'}
                    </button>
                    {import.meta.env.VITE_DEMO_MODE === 'true' && (
                        <button
                            type="button"
                            className="btn btn-secondary login-btn"
                            onClick={demoLogin}
                            style={{ marginTop: '8px' }}
                        >
                            Open Demo Preview
                        </button>
                    )}
                </form>
            </div>
        </div>
    );
}
