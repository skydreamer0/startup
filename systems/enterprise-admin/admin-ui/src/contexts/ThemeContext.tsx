import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextValue {
    theme: Theme;
    toggleTheme: () => void;
    setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const STORAGE_KEY = 'admin-ui-theme';

function getInitialTheme(): Theme {
    // 1. Check localStorage
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;

    // 2. Respect OS preference
    if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark';

    // 3. Default to light
    return 'light';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [theme, setThemeState] = useState<Theme>(getInitialTheme);

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem(STORAGE_KEY, theme);
    }, [theme]);

    function toggleTheme() {
        setThemeState((prev) => (prev === 'light' ? 'dark' : 'light'));
    }

    function setTheme(t: Theme) {
        setThemeState(t);
    }

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme(): ThemeContextValue {
    const ctx = useContext(ThemeContext);
    if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
    return ctx;
}
