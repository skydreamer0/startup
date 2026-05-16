import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../api/client';

interface RfmCustomer {
    id: string;
    name: string | null;
    phone: string | null;
    segment: 'vip' | 'loyal' | 'new' | 'dormant' | 'at_risk';
    recencyDays: number;
    frequency: number;
    monetary: number;
    lastPurchaseDate: string | null;
}

interface RfmResult {
    summary: Record<'vip' | 'loyal' | 'new' | 'dormant' | 'at_risk', number>;
    customers: RfmCustomer[];
}

interface ChurnRiskCustomer {
    id: string;
    name: string | null;
    phone: string | null;
    avgIntervalDays: number;
    daysSinceLastPurchase: number;
    riskLevel: 'high' | 'medium' | 'low';
    estimatedChurnDate: string | null;
    purchaseCount: number;
}

const SEGMENT_CONFIG: Record<string, { label: string; badge: string; icon: string; iconColor: string; iconBg: string }> = {
    vip: { label: 'VIP', badge: 'badge-success', icon: '👑', iconColor: 'var(--success)', iconBg: 'var(--success-bg)' },
    loyal: { label: 'LOYAL', badge: 'badge-info', icon: '💎', iconColor: 'var(--info)', iconBg: 'var(--info-bg)' },
    new: { label: 'NEW', badge: 'badge-warning', icon: '🌱', iconColor: 'var(--warning)', iconBg: 'var(--warning-bg)' },
    dormant: { label: 'DORMANT', badge: 'badge-warning', icon: '💤', iconColor: 'var(--warning)', iconBg: 'var(--warning-bg)' },
    at_risk: { label: 'AT RISK', badge: 'badge-danger', icon: '⚠️', iconColor: 'var(--danger)', iconBg: 'var(--danger-bg)' },
};

const RISK_CONFIG: Record<string, { badge: string }> = {
    high: { badge: 'badge-danger' },
    medium: { badge: 'badge-warning' },
    low: { badge: 'badge-success' },
};

export default function CrmAnalyticsPage() {
    const [activeTab, setActiveTab] = useState<'rfm' | 'churn'>('rfm');

    const rfmQuery = useQuery({
        queryKey: ['analytics', 'rfm'],
        queryFn: async () => {
            const res = await api.get<{ success: boolean; data: RfmResult }>('/analytics/rfm');
            return res.data.data;
        },
    });

    const churnQuery = useQuery({
        queryKey: ['analytics', 'churn-risk'],
        queryFn: async () => {
            const res = await api.get<{ success: boolean; data: ChurnRiskCustomer[] }>('/analytics/churn-risk');
            return res.data.data;
        },
    });

    return (
        <div>
            <header className="page-header">
                <div>
                    <h1 className="page-title">CRM Analytics</h1>
                    <p className="page-subtitle">Customer segmentation and retention analysis</p>
                </div>
            </header>

            {/* ── Tab Switcher ── */}
            <div className="flex gap-8" style={{ marginBottom: 28 }}>
                <button
                    className={`btn ${activeTab === 'rfm' ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setActiveTab('rfm')}
                >
                    📊 RFM Segmentation
                </button>
                <button
                    className={`btn ${activeTab === 'churn' ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setActiveTab('churn')}
                >
                    ⚠️ Churn Risk
                </button>
            </div>

            {/* ══════════ RFM Tab ══════════ */}
            {activeTab === 'rfm' && (
                <div className="space-y-24">
                    {rfmQuery.isLoading ? (
                        <div className="stat-grid stagger-fade" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
                            {[...Array(5)].map((_, i) => (
                                <div key={i} className="skeleton-card">
                                    <div className="skeleton skeleton-text" />
                                    <div className="skeleton" style={{ height: 30, width: '50%' }} />
                                </div>
                            ))}
                        </div>
                    ) : rfmQuery.isError ? (
                        <div className="card">
                            <div className="empty-state">
                                <div className="empty-state-icon">❌</div>
                                <div className="empty-state-title">Failed to Load</div>
                                <div className="empty-state-text">Could not fetch RFM segmentation data. Please try again later.</div>
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* KPI Summary Cards */}
                            <div className="stat-grid stagger-fade" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
                                {(['vip', 'loyal', 'new', 'dormant', 'at_risk'] as const).map((seg) => {
                                    const cfg = SEGMENT_CONFIG[seg];
                                    return (
                                        <div key={seg} className="stat-card">
                                            <div className="stat-header">
                                                <span className="stat-label">{cfg.label}</span>
                                                <div className="stat-icon" style={{ color: cfg.iconColor, background: cfg.iconBg }}>{cfg.icon}</div>
                                            </div>
                                            <div className="stat-value">{rfmQuery.data?.summary[seg] || 0}</div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Customer Segments Table */}
                            <div className="card section-card">
                                <h3 className="section-title">
                                    <span className="section-icon">👥</span> Customer Segments
                                </h3>
                                <div className="table-container">
                                    <table className="table">
                                        <thead>
                                            <tr>
                                                <th>Customer</th>
                                                <th>Segment</th>
                                                <th style={{ textAlign: 'right' }}>Recency (Days)</th>
                                                <th style={{ textAlign: 'right' }}>Frequency</th>
                                                <th style={{ textAlign: 'right' }}>Total Spent</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {rfmQuery.data?.customers.slice(0, 50).map((c) => (
                                                <tr key={c.id}>
                                                    <td>
                                                        <div className="font-semibold">{c.name || 'Unknown'}</div>
                                                        <div className="text-sm text-muted">{c.phone || '—'}</div>
                                                    </td>
                                                    <td>
                                                        <span className={`badge ${SEGMENT_CONFIG[c.segment].badge}`}>
                                                            {SEGMENT_CONFIG[c.segment].label}
                                                        </span>
                                                    </td>
                                                    <td style={{ textAlign: 'right' }}>{c.recencyDays > 9000 ? '—' : c.recencyDays}</td>
                                                    <td style={{ textAlign: 'right' }}>{c.frequency}</td>
                                                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>${c.monetary.toLocaleString()}</td>
                                                </tr>
                                            ))}
                                            {rfmQuery.data?.customers.length === 0 && (
                                                <tr>
                                                    <td colSpan={5}>
                                                        <div className="empty-state">
                                                            <div className="empty-state-icon">👥</div>
                                                            <div className="empty-state-title">No Customers</div>
                                                            <div className="empty-state-text">No customer data found for RFM analysis.</div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* ══════════ Churn Risk Tab ══════════ */}
            {activeTab === 'churn' && (
                <div className="space-y-24">
                    {churnQuery.isLoading ? (
                        <div className="card section-card">
                            <div className="skeleton skeleton-title" />
                            <div className="skeleton skeleton-subtitle" style={{ marginBottom: 20 }} />
                            <div className="skeleton skeleton-chart" style={{ height: 200 }} />
                        </div>
                    ) : churnQuery.isError ? (
                        <div className="card">
                            <div className="empty-state">
                                <div className="empty-state-icon">❌</div>
                                <div className="empty-state-title">Failed to Load</div>
                                <div className="empty-state-text">Could not fetch Churn Risk data. Please try again later.</div>
                            </div>
                        </div>
                    ) : (
                        <div className="card section-card">
                            <h3 className="section-title">
                                <span className="section-icon">⚠️</span> At-Risk Customers
                            </h3>
                            <p className="text-muted text-sm" style={{ marginTop: -12, marginBottom: 20 }}>
                                Customers whose days since last purchase exceeds their historical average interval.
                            </p>

                            <div className="table-container">
                                <table className="table">
                                    <thead>
                                        <tr>
                                            <th>Customer</th>
                                            <th>Risk Level</th>
                                            <th style={{ textAlign: 'right' }}>Purchases</th>
                                            <th style={{ textAlign: 'right' }}>Avg Interval (Days)</th>
                                            <th style={{ textAlign: 'right' }}>Days Since Last</th>
                                            <th style={{ textAlign: 'right' }}>Est. Churn Date</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {churnQuery.data?.map((c) => (
                                            <tr key={c.id}>
                                                <td>
                                                    <div className="font-semibold">{c.name || 'Unknown'}</div>
                                                    <div className="text-sm text-muted">{c.phone || '—'}</div>
                                                </td>
                                                <td>
                                                    <span className={`badge ${RISK_CONFIG[c.riskLevel].badge}`}>
                                                        {c.riskLevel.toUpperCase()}
                                                    </span>
                                                </td>
                                                <td style={{ textAlign: 'right' }}>{c.purchaseCount}</td>
                                                <td style={{ textAlign: 'right' }}>{c.avgIntervalDays}</td>
                                                <td style={{ textAlign: 'right', color: 'var(--danger)', fontWeight: 700 }}>{c.daysSinceLastPurchase}</td>
                                                <td style={{ textAlign: 'right' }}>{c.estimatedChurnDate || '—'}</td>
                                            </tr>
                                        ))}
                                        {churnQuery.data?.length === 0 && (
                                            <tr>
                                                <td colSpan={6}>
                                                    <div className="empty-state">
                                                        <div className="empty-state-icon">✅</div>
                                                        <div className="empty-state-title">All Clear</div>
                                                        <div className="empty-state-text">No customers with high churn risk detected.</div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
