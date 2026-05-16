import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../api/client';

type AbcQuadrant = 'star' | 'cash_cow' | 'hidden_gem' | 'underperformer';

interface AbcProduct {
    id: string;
    name: string;
    sku: string;
    categoryName: string | null;
    supplierName: string | null;
    totalRevenue: number;
    totalQuantity: number;
    marginPct: number;
    quadrant: AbcQuadrant;
}

interface AbcResult {
    summary: Record<AbcQuadrant, number>;
    medianRevenue: number;
    medianMargin: number;
    products: AbcProduct[];
}

interface RankedSupplier {
    id: string;
    name: string;
    totalRevenue: number;
    revenueShare: number;
    avgMarginPct: number;
    deliveryReliability: number | null;
    defectRate: number | null;
    compositeScore: number;
    productCount: number;
}

const QUADRANT_CONFIG: Record<AbcQuadrant, { label: string; icon: string; badge: string; iconColor: string; iconBg: string }> = {
    star: { label: 'Stars', icon: '⭐', badge: 'badge-success', iconColor: 'var(--success)', iconBg: 'var(--success-bg)' },
    cash_cow: { label: 'Cash Cows', icon: '🐄', badge: 'badge-info', iconColor: 'var(--info)', iconBg: 'var(--info-bg)' },
    hidden_gem: { label: 'Hidden Gems', icon: '💎', badge: 'badge-warning', iconColor: 'var(--chart-5)', iconBg: 'rgba(139, 92, 246, 0.08)' },
    underperformer: { label: 'Underperformers', icon: '⚠️', badge: 'badge-danger', iconColor: 'var(--danger)', iconBg: 'var(--danger-bg)' },
};

const QUADRANT_DESCRIPTIONS: Record<AbcQuadrant, string> = {
    star: 'High Revenue, High Margin',
    cash_cow: 'High Revenue, Low Margin',
    hidden_gem: 'Low Revenue, High Margin',
    underperformer: 'Low Revenue, Low Margin',
};

export default function InventoryAnalyticsPage() {
    const [activeTab, setActiveTab] = useState<'products' | 'suppliers'>('products');
    const [period, setPeriod] = useState(new Date().toISOString().substring(0, 7)); // YYYY-MM

    const abcQuery = useQuery({
        queryKey: ['analytics', 'product-abc', period],
        queryFn: async () => {
            const res = await api.get<{ success: boolean; data: AbcResult }>(`/analytics/product-abc?period=${period}`);
            return res.data.data;
        },
    });

    const supplierQuery = useQuery({
        queryKey: ['analytics', 'supplier-ranking', period],
        queryFn: async () => {
            const res = await api.get<{ success: boolean; data: RankedSupplier[] }>(`/analytics/supplier-ranking?period=${period}`);
            return res.data.data;
        },
    });

    function scorebadge(score: number) {
        if (score >= 80) return 'badge-success';
        if (score >= 60) return 'badge-info';
        return 'badge-danger';
    }

    return (
        <div>
            <header className="page-header">
                <div>
                    <h1 className="page-title">Inventory Analytics</h1>
                    <p className="page-subtitle">Product performance and supplier evaluation</p>
                </div>
                <div>
                    <input
                        type="month"
                        className="input-field"
                        value={period}
                        onChange={(e) => setPeriod(e.target.value)}
                        style={{ width: 200 }}
                    />
                </div>
            </header>

            {/* ── Tab Switcher ── */}
            <div className="flex gap-8" style={{ marginBottom: 28 }}>
                <button
                    className={`btn ${activeTab === 'products' ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setActiveTab('products')}
                >
                    📦 ABC Product Analysis
                </button>
                <button
                    className={`btn ${activeTab === 'suppliers' ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setActiveTab('suppliers')}
                >
                    🏢 Supplier Ranking
                </button>
            </div>

            {/* ══════════ Products Tab ══════════ */}
            {activeTab === 'products' && (
                <div className="space-y-24">
                    {abcQuery.isLoading ? (
                        <div className="stat-grid stagger-fade">
                            {[...Array(4)].map((_, i) => (
                                <div key={i} className="skeleton-card">
                                    <div className="skeleton skeleton-text" />
                                    <div className="skeleton" style={{ height: 30, width: '50%' }} />
                                    <div className="skeleton skeleton-text-sm" />
                                </div>
                            ))}
                        </div>
                    ) : abcQuery.isError ? (
                        <div className="card">
                            <div className="empty-state">
                                <div className="empty-state-icon">❌</div>
                                <div className="empty-state-title">Failed to Load</div>
                                <div className="empty-state-text">Could not fetch product analysis data. Please try again later.</div>
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* Quadrant KPI Cards */}
                            <div className="stat-grid stagger-fade">
                                {(['star', 'cash_cow', 'hidden_gem', 'underperformer'] as const).map((q) => {
                                    const cfg = QUADRANT_CONFIG[q];
                                    return (
                                        <div key={q} className="stat-card">
                                            <div className="stat-header">
                                                <span className="stat-label">{cfg.icon} {cfg.label}</span>
                                                <div className="stat-icon" style={{ color: cfg.iconColor, background: cfg.iconBg }}>{cfg.icon}</div>
                                            </div>
                                            <div className="stat-value">{abcQuery.data?.summary[q] || 0}</div>
                                            <div className="text-sm text-muted">{QUADRANT_DESCRIPTIONS[q]}</div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Product Performance Table */}
                            <div className="card section-card">
                                <h3 className="section-title">
                                    <span className="section-icon">📊</span> Product Performance Matrix
                                </h3>
                                <p className="text-muted text-sm" style={{ marginTop: -12, marginBottom: 20 }}>
                                    Median Revenue: ${abcQuery.data?.medianRevenue?.toLocaleString() ?? 0} | Median Margin: {abcQuery.data?.medianMargin ?? 0}%
                                </p>

                                <div className="table-container">
                                    <table className="table">
                                        <thead>
                                            <tr>
                                                <th>Product</th>
                                                <th>Category / Supplier</th>
                                                <th>Quadrant</th>
                                                <th style={{ textAlign: 'right' }}>Units Sold</th>
                                                <th style={{ textAlign: 'right' }}>Revenue</th>
                                                <th style={{ textAlign: 'right' }}>Margin %</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {abcQuery.data?.products.map((p) => {
                                                const quad = QUADRANT_CONFIG[p.quadrant];
                                                return (
                                                    <tr key={p.id}>
                                                        <td>
                                                            <div className="font-semibold">{p.name}</div>
                                                            <div className="text-sm text-muted" style={{ fontFamily: 'monospace' }}>{p.sku}</div>
                                                        </td>
                                                        <td>
                                                            <div className="text-sm">{p.categoryName || '—'}</div>
                                                            <div className="text-sm text-muted">{p.supplierName || '—'}</div>
                                                        </td>
                                                        <td>
                                                            <span className={`badge ${quad.badge}`}>
                                                                {quad.icon} {quad.label}
                                                            </span>
                                                        </td>
                                                        <td style={{ textAlign: 'right' }}>{p.totalQuantity}</td>
                                                        <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>${p.totalRevenue.toLocaleString()}</td>
                                                        <td style={{ textAlign: 'right', fontWeight: 700 }}>{p.marginPct}%</td>
                                                    </tr>
                                                );
                                            })}
                                            {abcQuery.data?.products.length === 0 && (
                                                <tr>
                                                    <td colSpan={6}>
                                                        <div className="empty-state">
                                                            <div className="empty-state-icon">📦</div>
                                                            <div className="empty-state-title">No Data</div>
                                                            <div className="empty-state-text">No product data for this period.</div>
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

            {/* ══════════ Suppliers Tab ══════════ */}
            {activeTab === 'suppliers' && (
                <div className="space-y-24">
                    {supplierQuery.isLoading ? (
                        <div className="card section-card">
                            <div className="skeleton skeleton-title" />
                            <div className="skeleton skeleton-subtitle" style={{ marginBottom: 20 }} />
                            <div className="skeleton skeleton-chart" style={{ height: 200 }} />
                        </div>
                    ) : supplierQuery.isError ? (
                        <div className="card">
                            <div className="empty-state">
                                <div className="empty-state-icon">❌</div>
                                <div className="empty-state-title">Failed to Load</div>
                                <div className="empty-state-text">Could not fetch supplier ranking data. Please try again later.</div>
                            </div>
                        </div>
                    ) : (
                        <div className="card section-card">
                            <h3 className="section-title">
                                <span className="section-icon">🏆</span> Supplier Performance Ranking
                            </h3>
                            <p className="text-muted text-sm" style={{ marginTop: -12, marginBottom: 20 }}>
                                Ranked by Composite Score (Revenue 40%, Margin 30%, Reliability 20%, Defect 10%).
                            </p>

                            <div className="table-container">
                                <table className="table">
                                    <thead>
                                        <tr>
                                            <th style={{ width: 60 }}>Rank</th>
                                            <th>Supplier</th>
                                            <th style={{ textAlign: 'right' }}>Products</th>
                                            <th style={{ textAlign: 'right' }}>Revenue</th>
                                            <th style={{ textAlign: 'right' }}>Share</th>
                                            <th style={{ textAlign: 'right' }}>Avg Margin</th>
                                            <th style={{ textAlign: 'right' }}>Reliability</th>
                                            <th style={{ textAlign: 'right' }}>Score</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {supplierQuery.data?.map((s, index) => (
                                            <tr key={s.id}>
                                                <td style={{ textAlign: 'center', fontSize: 16 }}>
                                                    {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                                                </td>
                                                <td>
                                                    <div className="font-semibold">{s.name}</div>
                                                </td>
                                                <td style={{ textAlign: 'right' }}>{s.productCount}</td>
                                                <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>${s.totalRevenue.toLocaleString()}</td>
                                                <td style={{ textAlign: 'right' }}>{s.revenueShare}%</td>
                                                <td style={{ textAlign: 'right' }}>{s.avgMarginPct}%</td>
                                                <td style={{ textAlign: 'right' }}>{s.deliveryReliability ? `${s.deliveryReliability}%` : '—'}</td>
                                                <td style={{ textAlign: 'right' }}>
                                                    <span className={`badge ${scorebadge(s.compositeScore)}`} style={{ fontSize: 13, fontWeight: 700 }}>
                                                        {s.compositeScore}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                        {supplierQuery.data?.length === 0 && (
                                            <tr>
                                                <td colSpan={8}>
                                                    <div className="empty-state">
                                                        <div className="empty-state-icon">🏢</div>
                                                        <div className="empty-state-title">No Data</div>
                                                        <div className="empty-state-text">No supplier data found for this period.</div>
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
