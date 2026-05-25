import { useTheme } from '../contexts/theme-context';

export default function ThemeToggle() {
    const { theme, toggleTheme } = useTheme();
    const isDark = theme === 'dark';

    return (
        <button
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            title={isDark ? 'Light mode' : 'Dark mode'}
        >
            <span className="theme-toggle-track">
                <span className="theme-toggle-icon theme-toggle-sun">☀️</span>
                <span className="theme-toggle-icon theme-toggle-moon">🌙</span>
                <span className="theme-toggle-thumb" />
            </span>
        </button>
    );
}
