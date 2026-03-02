import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { reportsApi, SalesRankingProduct } from '../../api/reports';
import { PieChart, Pie, Cell, Tooltip as PieTooltip, Legend, ResponsiveContainer } from 'recharts';

export default function SalesRankingPage() {
    const [period, setPeriod] = useState(new Date().toISOString().substring(0, 7)); // YYYY-MM
    const [sortBy, setSortBy] = useState<'revenue' | 'quantity'>('revenue');

    const { data, isLoading } = useQuery({
        queryKey: ['reports', 'sales-ranking', period, sortBy],
        queryFn: () => reportsApi.getSalesRanking(period, sortBy, 20),
    });

    const products: SalesRankingProduct[] = data?.topProducts ?? [];
    const categories = data?.categories ?? [];

    if (isLoading && products.length === 0) return <div className="p-20 text-center text-dim">Loading sales ranking...</div>;

    const COLORS = ['#8b5cf6', '#10b981', '#f59e0b', '#3b82f6', '#ec4899', '#f87171', '#14b8a6', '#6366f1'];

    return (
        <div className="dashboard-content">
            <header className="page-header gap-4 flex-wrap">
                <div>
                    <h1 className="page-title">Product Sales Ranking</h1>
                    <p className="page-subtitle text-dim">Analyze top performing SKUs and category distributions</p>
                </div>
                <div className="flex gap-4 items-center flex-wrap">
                    <select
                        value={sortBy}
                        onChange={e => setSortBy(e.target.value as any)}
                        className="input"
                        style={{ padding: '8px 16px', borderRadius: '8px', background: 'var(--bg-hover)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                    >
                        <option value="revenue" style={{ background: 'var(--bg-card)' }}>Sort by Revenue</option>
                        <option value="quantity" style={{ background: 'var(--bg-card)' }}>Sort by Quantity</option>
                    </select>
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

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '24px' }}>

                {/* Category Breakdown Pie Chart */}
                <section className="glass-card flex flex-col pt-6 pb-2 px-6">
                    <h3 className="text-lg font-semibold mb-2">Category Breakdown (Revenue)</h3>
                    <div style={{ width: '100%', height: '300px', flex: 1 }}>
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
                                    contentStyle={{ background: 'var(--bg-card)', border: 'none', borderRadius: '8px', color: 'var(--text-primary)' }}
                                />
                                <Legend wrapperStyle={{ color: 'var(--text-primary)', fontSize: '12px' }} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </section>

                {/* Top Products Table */}
                <section className="glass-card flex flex-col p-6 h-[500px] overflow-hidden">
                    <h3 className="text-lg font-semibold mb-4">Top 20 Products</h3>
                    <div className="table-container flex-1 overflow-y-auto">
                        <table className="table w-full">
                            <thead className="sticky top-0 bg-[var(--bg-card)] z-10 shadow-sm">
                                <tr>
                                    <th className="text-center w-12">#</th>
                                    <th className="text-left">Product</th>
                                    <th className="text-center">Category</th>
                                    <th className="text-right">Sold Qty</th>
                                    <th className="text-right">Revenue</th>
                                    <th className="text-right">Margin %</th>
                                </tr>
                            </thead>
                            <tbody>
                                {products.length === 0 ? (
                                    <tr><td colSpan={6} className="text-center py-8 text-dim">No sales data for this period.</td></tr>
                                ) : products.map((p, idx) => (
                                    <tr key={p.id} className="hover:bg-[rgba(255,255,255,0.02)] transition-colors">
                                        <td className="text-center font-bold text-dim">
                                            {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}
                                        </td>
                                        <td className="py-3">
                                            <div className="font-semibold">{p.name}</div>
                                            <div className="text-xs text-dim font-mono mt-1">{p.sku}</div>
                                        </td>
                                        <td className="text-center">
                                            <span className="badge" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)' }}>
                                                {p.categoryName}
                                            </span>
                                        </td>
                                        <td className="text-right font-semibold" style={{ color: sortBy === 'quantity' ? '#8b5cf6' : 'var(--text-primary)' }}>
                                            {p.quantity.toLocaleString()}
                                        </td>
                                        <td className="text-right font-semibold" style={{ color: sortBy === 'revenue' ? '#10b981' : 'var(--text-primary)' }}>
                                            ${p.revenue.toLocaleString()}
                                        </td>
                                        <td className="text-right" style={{ color: p.marginPct >= 30 ? '#10b981' : '#f59e0b' }}>
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
