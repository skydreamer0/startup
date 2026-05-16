import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { reportsApi, MarginAnalysis } from '../../api/reports';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function MarginAnalysisPage() {
    const [period, setPeriod] = useState(new Date().toISOString().substring(0, 7));
    const queryClient = useQueryClient();

    const { data, isLoading } = useQuery<MarginAnalysis>({
        queryKey: ['reports', 'margin', period],
        queryFn: () => reportsApi.getMarginAnalysis(period),
    });

    const { data: trend } = useQuery({
        queryKey: ['reports', 'margin-trend', period],
        queryFn: () => reportsApi.getMarginTrend(period),
    });

    if (isLoading && !data) {
        return <div style={{ padding: '80px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading margin data...</div>;
    }

    const targetMargin = 28.6;
    const currentMargin = data?.summary.totalMarginPct || 0;
    const isTargetMet = currentMargin >= targetMargin;

    return (
        <div>
            <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1 className="page-title">Gross Margin Analysis</h1>
                    <p className="page-subtitle">SKU-level profitability and historical margin trends</p>
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
                    <div className="stat-label">Total Revenue</div>
                    <div className="stat-value" style={{ marginTop: '12px' }}>
                        ${data?.summary.totalRevenue.toLocaleString() ?? 0}
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Total COGS</div>
                    <div className="stat-value" style={{ marginTop: '12px', color: '#f87171' }}>
                        ${data?.summary.totalCogs.toLocaleString() ?? 0}
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Gross Margin ($)</div>
                    <div className="stat-value" style={{ marginTop: '12px', color: '#10b981' }}>
                        ${data?.summary.totalMargin.toLocaleString() ?? 0}
                    </div>
                </div>
                <div className="stat-card" style={{ border: isTargetMet ? '1px solid #10b981' : '1px solid #f59e0b' }}>
                    <div className="stat-label">Gross Margin (%)</div>
                    <div className="stat-value" style={{ marginTop: '12px', color: isTargetMet ? '#10b981' : '#f59e0b' }}>
                        {currentMargin}%
                    </div>
                    <div style={{ fontSize: '12px', marginTop: '8px', color: 'var(--text-muted)' }}>
                        Target: {targetMargin}% ({isTargetMet ? 'PASSED' : 'MISSED'})
                    </div>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                {/* Trend Chart */}
                <section className="card" style={{ padding: '24px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '20px' }}>6-Month Margin Trend</h3>
                    <div style={{ width: '100%', height: '300px' }}>
                        <ResponsiveContainer>
                            <LineChart data={trend || []}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                                <XAxis dataKey="period" stroke="var(--text-muted)" />
                                <YAxis yAxisId="left" stroke="var(--text-muted)" />
                                <YAxis yAxisId="right" orientation="right" stroke="#10b981" domain={[0, 100]} />
                                <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px' }} />
                                <Line yAxisId="left" type="monotone" dataKey="revenue" stroke="#8b5cf6" name="Revenue ($)" strokeWidth={2} />
                                <Line yAxisId="right" type="monotone" dataKey="marginPct" stroke="#10b981" name="Margin (%)" strokeWidth={2} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </section>

                {/* SKU Breakdown Table */}
                <section className="card" style={{ padding: '24px', overflowY: 'auto', maxHeight: '500px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '20px' }}>SKU Profitability Breakdown</h3>
                    <div className="table-container">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Product</th>
                                    <th style={{ textAlign: 'right' }}>Qty</th>
                                    <th style={{ textAlign: 'right' }}>Revenue</th>
                                    <th style={{ textAlign: 'right' }}>Margin %</th>
                                    <th style={{ textAlign: 'right' }}>Contrib. %</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data?.products.map(p => (
                                    <tr key={p.id}>
                                        <td>
                                            <div style={{ fontWeight: 600 }}>{p.name}</div>
                                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{p.sku}</div>
                                        </td>
                                        <td style={{ textAlign: 'right' }}>{p.qty}</td>
                                        <td style={{ textAlign: 'right' }}>${p.revenue.toLocaleString()}</td>
                                        <td style={{ textAlign: 'right', color: p.marginPct >= targetMargin ? '#10b981' : '#f87171' }}>
                                            {p.marginPct}%
                                        </td>
                                        <td style={{ textAlign: 'right' }}>{p.contributionPct}%</td>
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
