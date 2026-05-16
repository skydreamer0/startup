/* ─────────────────────────────────────────────
   Skeleton Loader — Matches Dashboard Layout
   Shows a layout-aware shimmer instead of a
   single grey box, improving perceived perf.
   ───────────────────────────────────────────── */

export default function DashboardSkeleton() {
    return (
        <div className="dashboard-content">
            {/* Page Header Skeleton */}
            <header className="page-header" style={{ marginBottom: 32 }}>
                <div>
                    <div className="skeleton skeleton-title" />
                    <div className="skeleton skeleton-subtitle" />
                </div>
            </header>

            {/* KPI Cards Skeleton */}
            <div className="stat-grid stagger-fade">
                {[...Array(5)].map((_, i) => (
                    <div key={i} className="skeleton-card">
                        <div className="flex justify-between items-center">
                            <div className="skeleton skeleton-text-sm" style={{ width: '50%' }} />
                            <div className="skeleton" style={{ width: 40, height: 40, borderRadius: 8 }} />
                        </div>
                        <div className="skeleton" style={{ height: 30, width: '60%', borderRadius: 6 }} />
                        <div className="skeleton skeleton-text-sm" style={{ width: '35%' }} />
                    </div>
                ))}
            </div>

            {/* Chart Skeleton */}
            <div className="skeleton-card" style={{ marginBottom: 32 }}>
                <div className="skeleton skeleton-text" style={{ width: '25%' }} />
                <div className="skeleton skeleton-chart" />
            </div>

            {/* Bottom Grid Skeleton */}
            <div className="dashboard-grid-main">
                <div className="skeleton-card">
                    <div className="skeleton skeleton-text" style={{ width: '40%' }} />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                        {[...Array(4)].map((_, i) => (
                            <div key={i} className="skeleton" style={{ height: 80, borderRadius: 12 }} />
                        ))}
                    </div>
                </div>
                <div className="skeleton-card">
                    <div className="skeleton skeleton-text" style={{ width: '50%' }} />
                    {[...Array(3)].map((_, i) => (
                        <div key={i} className="skeleton" style={{ height: 20, width: `${70 - i * 10}%` }} />
                    ))}
                </div>
            </div>
        </div>
    );
}

/** Reusable inline skeleton for tables, etc. */
export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
    return (
        <tbody>
            {[...Array(rows)].map((_, r) => (
                <tr key={r}>
                    {[...Array(cols)].map((_, c) => (
                        <td key={c}>
                            <div className="skeleton skeleton-text" style={{ width: `${50 + Math.random() * 30}%` }} />
                        </td>
                    ))}
                </tr>
            ))}
        </tbody>
    );
}
