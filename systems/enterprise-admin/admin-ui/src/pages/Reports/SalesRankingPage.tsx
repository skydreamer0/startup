import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { reportsApi, SalesRankingProduct } from '../../api/reports';
import { PieChart, Pie, Cell, Tooltip as PieTooltip, Legend, ResponsiveContainer } from 'recharts';

export default function SalesRankingPage() {
    const [period, setPeriod] = useState(new Date().toISOString().substring(0, 7));
    const [sortBy, setSortBy] = useState<'revenue' | 'quantity'>('revenue');
    const queryClient = useQueryClient();

    const { data, isLoading } = useQuery({
        queryKey: ['reports', 'sales-ranking', period, sortBy],
        queryFn: () => reportsApi.getSalesRanking(period, sortBy, 20),
    });

    const products: SalesRankingProduct[] = data?.topProducts ?? [];
    const categories = data?.categories ?? [];

    if (isLoading && products.length === 0) {
        return <div style={{ padding: '80px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading sales ranking...</div>;
    }

    const COLORS = ['#8b5cf6', '#10b981', '#f59e0b', '#3b82f6', '#ec4899', '#f87171', '#14b8a6', '#6366f1'];

    return (
        <div>
            <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                    <h1 className="page-title">Product Sales Ranking</h1>
                    <p className="page-subtitle">Analyze top performing SKUs and category distributions</p>
                </div>
                <div className="flex gap-12" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
                    <select
                        value={sortBy}
                        onChange={e => setSortBy(e.target.value as any)}
                        className="input-field"
                        style={{ width: '180px' }}
                    >
                        <option value="revenue">Sort by Revenue</option>
                        <option value="quantity">Sort by Quantity</option>
                    </select>
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

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '24px' }}>
                {/* Category Breakdown Pie Chart */}
                <section className="card" style={{ padding: '24px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Category Breakdown (Revenue)</h3>
                    <div style={{ width: '100%', height: '300px' }}>
                        <ResponsiveContainer>
                            <PieChart>
                                <Pie
                                    data={categories}
                                    dataKey="revenue"
                                    nameKey="category"
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={90}
                                    paddingAngle={5}
                                >
                                    {categories.map((_entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <PieTooltip
                                    formatter={(value: any) => `$${Number(value).toLocaleString()}`}
                                    contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)' }}
                                />
                                <Legend wrapperStyle={{ color: 'var(--text-primary)', fontSize: '12px' }} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </section>

                {/* Top Products Table */}
                <section className="card" style={{ padding: '24px', maxHeight: '500px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Top 20 Products</h3>
                    <div className="table-container" style={{ flex: 1, overflowY: 'auto' }}>
                        <table className="table">
                            <thead>
                                <tr>
                                    <th style={{ textAlign: 'center', width: '48px' }}>#</th>
                                    <th>Product</th>
                                    <th style={{ textAlign: 'center' }}>Category</th>
                                    <th style={{ textAlign: 'right' }}>Sold Qty</th>
                                    <th style={{ textAlign: 'right' }}>Revenue</th>
                                    <th style={{ textAlign: 'right' }}>Margin %</th>
                                </tr>
                            </thead>
                            <tbody>
                                {products.length === 0 ? (
                                    <tr><td colSpan={6} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>No sales data for this period.</td></tr>
                                ) : products.map((p, idx) => (
                                    <tr key={p.id}>
                                        <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--text-muted)' }}>
                                            {idx === 0 ? '\uD83E\uDD47' : idx === 1 ? '\uD83E\uDD48' : idx === 2 ? '\uD83E\uDD49' : idx + 1}
                                        </td>
                                        <td>
                                            <div style={{ fontWeight: 600 }}>{p.name}</div>
                                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: '2px' }}>{p.sku}</div>
                                        </td>
                                        <td style={{ textAlign: 'center' }}>
                                            <span className="badge" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)' }}>
                                                {p.categoryName}
                                            </span>
                                        </td>
                                        <td style={{ textAlign: 'right', fontWeight: 600, color: sortBy === 'quantity' ? '#8b5cf6' : 'var(--text-primary)' }} className="tabular">
                                            {p.quantity.toLocaleString()}
                                        </td>
                                        <td style={{ textAlign: 'right', fontWeight: 600, color: sortBy === 'revenue' ? '#10b981' : 'var(--text-primary)' }} className="price">
                                            ${p.revenue.toLocaleString()}
                                        </td>
                                        <td style={{ textAlign: 'right', color: p.marginPct >= 30 ? '#10b981' : '#f59e0b' }} className="tabular">
                                            {p.marginPct}%
                                        </td>
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
