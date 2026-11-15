import '@testing-library/jest-dom/vitest';
import type { FormEvent } from 'react';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ReportReadNotice from './ReportReadNotice';

describe('ReportReadNotice', () => {
    it.each([
        [{ status: 403 }, true, 'error', /存取被拒絕.*不顯示先前資料/],
        [{ status: 500 }, false, 'error', /尚不可用.*不代表金額為零/],
        [{ status: 500 }, true, 'warning', /上次取得.*可能已過期/],
    ] as const)('keeps report error copy and tone for %o, hasData=%s', (error, hasData, tone, copy) => {
        render(<ReportReadNotice label="毛利" isError error={error} hasData={hasData} isFetching={false}
            onRetry={vi.fn()} />);
        expect(screen.getByRole('alert')).toHaveTextContent(copy);
        expect(screen.getByRole('region', { name: '毛利讀取狀態' })).toHaveAttribute('data-tone', tone);
    });

    it('never submits the surrounding form and disables the pending retry', () => {
        const onRetry = vi.fn();
        const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => event.preventDefault());
        const fixture = (isFetching: boolean) => <form onSubmit={onSubmit}>
            <ReportReadNotice label="毛利" isError error={{ status: 500 }} hasData={false}
                isFetching={isFetching} onRetry={onRetry} />
        </form>;
        const { rerender } = render(fixture(false));
        const button = screen.getByRole('button', { name: '重試毛利' });
        expect(button).toHaveAttribute('type', 'button');
        button.focus();
        expect(button).toHaveFocus();
        fireEvent.click(button);
        expect(onRetry).toHaveBeenCalledTimes(1);
        expect(onSubmit).not.toHaveBeenCalled();

        rerender(fixture(true));
        expect(screen.getByRole('button', { name: '重試毛利' })).toBe(button);
        expect(button).toHaveAttribute('aria-disabled', 'true');
        expect(button).toHaveFocus();
        expect(button).toHaveAttribute('aria-busy', 'true');
        expect(screen.getByRole('status')).toHaveTextContent('重試中…');
        fireEvent.click(button);
        expect(onRetry).toHaveBeenCalledTimes(1);
        rerender(fixture(false));
        expect(button).toHaveAttribute('aria-disabled', 'false');
        button.focus();
        expect(button).toHaveFocus();
    });

    it('reuses one stale-report request for two same-render retry promises', async () => {
        const client = new QueryClient();
        const queryKey = ['synthetic-report'];
        client.setQueryData(queryKey, { total: 7 });
        let resolveRead!: (value: { total: number }) => void;
        const queryFn = vi.fn(() => new Promise<{ total: number }>((resolve) => { resolveRead = resolve; }));
        const observer = new QueryObserver(client, { queryKey, queryFn, retry: false });
        try {
            const first = observer.refetch({ cancelRefetch: false });
            const repeat = observer.refetch({ cancelRefetch: false });
            expect(queryFn).toHaveBeenCalledTimes(1);
            resolveRead({ total: 0 });
            const [firstResult, repeatResult] = await Promise.all([first, repeat]);
            expect(firstResult.data).toEqual({ total: 0 });
            expect(repeatResult.data).toEqual({ total: 0 });
        } finally {
            observer.destroy();
            client.clear();
        }
    });

    it('has no notice when the report has no read error', () => {
        render(<ReportReadNotice label="毛利" isError={false} error={null} hasData={false} isFetching={false}
            onRetry={vi.fn()} />);
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
});
