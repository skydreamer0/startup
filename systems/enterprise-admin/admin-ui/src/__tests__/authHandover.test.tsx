import '@testing-library/jest-dom/vitest';
import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../hooks/useAuth';
import { useAuth } from '../hooks/authContext';

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../api/client', () => ({ default: { get, post } }));
function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}
const profile = (id: string) => ({ data: { data: { id, email: `${id}@example.test`, fullName: id, roles: [], permissions: ['read:reports'] } } });
const pair = (id: string) => ({ data: { data: { accessToken: `synthetic-access-${id}`, refreshToken: `synthetic-refresh-${id}` } } });
function Harness() {
    const { user, loading, login, logout } = useAuth();
    return <><output aria-label="identity">{user?.id ?? 'anonymous'}</output><output aria-label="loading">{String(loading)}</output>
        <button onClick={logout}>Logout</button><button onClick={() => { void login('reader-b@example.test', 'synthetic-password').catch(() => {}); }}>Login B</button>
        <button onClick={() => { void login('reader-c@example.test', 'synthetic-password').catch(() => {}); }}>Login C</button></>;
}
beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); sessionStorage.clear(); post.mockResolvedValue(pair('reader-b')); });
afterEach(() => cleanup());

describe('real AuthProvider identity generation', () => {
    it('late initial profile cannot resurrect a logged-out actor', async () => {
        localStorage.setItem('accessToken', 'synthetic-access-reader-a');
        const old = deferred<ReturnType<typeof profile>>(); get.mockReturnValue(old.promise);
        render(<AuthProvider><Harness /></AuthProvider>); await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
        fireEvent.click(screen.getByRole('button', { name: 'Logout' }));
        await act(async () => { old.resolve(profile('reader-a')); });
        expect(screen.getByLabelText('identity')).toHaveTextContent('anonymous');
        expect(localStorage.getItem('accessToken')).toBeNull();
    });
    it('late old profile error cannot clear the new actor token pair', async () => {
        localStorage.setItem('accessToken', 'synthetic-access-reader-a');
        const old = deferred<ReturnType<typeof profile>>(); get.mockReturnValueOnce(old.promise).mockResolvedValue(profile('reader-b'));
        render(<AuthProvider><Harness /></AuthProvider>); await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
        fireEvent.click(screen.getByRole('button', { name: 'Login B' }));
        await waitFor(() => expect(screen.getByLabelText('identity')).toHaveTextContent('reader-b'));
        await act(async () => { old.reject(new Error('synthetic old transport failure')); });
        expect(localStorage.getItem('accessToken')).toBe('synthetic-access-reader-b');
        expect(localStorage.getItem('refreshToken')).toBe('synthetic-refresh-reader-b');
        expect(screen.getByLabelText('identity')).toHaveTextContent('reader-b');
    });
    it('late login reply cannot install credentials after logout', async () => {
        const old = deferred<ReturnType<typeof pair>>(); post.mockImplementation((path: string) => path === '/auth/login' ? old.promise : Promise.resolve({ data: {} }));
        get.mockResolvedValue(profile('reader-b'));
        render(<AuthProvider><Harness /></AuthProvider>);
        fireEvent.click(screen.getByRole('button', { name: 'Login B' }));
        await waitFor(() => expect(post.mock.calls.some(call => call[0] === '/auth/login' && call[1]?.email === 'reader-b@example.test')).toBe(true));
        fireEvent.click(screen.getByRole('button', { name: 'Logout' }));
        await act(async () => { old.resolve(pair('reader-b')); });
        expect(localStorage.getItem('accessToken')).toBeNull();
        expect(localStorage.getItem('refreshToken')).toBeNull();
        expect(screen.getByLabelText('identity')).toHaveTextContent('anonymous');
    });
    it('logout aborts the pending profile transport and ends loading', async () => {
        localStorage.setItem('accessToken', 'synthetic-access-reader-a');
        get.mockReturnValue(new Promise(() => {})); render(<AuthProvider><Harness /></AuthProvider>);
        const signal = get.mock.calls[0][1].signal as AbortSignal;
        fireEvent.click(screen.getByRole('button', { name: 'Logout' }));
        expect(signal.aborted).toBe(true); expect(screen.getByLabelText('loading')).toHaveTextContent('false');
    });
    for (const result of ['success', 'failure'] as const) it(`older login ${result} cannot replace or clear the newest login`, async () => {
        const old = deferred<ReturnType<typeof pair>>(); post.mockImplementation((_path: string, body: { email: string }) => body.email.startsWith('reader-b') ? old.promise : Promise.resolve(pair('reader-c')));
        get.mockResolvedValue(profile('reader-c')); render(<AuthProvider><Harness /></AuthProvider>);
        fireEvent.click(screen.getByRole('button', { name: 'Login B' })); const signal = post.mock.calls[0][2].signal as AbortSignal;
        fireEvent.click(screen.getByRole('button', { name: 'Login C' })); await waitFor(() => expect(screen.getByLabelText('identity')).toHaveTextContent('reader-c'));
        expect(signal.aborted).toBe(true);
        await act(async () => { if (result === 'success') old.resolve(pair('reader-b')); else old.reject(new Error('synthetic login failure')); });
        expect(localStorage.getItem('accessToken')).toBe('synthetic-access-reader-c'); expect(screen.getByLabelText('identity')).toHaveTextContent('reader-c');
    });
    it('new login hides the prior profile immediately and a current failure leaves no prior identity', async () => {
        localStorage.setItem('accessToken', 'synthetic-access-reader-a'); get.mockResolvedValue(profile('reader-a'));
        const next = deferred<ReturnType<typeof pair>>(); post.mockReturnValue(next.promise); render(<AuthProvider><Harness /></AuthProvider>);
        await waitFor(() => expect(screen.getByLabelText('identity')).toHaveTextContent('reader-a'));
        fireEvent.click(screen.getByRole('button', { name: 'Login B' })); expect(screen.getByLabelText('identity')).toHaveTextContent('anonymous'); expect(screen.getByLabelText('loading')).toHaveTextContent('false');
        await act(async () => { next.reject(new Error('synthetic denied')); });
        expect(localStorage.getItem('accessToken')).toBeNull(); expect(screen.getByLabelText('identity')).toHaveTextContent('anonymous'); expect(screen.getByLabelText('loading')).toHaveTextContent('false');
    });
    it('unmount aborts a pending login and its later reply writes no credentials', async () => {
        const pending = deferred<ReturnType<typeof pair>>(); post.mockReturnValue(pending.promise);
        const view = render(<AuthProvider><Harness /></AuthProvider>); fireEvent.click(screen.getByRole('button', { name: 'Login B' }));
        const signal = post.mock.calls[0][2].signal as AbortSignal; view.unmount(); expect(signal.aborted).toBe(true);
        await act(async () => { pending.resolve(pair('reader-b')); }); expect(localStorage.getItem('accessToken')).toBeNull(); expect(get).not.toHaveBeenCalled();
    });
    it('StrictMode discarded startup profile cannot overwrite the current profile', async () => {
        localStorage.setItem('accessToken', 'synthetic-access-reader-b'); const old = deferred<ReturnType<typeof profile>>(); get.mockReturnValueOnce(old.promise).mockResolvedValue(profile('reader-b'));
        render(<StrictMode><AuthProvider><Harness /></AuthProvider></StrictMode>);
        await waitFor(() => expect(screen.getByLabelText('identity')).toHaveTextContent('reader-b'));
        expect(get.mock.calls[0][1].signal.aborted).toBe(true);
        await act(async () => { old.resolve(profile('reader-a')); }); expect(screen.getByLabelText('identity')).toHaveTextContent('reader-b');
    });
});
