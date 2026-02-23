import { useEffect, useState } from 'react';
import { reportsApi, CashFlowStatement } from '../../api/reports';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function CashFlowPage() {
    const [period, setPeriod] = useState(new Date().toISOString().substring(0, 7)); // YYYY-MM
    const [data, setData] = useState<CashFlowStatement | null>(null);
    const [trend, setTrend] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        Promise.all([
            reportsApi.getCashFlowStatement(period),
            reportsApi.getCashFlowTrend(period)
        ]).then(([statement, trendData]) => {
            setData(statement);
            setTrend(trendData);
        }).catch(console.error).finally(() => setLoading(false));
    }, [period]);

    if (loading && !data) return <div className="p-20 text-center text-dim">Loading cash flow data...</div>;

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
                        style={{ padding: '8px 16px', borderRadius: '8px', background: 'var(--bg-glass)', color: 'var(--text-main)', border: '1px solid var(--border-light)' }}
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
                    <div className="text-sm mt-2" style={{ color: 'var(--text-dim)' }}>
                        Inflows: ${data?.operatingInflows.toLocaleString() ?? 0}
                    </div>
                </div>
                <div className="stat-card glass-card">
                    <div className="stat-label">Net Investing Cash</div>
                    <div className="stat-value mt-4" style={{ color: '#f59e0b' }}>
                        -${data?.investingOutflows.toLocaleString() ?? 0}
                    </div>
                    <div className="text-sm mt-2" style={{ color: 'var(--text-dim)' }}>
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
                            <BarChart data={trend} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                <XAxis dataKey="period" stroke="var(--text-dim)" />
                                <YAxis stroke="var(--text-dim)" />
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
                        <div className="text-center text-dim p-10 border border-dashed border-[var(--border-light)] rounded-lg">
                            No manual expenses registered for this period.
                        </div>
                    ) : (
                        <div className="flex flex-col gap-4">
                            {data.expensesBreakdown.map((exp, idx) => (
                                <div key={idx} className="flex justify-between items-center p-4 bg-[rgba(255,255,255,0.02)] border border-[var(--border-light)] rounded-lg">
                                    <div>
                                        <div className="font-semibold">{exp.type}</div>
                                        <div className="text-sm text-dim">{exp.description || 'General'}</div>
                                    </div>
                                    <div className="text-lg font-bold" style={{ color: '#f87171' }}>
                                        -${exp.amount.toLocaleString()}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Quick Add Expense Action */}
                    <button className="btn btn-outline w-full mt-6 flex justify-center items-center gap-2">
                        <span>+</span> Log New Expense
                    </button>
                </section>
            </div>
        </div>
    );
}
