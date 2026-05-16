import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import api from '../api/client';
import { createDemoUser, isDemoModeEnabled } from './authDemo';

export interface User {
    id: string;
    email: string;
    fullName: string;
    roles: string[];
    permissions: string[];
}

interface AuthContextType {
    user: User | null;
    loading: boolean;
    login: (email: string, password: string) => Promise<void>;
    demoLogin: () => void;
    logout: () => void;
    hasPermission: (perm: string) => boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const demoActive = sessionStorage.getItem('demoMode') === 'true';
        if (demoActive && isDemoModeEnabled()) {
            setUser(createDemoUser());
            setLoading(false);
        } else {
            sessionStorage.removeItem('demoMode');
            const token = localStorage.getItem('accessToken');
            if (token) {
                loadProfile();
            } else {
                setLoading(false);
            }
        }
    }, []);

    async function loadProfile() {
        try {
            const res = await api.get('/auth/me');
            setUser(res.data.data);
        } catch {
            localStorage.clear();
        } finally {
            setLoading(false);
        }
    }

    async function login(email: string, password: string) {
        const res = await api.post('/auth/login', { email, password });
        const { accessToken, refreshToken } = res.data.data;
        localStorage.setItem('accessToken', accessToken);
        localStorage.setItem('refreshToken', refreshToken);
        await loadProfile();
    }

    function demoLogin() {
        if (!isDemoModeEnabled()) return;
        localStorage.clear();
        sessionStorage.setItem('demoMode', 'true');
        setUser(createDemoUser());
    }

    function logout() {
        api.post('/auth/logout').catch(() => { });
        localStorage.clear();
        sessionStorage.removeItem('demoMode');
        setUser(null);
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

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
}
