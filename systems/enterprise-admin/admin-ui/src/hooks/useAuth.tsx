import { useState, useEffect, useRef, type ReactNode } from 'react';
import api from '../api/client';
import { advanceAuthGeneration, currentAuthGeneration } from '../api/authSession';
import { AuthContext, type User } from './authContext';
import { createDemoUser, isDemoModeEnabled } from './authDemo';

type AuthOperation = { generation: number; controller: AbortController };

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const operation = useRef<AuthOperation | null>(null);

    function beginOperation(): AuthOperation {
        operation.current?.controller.abort();
        const next = { generation: advanceAuthGeneration(), controller: new AbortController() };
        operation.current = next;
        return next;
    }

    function isCurrent(subject: AuthOperation): boolean {
        return operation.current === subject && !subject.controller.signal.aborted
            && subject.generation === currentAuthGeneration();
    }

    useEffect(() => {
        const subject = beginOperation();
        const demoActive = sessionStorage.getItem('demoMode') === 'true';
        if (demoActive && isDemoModeEnabled()) {
            setUser(createDemoUser());
            setLoading(false);
        } else {
            sessionStorage.removeItem('demoMode');
            const token = localStorage.getItem('accessToken');
            if (token) {
                void loadProfile(subject).catch(() => {});
            } else {
                setLoading(false);
            }
        }
        return () => {
            const current = operation.current;
            current?.controller.abort();
            if (current?.generation === currentAuthGeneration()) advanceAuthGeneration();
            operation.current = null;
        };
    }, []);

    async function loadProfile(subject: AuthOperation) {
        try {
            const res = await api.get('/auth/me', { signal: subject.controller.signal });
            if (isCurrent(subject)) setUser(res.data.data);
        } catch (error) {
            if (!isCurrent(subject)) return;
            localStorage.clear();
            setUser(null);
            throw error;
        } finally {
            if (isCurrent(subject)) setLoading(false);
        }
    }

    async function login(email: string, password: string) {
        const subject = beginOperation();
        setUser(null);
        // LoginPage owns its submitting state; keeping it mounted preserves its error UI.
        setLoading(false);
        sessionStorage.removeItem('demoMode');
        try {
            const res = await api.post('/auth/login', { email, password }, { signal: subject.controller.signal });
            if (!isCurrent(subject)) return;
            const { accessToken, refreshToken } = res.data.data;
            localStorage.setItem('accessToken', accessToken);
            localStorage.setItem('refreshToken', refreshToken);
            await loadProfile(subject);
        } catch (error) {
            if (!isCurrent(subject)) return;
            localStorage.clear();
            setUser(null);
            throw error;
        } finally {
            if (isCurrent(subject)) setLoading(false);
        }
    }

    function demoLogin() {
        if (!isDemoModeEnabled()) return;
        beginOperation();
        localStorage.clear();
        sessionStorage.setItem('demoMode', 'true');
        setUser(createDemoUser());
        setLoading(false);
    }

    function logout() {
        beginOperation();
        // The client captures this identity synchronously before local credentials are cleared.
        void api.post('/auth/logout').catch(() => {});
        localStorage.clear();
        sessionStorage.removeItem('demoMode');
        setUser(null);
        setLoading(false);
    }

    function hasPermission(perm: string) {
        return user?.permissions.includes('*') || user?.permissions.includes(perm) || false;
    }

    return (
        <AuthContext.Provider value={{ user, loading, login, demoLogin, logout, hasPermission }}>
            {children}
        </AuthContext.Provider>
    );
}
