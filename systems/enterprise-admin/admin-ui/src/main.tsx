import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from './contexts/ThemeContext';
import { ToastProvider } from './components/Toast';
import App from './App';
import { AuthCacheBoundary } from './hooks/AuthCacheBoundary';
import './index.css';

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 30 * 1000,         // 30 seconds
            refetchOnWindowFocus: true,
            retry: 1,
        },
    },
});

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <ThemeProvider>
            <QueryClientProvider client={queryClient}>
                <AuthCacheBoundary>
                <ToastProvider>
                    <App />
                </ToastProvider>
                </AuthCacheBoundary>
            </QueryClientProvider>
        </ThemeProvider>
    </StrictMode>,
);
