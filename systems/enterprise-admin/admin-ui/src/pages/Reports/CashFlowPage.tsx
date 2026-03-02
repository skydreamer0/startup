import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { reportsApi, CashFlowStatement } from '../../api/reports';
import { expensesApi } from '../../api/expenses';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function CashFlowPage() {
    const [period, setPeriod] = useState(new Date().toISOString().substring(0, 7)); // YYYY-MM
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

    if (isLoading && !data) return <div className="p-20 text-center text-dim">Loading cash flow data...</div>;

    const opCfsColor = (data?.operatingInflows ?? 0) - (data?.operatingOutflows ?? 0) >= 0 ? '#10b981' : '#f87171';

    return (
        <div className="dashboard-content">
            <header className="page-header">
                <div>
                    <h1 className="page-title">Cash Flow Statement</h1>
                    <p className="page-subtitle text-dim">Track money entering and leaving the business, projected runway, and overall liquidity</p>
                </div>
                <div className="flex gap-12 items-center">
                    <input
                        type="month"
                        value={period}
                        onChange={e => setPeriod(e.target.value)}
                        className="input"
                        style={{ padding: '8px 16px', borderRadius: '8px', background: 'var(--bg-hover)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                    />
                    <button className="btn btn-primary" onClick={() => setPeriod(period)}>Refresh</button>
                </div>
            </header>

            {/* Top Summary Cards */}
            <div className="stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '24px', marginBottom: '32px' }}>
                <div className="stat-card glass-card">
                    <div className="stat-label">Beginning Cash</div>
                    <div className="stat-value text-dim mt-4">
                        ${data?.beginningCash.toLocaleString() ?? 0}
                    </div>
                </div>
                <div className="stat-card glass-card">
                    <div className="stat-label">Net Operating Cash</div>
                    <div className="stat-value mt-4" style={{ color: opCfsColor }}>
                        ${((data?.operatingInflows ?? 0) - (data?.operatingOutflows ?? 0)).toLocaleString()}
                    </div>
                    <div className="text-sm mt-2" style={{ color: 'var(--text-muted)' }}>
                        Inflows: ${data?.operatingInflows.toLocaleString() ?? 0}
                    </div>
                </div>
                <div className="stat-card glass-card">
                    <div className="stat-label">Net Investing Cash</div>
                    <div className="stat-value mt-4" style={{ color: '#f59e0b' }}>
                        -${data?.investingOutflows.toLocaleString() ?? 0}
                    </div>
                    <div className="text-sm mt-2" style={{ color: 'var(--text-muted)' }}>
                        Inventory & Assets
                    </div>
                </div>
                <div className="stat-card glass-card">
                    <div className="stat-label">Ending Cash</div>
                    <div className="stat-value mt-4 text-main lg:text-3xl">
                        ${data?.endingCash.toLocaleString() ?? 0}
                    </div>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '24px' }}>
                {/* 6-Month Liquidity Trend */}
                <section className="glass-card" style={{ padding: '24px' }}>
                    <h3 className="text-lg font-semibold mb-6">Cash Position & Net Cash Flow Trend</h3>
                    <div style={{ width: '100%', height: '350px' }}>
                        <ResponsiveContainer>
                            <BarChart data={trend || []} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                <XAxis dataKey="period" stroke="var(--text-muted)" />
                                <YAxis stroke="var(--text-muted)" />
                                <Tooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} contentStyle={{ background: 'var(--bg-card)', border: 'none', borderRadius: '8px' }} />
                                <Legend />
                                <Bar dataKey="endingCash" name="Ending Balance" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="netCashFlow" name="Net Flow" fill="#10b981" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </section>

                {/* Operating Expenses Breakdown */}
                <section className="glass-card" style={{ padding: '24px' }}>
                    <h3 className="text-lg font-semibold mb-6">Operating Expenses (OPEX)</h3>

                    {(!data?.expensesBreakdown || data.expensesBreakdown.length === 0) ? (
                        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 20px', border: '1px dashed var(--border)', borderRadius: '12px' }}>
                            No manual expenses registered for this period.
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {data.expensesBreakdown.map((exp, idx) => (
                                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: '10px' }}>
                                    <div>
                                        <div style={{ fontWeight: 600 }}>{exp.type}</div>
                                        <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{exp.description || 'General'}</div>
                                    </div>
                                    <div style={{ fontSize: '18px', fontWeight: 700, color: '#f87171' }}>
                                        -${exp.amount.toLocaleString()}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Quick Add Expense Action */}
                    <button
                        className="btn btn-outline"
                        style={{ width: '100%', marginTop: '20px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px' }}
                        onClick={() => setShowExpenseModal(true)}
                    >
                        <span>+</span> Log New Expense
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

        mutation.mutate({
            type,
            amount: numAmount,
            description: description || undefined,
            period,
        });
    }

    const expenseTypes = ['OPERATING', 'MARKETING', 'PAYROLL', 'RENT', 'UTILITIES', 'OTHER'];

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} onClick={onClose} />
            <div className="glass-card" style={{ position: 'relative', width: '440px', padding: '32px', borderRadius: '16px' }}>
                <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '24px' }}>Log New Expense</h2>
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '6px' }}>Type</label>
                        <select
                            value={type}
                            onChange={e => setType(e.target.value)}
                            style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', background: 'var(--bg-hover)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                        >
                            {expenseTypes.map(t => (
                                <option key={t} value={t} style={{ background: 'var(--bg-card)' }}>{t}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '6px' }}>Amount ($)</label>
                        <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={amount}
                            onChange={e => setAmount(e.target.value)}
                            placeholder="0.00"
                            required
                            style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', background: 'var(--bg-hover)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '6px' }}>Period (YYYY-MM)</label>
                        <input
                            type="month"
                            value={period}
                            onChange={e => setPeriod(e.target.value)}
                            required
                            style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', background: 'var(--bg-hover)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '6px' }}>Description (optional)</label>
                        <input
                            type="text"
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            placeholder="e.g. Facebook Ad campaign"
                            style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', background: 'var(--bg-hover)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                        />
                    </div>
                    <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                        <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
                        <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={mutation.isPending}>
                            {mutation.isPending ? 'Saving...' : 'Save Expense'}
                        </button>
                    </div>
                    {mutation.isError && (
                        <div style={{ color: '#f87171', fontSize: '13px', marginTop: '4px' }}>
                            Failed to save expense. Please try again.
                        </div>
                    )}
                </form>
            </div>
        </div>
    );
}
