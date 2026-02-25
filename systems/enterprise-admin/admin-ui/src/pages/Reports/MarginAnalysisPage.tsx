import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { reportsApi, MarginAnalysis } from '../../api/reports';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function MarginAnalysisPage() {
    const [period, setPeriod] = useState(new Date().toISOString().substring(0, 7)); // YYYY-MM

    const { data, isLoading } = useQuery<MarginAnalysis>({
        queryKey: ['reports', 'margin', period],
        queryFn: () => reportsApi.getMarginAnalysis(period),
    });

    const { data: trend } = useQuery({
        queryKey: ['reports', 'margin-trend', period],
        queryFn: () => reportsApi.getMarginTrend(period),
    });

    if (isLoading && !data) return <div className="p-20 text-center text-dim">Loading margin data...</div>;

    const targetMargin = 28.6; // Doc #13 Reference
    const currentMargin = data?.summary.totalMarginPct || 0;
    const isTargetMet = currentMargin >= targetMargin;

    return (
        <div className="dashboard-content">
            <header className="page-header">
                <div>
                    <h1 className="page-title">Gross Margin Analysis</h1>
                    <p className="page-subtitle text-dim">SKU-level profitability and historical margin trends</p>
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
                    <div className="stat-label">Total Revenue</div>
                    <div className="stat-value text-main lg:text-3xl mt-4">
                        ${data?.summary.totalRevenue.toLocaleString() ?? 0}
                    </div>
                </div>
                <div className="stat-card glass-card">
                    <div className="stat-label">Total COGS</div>
                    <div className="stat-value mt-4" style={{ color: '#f87171' }}>
                        ${data?.summary.totalCogs.toLocaleString() ?? 0}
                    </div>
                </div>
                <div className="stat-card glass-card">
                    <div className="stat-label">Gross Margin ($)</div>
                    <div className="stat-value mt-4" style={{ color: '#10b981' }}>
                        ${data?.summary.totalMargin.toLocaleString() ?? 0}
                    </div>
                </div>
                <div className="stat-card glass-card" style={{ border: isTargetMet ? '1px solid #10b981' : '1px solid #f59e0b' }}>
                    <div className="stat-label">Gross Margin (%)</div>
                    <div className="stat-value mt-4" style={{ color: isTargetMet ? '#10b981' : '#f59e0b' }}>
                        {currentMargin}%
                    </div>
                    <div className="text-sm mt-2" style={{ color: 'var(--text-dim)' }}>
                        Target: {targetMargin}% ({isTargetMet ? 'PASSED' : 'MISSED'})
                    </div>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                {/* Trend Chart */}
                <section className="glass-card" style={{ padding: '24px' }}>
                    <h3 className="text-lg font-semibold mb-6">6-Month Margin Trend</h3>
                    <div style={{ width: '100%', height: '300px' }}>
                        <ResponsiveContainer>
                            <LineChart data={trend || []}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                                <XAxis dataKey="period" stroke="var(--text-dim)" />
                                <YAxis yAxisId="left" stroke="var(--text-dim)" />
                                <YAxis yAxisId="right" orientation="right" stroke="#10b981" domain={[0, 100]} />
                                <Tooltip contentStyle={{ background: 'var(--bg-card)', border: 'none', borderRadius: '8px' }} />
                                <Line yAxisId="left" type="monotone" dataKey="revenue" stroke="#8b5cf6" name="Revenue ($)" strokeWidth={2} />
                                <Line yAxisId="right" type="monotone" dataKey="marginPct" stroke="#10b981" name="Margin (%)" strokeWidth={2} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </section>

                {/* SKU Breakdown Table */}
                <section className="glass-card" style={{ padding: '24px', overflowY: 'auto', maxHeight: '500px' }}>
                    <h3 className="text-lg font-semibold mb-6">SKU Profitability Breakdown</h3>
                    <div className="table-container">
                        <table className="table w-full">
                            <thead>
                                <tr>
                                    <th className="text-left">Product</th>
                                    <th className="text-right">Qty</th>
                                    <th className="text-right">Revenue</th>
                                    <th className="text-right">Margin %</th>
                                    <th className="text-right">Contrib. %</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data?.products.map(p => (
                                    <tr key={p.id}>
                                        <td className="py-3">
                                            <div className="font-semibold">{p.name}</div>
                                            <div className="text-xs text-dim">{p.sku}</div>
                                        </td>
                                        <td className="text-right">{p.qty}</td>
                                        <td className="text-right">${p.revenue.toLocaleString()}</td>
                                        <td className="text-right" style={{ color: p.marginPct >= targetMargin ? '#10b981' : '#f87171' }}>
                                            {p.marginPct}%
                                        </td>
                                        <td className="text-right">{p.contributionPct}%</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            </div>
        </div>
    );
}
