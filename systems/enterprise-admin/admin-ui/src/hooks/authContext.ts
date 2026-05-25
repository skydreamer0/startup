import { createContext, useContext } from 'react';

export interface User {
    id: string;
    email: string;
    fullName: string;
    roles: string[];
    permissions: string[];
}

export interface AuthContextType {
    user: User | null;
    loading: boolean;
    login: (email: string, password: string) => Promise<void>;
    demoLogin: () => void;
    logout: () => void;
    hasPermission: (perm: string) => boolean;
}

export const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
}
