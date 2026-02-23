import { useEffect, useState } from 'react';
import { dashboardApi, DashboardKPIs, CrmMetrics, AnalyticsKPIs } from '../api/dashboard';

export default function DashboardPage() {
    const [kpis, setKpis] = useState<DashboardKPIs | null>(null);
    const [crm, setCrm] = useState<CrmMetrics | null>(null);
    const [analytics, setAnalytics] = useState<AnalyticsKPIs | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        Promise.all([
            dashboardApi.getKPIs(),
            dashboardApi.getCrmMetrics(),
            dashboardApi.getAnalyticsKpis()
        ]).then(([kpiData, crmData, analyticsData]) => {
            setKpis(kpiData);
            setCrm(crmData);
            setAnalytics(analyticsData);
        }).catch(console.error).finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center p-20">
                <div className="shimmer glass-card" style={{ width: '100%', height: '400px' }}></div>
            </div>
        );
    }

    return (
        <div className="dashboard-content">
            <header className="page-header">
                <div>
                    <h1 className="page-title" style={{ fontSize: '32px', marginBottom: '4px' }}>Operations Overview</h1>
                    <p className="page-subtitle" style={{ color: 'var(--text-dim)' }}>Real-time business intelligence & operational health</p>
                </div>
                <div className="flex gap-12">
                    <button className="btn btn-ghost">Export Report</button>
                    <button className="btn btn-primary">Refresh Data</button>
                </div>
            </header>

            {/* KPI Cards Grid */}
            <div className="stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '24px', marginBottom: '32px' }}>
                <div className="stat-card glass-card">
                    <div className="stat-header">
                        <span className="stat-label">Lifetime Revenue</span>
                        <div className="stat-icon" style={{ color: '#818cf8', background: 'rgba(99, 102, 241, 0.1)' }}>💰</div>
                    </div>
                    <div className="stat-value" style={{ color: 'var(--text-main)' }}>
                        ${kpis?.revenue.totalLifetime.toLocaleString() ?? 0}
                    </div>
                    <div className="text-sm" style={{ color: '#10b981' }}>+12.5% from last month</div>
                </div>

                <div className="stat-card glass-card">
                    <div className="stat-header">
                        <span className="stat-label">Total Customers</span>
                        <div className="stat-icon" style={{ color: '#34d399', background: 'rgba(52, 211, 153, 0.1)' }}>👤</div>
                    </div>
                    <div className="stat-value">
                        {kpis?.customers.total ?? 0}
                    </div>
                    <div className="text-sm" style={{ color: 'var(--text-dim)' }}>
                        <span style={{ color: '#818cf8' }}>{kpis?.customers.newThisMonth ?? 0}</span> new this month
                    </div>
                </div>

                <div className="stat-card glass-card">
                    <div className="stat-header">
                        <span className="stat-label">Gross Margin</span>
                        <div className="stat-icon" style={{ color: '#10b981', background: 'rgba(16, 185, 129, 0.1)' }}>📈</div>
                    </div>
                    <div className="stat-value" style={{ color: (analytics?.gross_margin_pct ?? 0) >= 30 ? '#10b981' : '#f59e0b' }}>
                        {analytics?.gross_margin_pct ?? 0}%
                    </div>
                    <div className="text-sm" style={{ color: 'var(--text-dim)' }}>Target: 30.0%</div>
                </div>

                <div className="stat-card glass-card">
                    <div className="stat-header">
                        <span className="stat-label">LTV (per Customer)</span>
                        <div className="stat-icon" style={{ color: '#8b5cf6', background: 'rgba(139, 92, 246, 0.1)' }}>💎</div>
                    </div>
                    <div className="stat-value" style={{ color: 'var(--text-main)' }}>
                        ${analytics?.ltv_twd?.toLocaleString() ?? 0}
                    </div>
                    <div className="text-sm" style={{ color: 'var(--text-dim)' }}>
                        CAC: ${analytics?.cac_twd?.toLocaleString() ?? 0}
                    </div>
                </div>

                <div className="stat-card glass-card">
                    <div className="stat-header">
                        <span className="stat-label">Inventory Alerts</span>
                        <div className="stat-icon" style={{ color: '#f87171', background: 'rgba(248, 113, 113, 0.1)' }}>⚠️</div>
                    </div>
                    <div className="stat-value" style={{ color: (kpis?.inventory.lowStockCount ?? 0) > 0 ? '#ef4444' : '#10b981' }}>
                        {kpis?.inventory.lowStockCount ?? 0}
                    </div>
                    <div className="text-sm" style={{ color: 'var(--text-dim)' }}>SKUs below safety stock</div>
                </div>
            </div>

            {/* Secondary Sections */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '24px' }}>

                {/* CRM & Customer Health */}
                <section className="glass-card" style={{ padding: '28px' }}>
                    <h3 style={{ fontSize: '18px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '20px' }}>📊</span> Customer Health Metrics
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px' }}>
                        <div style={{ padding: '20px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
                            <div className="stat-label">Avg. Customer LTV</div>
                            <div style={{ fontSize: '24px', fontWeight: 700, marginTop: '8px', color: '#818cf8' }}>
                                ${crm?.averageLTV.toLocaleString() ?? 0}
                            </div>
                        </div>
                        <div style={{ padding: '20px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
                            <div className="stat-label">90d Churn Risk</div>
                            <div style={{ fontSize: '24px', fontWeight: 700, marginTop: '8px', color: (crm?.churnRate90d ?? 0) > 20 ? '#ef4444' : '#f59e0b' }}>
                                {crm?.churnRate90d ?? 0}%
                            </div>
                        </div>
                        <div style={{ padding: '20px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
                            <div className="stat-label">Repurchase Rate</div>
                            <div style={{ fontSize: '24px', fontWeight: 700, marginTop: '8px', color: (crm?.repurchaseRate ?? 0) > 30 ? '#10b981' : '#f59e0b' }}>
                                {crm?.repurchaseRate ?? 0}%
                            </div>
                        </div>
                        <div style={{ padding: '20px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
                            <div className="stat-label">Average Order Value (AOV)</div>
                            <div style={{ fontSize: '24px', fontWeight: 700, marginTop: '8px', color: '#10b981' }}>
                                ${analytics?.aov_twd?.toLocaleString() ?? 0}
                            </div>
                        </div>
                    </div>
                </section>

                {/* Supply Chain Stats */}
                <section className="glass-card" style={{ padding: '28px' }}>
                    <h3 style={{ fontSize: '18px', marginBottom: '20px' }}>🏢 Supply Chain</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div className="flex justify-between items-center" style={{ paddingBottom: '12px', borderBottom: '1px solid var(--border-light)' }}>
                            <span className="stat-label">Total SKUs</span>
                            <span style={{ fontWeight: 600 }}>{kpis?.inventory.totalProducts ?? 0}</span>
                        </div>
                        <div className="flex justify-between items-center" style={{ paddingBottom: '12px', borderBottom: '1px solid var(--border-light)' }}>
                            <span className="stat-label">Avg. Delivery Rate</span>
                            <span className="badge badge-success" style={{ background: (kpis?.suppliers.avgDeliveryReliability ?? 0) >= 95 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)' }}>
                                {kpis?.suppliers.avgDeliveryReliability ?? '--'}%
                            </span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="stat-label">Avg. Defect Rate</span>
                            <span className="badge" style={{ background: (kpis?.suppliers.avgDefectRate ?? 0) > 2 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)', color: (kpis?.suppliers.avgDefectRate ?? 0) > 2 ? '#ef4444' : '#10b981' }}>
                                {kpis?.suppliers.avgDefectRate ?? '--'}%
                            </span>
                        </div>
                    </div>
                </section>
            </div>

            {/* Bottom Row: Interactions & Alerts */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginTop: '24px' }}>

                {/* Low Stock Alerts */}
                <section className="glass-card" style={{ padding: '28px' }}>
                    <h3 style={{ fontSize: '18px', marginBottom: '16px', color: '#f87171' }}>⚠️ Low Stock Inventory</h3>
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
                                {kpis?.inventory.lowStockItems.length === 0 ? (
                                    <tr><td colSpan={3} style={{ textAlign: 'center' }}>All inventory levels healthy.</td></tr>
                                ) : (
                                    kpis?.inventory.lowStockItems.map((item, idx) => (
                                        <tr key={idx}>
                                            <td style={{ color: 'var(--text-main)', fontWeight: 500 }}>{item.name}</td>
                                            <td style={{ color: '#ef4444', fontWeight: 700 }}>{item.stockQuantity}</td>
                                            <td>{item.safetyStock}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </section>

                {/* Interactions */}
                <section className="glass-card" style={{ padding: '28px' }}>
                    <h3 style={{ fontSize: '18px', marginBottom: '16px' }}>🕐 Recent Interactions</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {kpis?.recentInteractions.length === 0 ? (
                            <p className="text-dim">No recent activity.</p>
                        ) : (
                            kpis?.recentInteractions.map((i) => (
                                <div key={i.id} style={{ padding: '12px', background: 'rgba(255,255,255,0.02)', borderRadius: '10px', display: 'flex', gap: '12px' }}>
                                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'var(--bg-glass)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>
                                        {i.type === 'STORE_VISIT' ? '🏪' : i.type === 'LINE_MESSAGE' ? '💬' : i.type === 'PHONE_CALL' ? '📞' : '🔔'}
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '14px', fontWeight: 600 }}>{i.customer?.name}</div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-dim)' }}>{i.content || i.type}</div>
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
