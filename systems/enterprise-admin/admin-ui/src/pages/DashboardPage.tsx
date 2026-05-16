import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { dashboardApi, DashboardKPIs, CrmMetrics, AnalyticsKPIs, AnalyticsTrend, BonusGateStatus, HeatmapCell } from '../api/dashboard';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import DashboardSkeleton from '../components/Skeleton';
import { useToast } from '../components/Toast';

export default function DashboardPage() {
    const queryClient = useQueryClient();
    const toast = useToast();

    const { data: kpis, isLoading: kpisLoading } = useQuery<DashboardKPIs>({
        queryKey: ['dashboard', 'kpis'],
        queryFn: dashboardApi.getKPIs,
    });

    const { data: crm } = useQuery<CrmMetrics>({
        queryKey: ['dashboard', 'crm'],
        queryFn: dashboardApi.getCrmMetrics,
    });

    const { data: analytics } = useQuery<AnalyticsKPIs>({
        queryKey: ['dashboard', 'analytics'],
        queryFn: () => dashboardApi.getAnalyticsKpis(),
    });

    const { data: trends } = useQuery<AnalyticsTrend[]>({
        queryKey: ['dashboard', 'trends'],
        queryFn: () => dashboardApi.getAnalyticsTrends(),
    });

    const { data: bonusGate, isLoading: bonusLoading } = useQuery<BonusGateStatus>({
        queryKey: ['dashboard', 'bonus-gate'],
        queryFn: () => dashboardApi.getBonusGate(),
    });

    const { data: heatmap } = useQuery<HeatmapCell[]>({
        queryKey: ['dashboard', 'heatmap'],
        queryFn: () => dashboardApi.getHeatmap(),
    });

    function handleRefresh() {
        queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        toast.info('Refreshing dashboard data…');
    }

    if (kpisLoading) {
        return <DashboardSkeleton />;
    }

    return (
        <div className="dashboard-content">
            <header className="page-header">
                <div>
                    <h1 className="page-title">Operations Overview</h1>
                    <p className="page-subtitle">Real-time business intelligence &amp; operational health</p>
                </div>
                <div className="flex gap-12">
                    <button className="btn btn-ghost">Export Report</button>
                    <button className="btn btn-primary" onClick={handleRefresh}>Refresh Data</button>
                </div>
            </header>

            {/* ── KPI Cards Grid ── */}
            <div className="stat-grid stagger-fade">
                <div className="stat-card card">
                    <div className="stat-header">
                        <span className="stat-label">Lifetime Revenue</span>
                        <div className="stat-icon" style={{ color: 'var(--accent)', background: 'var(--accent-subtle)' }}>💰</div>
                    </div>
                    <div className="stat-value price-lg">
                        ${kpis?.revenue.totalLifetime.toLocaleString() ?? 0}
                    </div>
                    <div className="text-sm text-success">+12.5% from last month</div>
                </div>

                <div className="stat-card card">
                    <div className="stat-header">
                        <span className="stat-label">Total Customers</span>
                        <div className="stat-icon" style={{ color: 'var(--success)', background: 'var(--success-bg)' }}>👤</div>
                    </div>
                    <div className="stat-value price-lg">
                        {kpis?.customers.total ?? 0}
                    </div>
                    <div className="text-sm text-muted">
                        <span className="text-accent">{kpis?.customers.newThisMonth ?? 0}</span> new this month
                    </div>
                </div>

                {/* Bonus Gate KPI Replacement */}
                <div className="stat-card card" style={{ borderTop: bonusGate?.gatePass ? '4px solid var(--success)' : '4px solid var(--danger)' }}>
                    <div className="stat-header">
                        <span className="stat-label">Bonus Gate (This Mth)</span>
                        <div className="stat-icon" style={{ color: bonusGate?.gatePass ? 'var(--success)' : 'var(--danger)', background: bonusGate?.gatePass ? 'var(--success-bg)' : 'var(--danger-bg)' }}>🎯</div>
                    </div>
                    <div className="flex" style={{ gap: '1rem', marginTop: '0.5rem' }}>
                        <div>
                            <div className="metric-value font-mono price-md" style={{ fontSize: '1.25rem', color: bonusGate?.grossMarginPass ? 'var(--success)' : 'var(--danger)' }}>{bonusGate?.grossMarginPct ?? 0}%</div>
                            <div className="text-xs text-muted">Margin (≥30%)</div>
                        </div>
                        <div>
                            <div className="metric-value font-mono price-md" style={{ fontSize: '1.25rem', color: bonusGate?.cccPass ? 'var(--success)' : 'var(--danger)' }}>{bonusGate?.cccDays ?? 0}d</div>
                            <div className="text-xs text-muted">CCC (≤30d)</div>
                        </div>
                    </div>
                    <div className="text-sm mt-2 font-semibold flex justify-between">
                        <span>Status: <span className={bonusGate?.gatePass ? 'text-success' : 'text-danger'}>{bonusGate?.gatePass ? 'PASS' : 'FAIL'}</span></span>
                        {bonusGate?.gatePass && <span className="text-accent price">Pool: ~${bonusGate?.estimatedBonusPool.toLocaleString()}</span>}
                    </div>
                </div>

                <div className="stat-card card">
                    <div className="stat-header">
                        <span className="stat-label">LTV (per Customer)</span>
                        <div className="stat-icon" style={{ color: 'var(--chart-5)', background: 'rgba(139, 92, 246, 0.08)' }}>💎</div>
                    </div>
                    <div className="stat-value price-lg">
                        ${analytics?.ltv_twd?.toLocaleString() ?? 0}
                    </div>
                    <div className="text-sm text-muted price">
                        CAC: ${analytics?.cac_twd?.toLocaleString() ?? 0}
                    </div>
                </div>

                <div className="stat-card card">
                    <div className="stat-header">
                        <span className="stat-label">Inventory Alerts</span>
                        <div className="stat-icon" style={{ color: 'var(--danger)', background: 'var(--danger-bg)' }}>⚠️</div>
                    </div>
                    <div className="stat-value price-lg" style={{ color: (kpis?.inventory.lowStockCount ?? 0) > 0 ? 'var(--danger)' : 'var(--success)' }}>
                        {kpis?.inventory.lowStockCount ?? 0}
                    </div>
                    <div className="text-sm text-muted">SKUs below safety stock</div>
                </div>
            </div>

            {/* ── KPI Trend Chart ── */}
            {trends && trends.length > 0 && (
                <section className="card section-card" style={{ marginBottom: 32 }}>
                    <h3 className="section-title">
                        <span className="section-icon">📉</span> KPI 6-Month Trend
                    </h3>
                    <div style={{ width: '100%', height: 300 }}>
                        <ResponsiveContainer>
                            <AreaChart data={trends} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="gradMargin" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="gradAov" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                                <XAxis dataKey="period" stroke="var(--text-muted)" fontSize={12} />
                                <YAxis yAxisId="left" stroke="var(--text-muted)" fontSize={12} domain={[0, 100]} />
                                <YAxis yAxisId="right" orientation="right" stroke="#8b5cf6" fontSize={12} />
                                <Tooltip
                                    contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px', color: 'var(--text-primary)' }}
                                    labelStyle={{ color: 'var(--text-muted)', marginBottom: '4px' }}
                                />
                                <Legend wrapperStyle={{ fontSize: '12px', color: 'var(--text-muted)' }} />
                                <Area yAxisId="left" type="monotone" dataKey="gross_margin_pct" name="Gross Margin (%)" stroke="#10b981" fillOpacity={1} fill="url(#gradMargin)" strokeWidth={2} />
                                <Area yAxisId="right" type="monotone" dataKey="aov_twd" name="AOV ($)" stroke="#8b5cf6" fillOpacity={1} fill="url(#gradAov)" strokeWidth={2} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </section>
            )}

            {/* ── Secondary Sections ── */}
            <div className="dashboard-grid-main">

                {/* CRM & Customer Health */}
                <section className="card section-card">
                    <h3 className="section-title">
                        <span className="section-icon">📊</span> Customer Health Metrics
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 20 }}>
                        <div className="metric-box">
                            <div className="stat-label">Avg. Customer LTV</div>
                            <div className="metric-value price" style={{ color: 'var(--accent-text)' }}>
                                ${crm?.averageLTV.toLocaleString() ?? 0}
                            </div>
                        </div>
                        <div className="metric-box">
                            <div className="stat-label">90d Churn Risk</div>
                            <div className="metric-value tabular" style={{ color: (crm?.churnRate90d ?? 0) > 20 ? 'var(--danger)' : 'var(--warning)' }}>
                                {crm?.churnRate90d ?? 0}%
                            </div>
                        </div>
                        <div className="metric-box">
                            <div className="stat-label">Repurchase Rate</div>
                            <div className="metric-value tabular" style={{ color: (crm?.repurchaseRate ?? 0) > 30 ? 'var(--success)' : 'var(--warning)' }}>
                                {crm?.repurchaseRate ?? 0}%
                            </div>
                        </div>
                        <div className="metric-box">
                            <div className="stat-label">Average Order Value (AOV)</div>
                            <div className="metric-value price" style={{ color: 'var(--success)' }}>
                                ${analytics?.aov_twd?.toLocaleString() ?? 0}
                            </div>
                        </div>
                    </div>
                </section>

                {/* Supply Chain Stats */}
                <section className="card section-card">
                    <h3 className="section-title">🏢 Supply Chain</h3>
                    <div className="flex flex-col gap-16">
                        <div className="supply-row">
                            <span className="stat-label">Total SKUs</span>
                            <span className="font-semibold tabular">{kpis?.inventory.totalProducts ?? 0}</span>
                        </div>
                        <div className="supply-row">
                            <span className="stat-label">Avg. Delivery Rate</span>
                            <span className="badge badge-success tabular" style={{ background: (kpis?.suppliers.avgDeliveryReliability ?? 0) >= 95 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)' }}>
                                {kpis?.suppliers.avgDeliveryReliability ?? '--'}%
                            </span>
                        </div>
                        <div className="supply-row">
                            <span className="stat-label">Avg. Defect Rate</span>
                            <span className="badge tabular" style={{ background: (kpis?.suppliers.avgDefectRate ?? 0) > 2 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)', color: (kpis?.suppliers.avgDefectRate ?? 0) > 2 ? '#ef4444' : '#10b981' }}>
                                {kpis?.suppliers.avgDefectRate ?? '--'}%
                            </span>
                        </div>
                    </div>
                </section>

                {/* Sales Activity Heatmap */}
                <section className="card section-card" style={{ gridColumn: '1 / -1' }}>
                    <h3 className="section-title">
                        <span className="section-icon">🔥</span> Sales Activity Heatmap
                    </h3>
                    <p className="text-muted text-sm mb-4">Concentration of orders by day of week and hour of day.</p>
                    <div className="heatmap-container" style={{ overflowX: 'auto', paddingBottom: '1rem' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'min-content repeat(24, 1fr)', gap: '4px', minWidth: '800px' }}>
                            {/* Header row (hours) */}
                            <div />
                            {Array.from({ length: 24 }).map((_, h) => (
                                <div key={h} className="text-xs text-center text-muted" style={{ width: '2rem' }}>
                                    {h}
                                </div>
                            ))}

                            {/* Data rows (days) */}
                            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((dayName, d) => (
                                <React.Fragment key={d}>
                                    <div className="text-sm fw-medium text-right pe-2" style={{ alignSelf: 'center' }}>{dayName}</div>
                                    {Array.from({ length: 24 }).map((_, h) => {
                                        const cellData = heatmap?.find((c) => c.weekday === d && c.hour === h);
                                        const count = cellData?.orderCount || 0;
                                        // Calculate opacity based on count (rough heuristic: max ~10 orders/hour for full opacity)
                                        const opacity = count === 0 ? 0.05 : Math.min(0.2 + (count / 10) * 0.8, 1);

                                        return (
                                            <div
                                                key={`${d}-${h}`}
                                                title={`${dayName} ${h}:00 - ${count} orders ($${cellData?.revenue || 0})`}
                                                style={{
                                                    height: '2rem',
                                                    backgroundColor: `rgba(139, 92, 246, ${opacity})`,
                                                    borderRadius: '4px',
                                                    cursor: 'pointer',
                                                    border: count === 0 ? '1px solid var(--border)' : 'none'
                                                }}
                                            />
                                        );
                                    })}
                                </React.Fragment>
                            ))}
                        </div>
                        {/* Legend */}
                        <div className="flex gap-4 mt-4 text-xs text-muted justify-end items-center">
                            <span>Less</span>
                            <div style={{ display: 'flex', gap: '4px' }}>
                                {[0.05, 0.3, 0.5, 0.8, 1].map((op, i) => (
                                    <div key={i} style={{ width: '1rem', height: '1rem', backgroundColor: `rgba(139, 92, 246, ${op})`, borderRadius: '2px', border: i === 0 ? '1px solid var(--border)' : 'none' }} />
                                ))}
                            </div>
                            <span>More</span>
                        </div>
                    </div>
                </section>
            </div>

            {/* ── Bottom Row: Low-stock & Interactions ── */}
            <div className="dashboard-grid-half">

                {/* Low Stock Alerts */}
                <section className="card section-card">
                    <h3 className="section-title" style={{ color: 'var(--danger)' }}>⚠️ Low Stock Inventory</h3>
                    {kpis?.inventory.lowStockItems.length === 0 ? (
                        <div className="empty-state">
                            <div className="empty-state-icon">✅</div>
                            <div className="empty-state-title">All Clear</div>
                            <div className="empty-state-text">All inventory levels are healthy. No products below safety stock.</div>
                        </div>
                    ) : (
                        <div className="table-container">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Product</th>
                                        <th>Stock</th>
                                        <th>Safety</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {kpis?.inventory.lowStockItems.map((item, idx) => (
                                        <tr key={idx}>
                                            <td className="font-semibold">{item.name}</td>
                                            <td className="tabular" style={{ color: 'var(--danger)', fontWeight: 700 }}>{item.stockQuantity}</td>
                                            <td className="tabular">{item.safetyStock}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>

                {/* Interactions */}
                <section className="card section-card">
                    <h3 className="section-title">🕐 Recent Interactions</h3>
                    <div className="flex flex-col gap-12">
                        {kpis?.recentInteractions.length === 0 ? (
                            <div className="empty-state">
                                <div className="empty-state-icon">💤</div>
                                <div className="empty-state-title">No Activity</div>
                                <div className="empty-state-text">No recent customer interactions recorded.</div>
                            </div>
                        ) : (
                            kpis?.recentInteractions.map((i) => (
                                <div key={i.id} className="interaction-item">
                                    <div className="interaction-avatar">
                                        {i.type === 'STORE_VISIT' ? '🏪' : i.type === 'LINE_MESSAGE' ? '💬' : i.type === 'PHONE_CALL' ? '📞' : '🔔'}
                                    </div>
                                    <div>
                                        <div className="font-semibold">{i.customer?.name}</div>
                                        <div className="text-sm text-muted">{i.content || i.type}</div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </section>
            </div>
        </div>
    );
}

/** KPI Traffic Light Indicator */
function KpiLight({ label, value, status }: { label: string; value: string; status: 'green' | 'amber' | 'red' }) {
    const colors = {
        green: { bg: 'var(--success-bg)', dot: 'var(--success)', text: 'var(--success)' },
        amber: { bg: 'var(--warning-bg)', dot: 'var(--warning)', text: 'var(--warning)' },
        red: { bg: 'var(--danger-bg)', dot: 'var(--danger)', text: 'var(--danger)' },
    };
    const c = colors[status];

    return (
        <div className="kpi-light" style={{ background: c.bg }}>
            <div className="kpi-dot" style={{ background: c.dot }} />
            <span className="kpi-light-label">{label}</span>
            <span className="kpi-light-value" style={{ color: c.text }}>{value}</span>
        </div>
    );
}
