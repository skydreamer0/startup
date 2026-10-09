import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { CashFlowStatement } from '../api/reports';
import CashFlowPage from '../pages/Reports/CashFlowPage';

const { httpGet } = vi.hoisted(() => ({ httpGet: vi.fn() }));
vi.mock('../api/client', () => ({ default: { get: httpGet } }));
// Give the real chart a fixed test-only viewport; JSDOM cannot measure layout.
vi.mock('recharts', async importOriginal => {
    const original = await importOriginal<typeof import('recharts')>();
    return { ...original, ResponsiveContainer: ({ children }: { children: ReactNode }) =>
        <original.ResponsiveContainer width={600} height={350}>{children as React.ReactElement}</original.ResponsiveContainer> };
});
const fixture: CashFlowStatement = {
    period: '2026-10', beginningCash: 300000, operatingInflows: 1500,
    operatingOutflows: 200, investingOutflows: 400, financingCashFlow: 0,
    netCashFlow: 900, endingCash: 300900,
    expensesBreakdown: [{ type: 'RENT', amount: 200, description: 'Synthetic expense' }],
};
function successfulReads(statement = fixture) {
    httpGet.mockImplementation(async (path: string) => ({ data: {
        success: true, data: path.includes('/trend?') ? [statement] : statement,
    } }));
}
const clients: QueryClient[] = [];
function setup() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    clients.push(client);
    return render(<QueryClientProvider client={client}><CashFlowPage /></QueryClientProvider>);
}
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); vi.resetAllMocks(); });

describe('cash flow estimate disclosure', () => {
    it('discloses demo assumptions before report requests complete', () => {
        httpGet.mockImplementation(() => new Promise(() => {}));
        setup();
        expect(screen.getByRole('note', { name: '示範／估算，非實際現金流' })).toHaveTextContent('300,000');
        expect(screen.getByText('Loading cash flow data...')).toBeInTheDocument();
    });
    it('keeps API numbers and expense text while labelling summaries and chart series', async () => {
        successfulReads();
        setup();
        expect(await screen.findByText('$300,900')).toBeInTheDocument();
        for (const value of ['$300,000', '$1,300', '-$400', 'Synthetic expense']) {
            expect(screen.getByText(value)).toBeInTheDocument();
        }
        for (const label of ['Beginning Cash（示範期初）', 'Net Operating Cash（估算）', 'Net Investing Cash（估算）', 'Ending Cash（估算）', 'Ending Balance（估算）', 'Net Flow（估算）']) {
            expect(screen.getByText(label)).toBeInTheDocument();
        }
        const notice = screen.getByRole('note', { name: '示範／估算，非實際現金流' });
        for (const limitation of ['未依實際付款／退款事件對帳', '入庫數量 × 商品目前成本', '非實際進貨付款，也非歷史成本', '營運支出來自手動登錄', '六個月趨勢也從此假設起算']) {
            expect(notice).toHaveTextContent(limitation);
        }
        const details = screen.getByText('查看估算來源與限制').closest('details');
        expect(details).not.toHaveAttribute('open');
        fireEvent.click(screen.getByText('查看估算來源與限制'));
        expect(details).toHaveAttribute('open');
    });

    it('keeps disclosure visible after initial request failure', async () => {
        httpGet.mockRejectedValue(new Error('Synthetic failure'));
        setup();
        await waitFor(() => expect(screen.queryByText('Loading cash flow data...')).not.toBeInTheDocument());
        expect(screen.getByRole('note', { name: '示範／估算，非實際現金流' })).toHaveTextContent('勿作實際營運餘額或對帳依據');
    });

    it('keeps disclosure and old numbers during refresh and a failed refresh', async () => {
        successfulReads();
        setup();
        await screen.findByText('$300,900');
        let rejectRequest!: (reason: Error) => void;
        const request = new Promise((_, reject) => { rejectRequest = reject; });
        httpGet.mockReturnValue(request);
        fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
        expect(screen.getByRole('note', { name: '示範／估算，非實際現金流' })).toBeInTheDocument();
        expect(screen.getByText('$300,900')).toBeInTheDocument();
        rejectRequest(new Error('Synthetic refresh failure'));
        await waitFor(() => expect(clients[0].isFetching()).toBe(0));
        expect(screen.getByRole('note', { name: '示範／估算，非實際現金流' })).toBeInTheDocument();
        expect(screen.getByText('$300,900')).toBeInTheDocument();
    });

    it('retains warning across period changes without rewriting report values', async () => {
        successfulReads();
        const { container } = setup();
        await screen.findByText('$300,900');
        httpGet.mockImplementation(() => new Promise(() => {}));
        fireEvent.change(container.querySelector('input[type="month"]')!, { target: { value: '2026-09' } });
        expect(screen.getByRole('note', { name: '示範／估算，非實際現金流' })).toBeInTheDocument();
        expect(screen.getByText('Loading cash flow data...')).toBeInTheDocument();
        await waitFor(() => expect(httpGet).toHaveBeenCalledWith('/reports/cashflow?period=2026-09'));
        expect(httpGet).toHaveBeenCalledWith('/reports/cashflow/trend?to=2026-09');
    });
});
