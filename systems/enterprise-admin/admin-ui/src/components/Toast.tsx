import { useState, useCallback, useEffect, type ReactNode } from 'react';
import { ToastContext, type ToastContextValue, type ToastType } from './toastContext';

/* ─────────────────────────────────────────────
   Global Toast Notification System
   Usage:
     const toast = useToast();
     toast.success('Data refreshed');
     toast.error('Failed to save');
   ───────────────────────────────────────────── */

interface Toast {
    id: number;
    message: string;
    type: ToastType;
    exiting?: boolean;
}

const ICONS: Record<ToastType, string> = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ',
};

let idCounter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const removeToast = useCallback((id: number) => {
        setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)));
        setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 260);
    }, []);

    const addToast = useCallback(
        (type: ToastType, message: string) => {
            const id = ++idCounter;
            setToasts((prev) => [...prev, { id, message, type }]);
            setTimeout(() => removeToast(id), 4000);
        },
        [removeToast],
    );

    const api = useCallback(
        (): ToastContextValue => ({
            success: (msg) => addToast('success', msg),
            error: (msg) => addToast('error', msg),
            warning: (msg) => addToast('warning', msg),
            info: (msg) => addToast('info', msg),
        }),
        [addToast],
    );

    // Memoize the context value
    const [value] = useState(api);
    useEffect(() => {
        Object.assign(value, api());
    }, [api, value]);

    return (
        <ToastContext.Provider value={value}>
            {children}
            <div className="toast-container" role="status" aria-live="polite">
                {toasts.map((t) => (
                    <div
                        key={t.id}
                        className={`toast toast-${t.type} ${t.exiting ? 'exiting' : ''}`}
                    >
                        <span className="toast-icon">{ICONS[t.type]}</span>
                        <span>{t.message}</span>
                        <button
                            className="toast-close"
                            onClick={() => removeToast(t.id)}
                            aria-label="Dismiss notification"
                        >
                            ✕
                        </button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}
