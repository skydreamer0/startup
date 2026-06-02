import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { reportsApi, CashFlowStatement } from '../../api/reports';
import { expensesApi } from '../../api/expenses';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function CashFlowPage() {
    const [period, setPeriod] = useState(new Date().toISOString().substring(0, 7));
    const [showExpenseModal, setShowExpenseModal] = useState(false);
    const queryClient = useQueryClient();

    const { data, isLoading } = useQuery<CashFlowStatement>({
        queryKey: ['reports', 'cashflow', period],
        queryFn: () => reportsApi.getCashFlowStatement(period),
    });

    const { data: trend } = useQuery({
        queryKey: ['reports', 'cashflow-trend', period],
        queryFn: () => reportsApi.getCashFlowTrend(period),
    });

    if (isLoading && !data) {
        return <div style={{ padding: '80px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading cash flow data...</div>;
    }

    const opCfsColor = (data?.operatingInflows ?? 0) - (data?.operatingOutflows ?? 0) >= 0 ? '#10b981' : '#f87171';

    return (
        <div className="admin-page report-page cashflow-report-page">
            <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1 className="page-title">Cash Flow Statement</h1>
                    <p className="page-subtitle">Track money entering and leaving the business</p>
                </div>
                <div className="flex gap-12" style={{ alignItems: 'center' }}>
                    <input
                        type="month"
                        value={period}
                        onChange={e => setPeriod(e.target.value)}
                        className="input-field"
                        style={{ width: '180px' }}
                    />
                    <button className="btn btn-primary" onClick={() => queryClient.invalidateQueries()}>Refresh</button>
                </div>
            </header>

            {/* Top Summary Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginBottom: '32px' }}>
                <div className="stat-card">
                    <div className="stat-label">Beginning Cash</div>
                    <div className="stat-value price-md" style={{ marginTop: '12px', color: 'var(--text-muted)' }}>
                        ${data?.beginningCash.toLocaleString() ?? 0}
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Net Operating Cash</div>
                    <div className="stat-value price-md" style={{ marginTop: '12px', color: opCfsColor }}>
                        ${((data?.operatingInflows ?? 0) - (data?.operatingOutflows ?? 0)).toLocaleString()}
                    </div>
                    <div style={{ fontSize: '12px', marginTop: '8px', color: 'var(--text-muted)' }}>
                        Inflows: ${data?.operatingInflows.toLocaleString() ?? 0}
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Net Investing Cash</div>
                    <div className="stat-value price-md" style={{ marginTop: '12px', color: '#f59e0b' }}>
                        -${data?.investingOutflows.toLocaleString() ?? 0}
                    </div>
                    <div style={{ fontSize: '12px', marginTop: '8px', color: 'var(--text-muted)' }}>
                        Inventory & Assets
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Ending Cash</div>
                    <div className="stat-value price-md" style={{ marginTop: '12px' }}>
                        ${data?.endingCash.toLocaleString() ?? 0}
                    </div>
                </div>
            </div>

            <div className="report-grid-wide">
                {/* 6-Month Liquidity Trend */}
                <section className="card" style={{ padding: '24px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '20px' }}>Cash Position & Net Cash Flow Trend</h3>
                    <div style={{ width: '100%', height: '350px' }}>
                        <ResponsiveContainer>
                            <BarChart data={trend || []} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                <XAxis dataKey="period" stroke="var(--text-muted)" />
                                <YAxis stroke="var(--text-muted)" />
                                <Tooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px' }} />
                                <Legend />
                                <Bar dataKey="endingCash" name="Ending Balance" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="netCashFlow" name="Net Flow" fill="#10b981" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </section>

                {/* Operating Expenses Breakdown */}
                <section className="card" style={{ padding: '24px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '20px' }}>Operating Expenses (OPEX)</h3>

                    {(!data?.expensesBreakdown || data.expensesBreakdown.length === 0) ? (
                        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 20px', border: '1px dashed var(--border)', borderRadius: '12px' }}>
                            No manual expenses registered for this period.
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {data.expensesBreakdown.map((exp, idx) => (
                                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px', background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: '10px' }}>
                                    <div>
                                        <div style={{ fontWeight: 600 }}>{exp.type}</div>
                                        <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{exp.description || 'General'}</div>
                                    </div>
                                    <div className="price" style={{ fontSize: '18px', fontWeight: 700, color: '#f87171' }}>
                                        -${exp.amount.toLocaleString()}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    <button
                        className="btn btn-ghost"
                        style={{ width: '100%', marginTop: '20px' }}
                        onClick={() => setShowExpenseModal(true)}
                    >
                        + Log New Expense
                    </button>
                </section>
            </div>

            {/* Expense Modal */}
            {showExpenseModal && (
                <ExpenseModal
                    defaultPeriod={period}
                    onClose={() => setShowExpenseModal(false)}
                    onSuccess={() => {
                        setShowExpenseModal(false);
                        queryClient.invalidateQueries({ queryKey: ['reports', 'cashflow'] });
                    }}
                />
            )}
        </div>
    );
}

/** Expense Entry Modal */
function ExpenseModal({ defaultPeriod, onClose, onSuccess }: { defaultPeriod: string; onClose: () => void; onSuccess: () => void }) {
    const [type, setType] = useState('OPERATING');
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');
    const [period, setPeriod] = useState(defaultPeriod);

    const mutation = useMutation({
        mutationFn: (data: { type: string; amount: number; description?: string; period: string }) =>
            expensesApi.createExpense(data),
        onSuccess,
    });

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        const numAmount = parseFloat(amount);
        if (isNaN(numAmount) || numAmount <= 0) return;
        mutation.mutate({ type, amount: numAmount, description: description || undefined, period });
    }

    const expenseTypes = ['OPERATING', 'MARKETING', 'PAYROLL', 'RENT', 'UTILITIES', 'OTHER'];

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content card" onClick={(e) => e.stopPropagation()}>
                <h2 className="modal-title">Log New Expense</h2>
                <form onSubmit={handleSubmit}>
                    <div className="login-form">
                        <div className="input-group">
                            <label className="input-label">Type</label>
                            <select className="input-field" value={type} onChange={e => setType(e.target.value)}>
                                {expenseTypes.map(t => (
                                    <option key={t} value={t}>{t}</option>
                                ))}
                            </select>
                        </div>
                        <div className="input-group">
                            <label className="input-label">Amount ($)</label>
                            <input className="input-field" type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" required />
                        </div>
                        <div className="input-group">
                            <label className="input-label">Period (YYYY-MM)</label>
                            <input className="input-field" type="month" value={period} onChange={e => setPeriod(e.target.value)} required />
                        </div>
                        <div className="input-group">
                            <label className="input-label">Description (optional)</label>
                            <input className="input-field" type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Facebook Ad campaign" />
                        </div>
                    </div>
                    <div className="modal-actions">
                        <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
                        <button type="submit" className="btn btn-primary" disabled={mutation.isPending}>
                            {mutation.isPending ? 'Saving...' : 'Save Expense'}
                        </button>
                    </div>
                    {mutation.isError && (
                        <div style={{ color: '#f87171', fontSize: '13px', marginTop: '8px' }}>
                            Failed to save expense. Please try again.
                        </div>
                    )}
                </form>
            </div>
        </div>
    );
}
