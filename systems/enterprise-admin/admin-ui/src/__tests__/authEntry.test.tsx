import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AuthProvider } from '../hooks/useAuth';
import { AuthCacheBoundary } from '../hooks/AuthCacheBoundary';
import { useAuth } from '../hooks/authContext';
import LoginPage from '../pages/LoginPage';
import { ThemeProvider } from '../contexts/ThemeContext';

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../api/client', () => ({ default: { get, post } }));
let client: QueryClient;
function PublicShell() {
    const { user, loading, logout } = useAuth();
    // Same public-route mounting condition as App; the real form/provider are under test.
    if (loading) return null;
    return user ? <><p>{user.id}</p><button onClick={logout}>Logout</button></> : <LoginPage />;
}
function setup() { client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); return render(<QueryClientProvider client={client}><AuthCacheBoundary><ThemeProvider><AuthProvider><PublicShell /></AuthProvider></ThemeProvider></AuthCacheBoundary></QueryClientProvider>); }
beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); sessionStorage.clear(); window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }); });
afterEach(() => { cleanup(); client?.clear(); });
function submit() {
    fireEvent.change(document.querySelector('#login-email')!, { target: { value: 'synthetic@example.test' } });
    fireEvent.change(document.querySelector('#login-password')!, { target: { value: 'synthetic-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
}
it('real login form stays mounted while pending and shows the actual denial after failure', async () => {
    let reject!: (reason: unknown) => void; post.mockImplementation(() => new Promise((_yes, no) => { reject = no; })); setup();
    const email = document.querySelector('#login-email'); submit();
    expect(screen.getByRole('button', { name: 'Signing in...' })).toBeDisabled(); expect(document.querySelector('#login-email')).toBe(email);
    await act(async () => { reject({ response: { status: 401, data: { error: { message: 'Synthetic invalid credentials' } } } }); });
    expect(await screen.findByText('Synthetic invalid credentials')).toBeVisible(); expect(screen.getByRole('button', { name: 'Sign In' })).toBeEnabled();
    expect(document.querySelector('#login-email')).toBe(email); expect(localStorage.getItem('accessToken')).toBeNull();
});
it('logout cancels real QueryClient work and removes old unscoped cache before the next login', async () => {
    localStorage.setItem('accessToken', 'synthetic-A'); get.mockResolvedValue({ data: { data: { id: 'reader-A', permissions: [] } } }); post.mockResolvedValue({ data: {} }); setup();
    await screen.findByText('reader-A'); client.setQueryData(['dashboard', 'kpis'], { privateActor: 'A' });
    let signal!: AbortSignal; let release!: (value: string) => void;
    const pending = client.fetchQuery({ queryKey: ['pending-A'], queryFn: ({ signal: current }) => { signal = current; return new Promise<string>(resolve => { release = resolve; }); } }).catch(() => null);
    await waitFor(() => expect(signal).toBeDefined()); fireEvent.click(screen.getByRole('button', { name: 'Logout' }));
    expect(signal.aborted).toBe(true); expect(client.getQueryData(['dashboard', 'kpis'])).toBeUndefined(); expect(client.getQueryCache().getAll()).toHaveLength(0);
    await act(async () => { release('LATE_PRIVATE_A'); await pending; }); expect(client.getQueryCache().getAll()).toHaveLength(0); expect(screen.getByRole('button', { name: 'Sign In' })).toBeVisible();
});
it('actual login fields have associated visible labels and denial is announced as an alert', async () => {
    post.mockRejectedValue({ response: { status: 401, data: { error: { message: 'Synthetic denied login' } } } }); setup();
    expect(screen.getByLabelText('Email')).toHaveAttribute('id', 'login-email');
    expect(screen.getByLabelText('Password')).toHaveAttribute('id', 'login-password');
    submit(); expect(await screen.findByRole('alert')).toHaveTextContent('Synthetic denied login');
});
