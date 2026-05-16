import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../api/client';

interface AuditLog {
    id: string;
    action: string;
    resourceType: string;
    resourceId: string | null;
    ipAddress: string | null;
    createdAt: string;
    user: { id: string; email: string; fullName: string } | null;
}

export default function AuditLogsPage() {
    const [page, setPage] = useState(1);
    const [actionFilter, setActionFilter] = useState('');

    const { data: logsData } = useQuery({
        queryKey: ['audit-logs', page, actionFilter],
        queryFn: async () => {
            const params: Record<string, string | number> = { page, limit: 20 };
            if (actionFilter) params.action = actionFilter;
            const res = await api.get('/audit-logs', { params });
            return { logs: res.data.data as AuditLog[], total: res.data.meta?.total || 0 };
        },
    });

    const logs = logsData?.logs || [];
    const total = logsData?.total || 0;

    function actionColor(action: string) {
        if (action.includes('LOGIN')) return 'var(--accent-green)';
        if (action.includes('DELETE') || action.includes('LOGOUT')) return 'var(--accent-red)';
        if (action.includes('CREATE')) return 'var(--accent-blue)';
        if (action.includes('UPDATE')) return 'var(--accent-orange)';
        return 'var(--text-secondary)';
    }

    const totalPages = Math.ceil(total / 20);

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Audit Logs</h1>
                    <p className="page-subtitle">{total} events recorded</p>
                </div>
            </div>

            <div style={{ marginBottom: 20, display: 'flex', gap: 12 }}>
                <select
                    className="input-field"
                    style={{ maxWidth: 200 }}
                    value={actionFilter}
                    onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
                >
                    <option value="">All Actions</option>
                    <option value="LOGIN">LOGIN</option>
                    <option value="LOGOUT">LOGOUT</option>
                    <option value="CREATE">CREATE</option>
                    <option value="UPDATE">UPDATE</option>
                    <option value="DELETE">DELETE</option>
                </select>
            </div>

            <div className="card" style={{ overflow: 'hidden' }}>
                <table className="table">
                    <thead>
                        <tr>
                            <th>Time</th>
                            <th>User</th>
                            <th>Action</th>
                            <th>Resource</th>
                            <th>IP Address</th>
                        </tr>
                    </thead>
                    <tbody>
                        {logs.map((log) => (
                            <tr key={log.id}>
                                <td className="text-sm" style={{ whiteSpace: 'nowrap' }}>
                                    {new Date(log.createdAt).toLocaleString()}
                                </td>
                                <td>
                                    <div style={{ fontWeight: 500, fontSize: 13 }}>{log.user?.fullName || '—'}</div>
                                    <div className="text-muted text-sm">{log.user?.email}</div>
                                </td>
                                <td>
                                    <span style={{ color: actionColor(log.action), fontWeight: 600, fontSize: 12, letterSpacing: '0.04em' }}>
                                        {log.action}
                                    </span>
                                </td>
                                <td className="text-sm">
                                    <span className="text-muted">{log.resourceType}</span>
                                    {log.resourceId && <span style={{ marginLeft: 6, fontFamily: 'monospace', fontSize: 11 }}>{log.resourceId.slice(0, 8)}</span>}
                                </td>
                                <td className="text-muted text-sm">{log.ipAddress || '—'}</td>
                            </tr>
                        ))}
                        {logs.length === 0 && (
                            <tr><td colSpan={5} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No audit events found</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 20 }}>
                    <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Prev</button>
                    <span className="text-muted text-sm" style={{ lineHeight: '32px' }}>Page {page} of {totalPages}</span>
                    <button className="btn btn-ghost btn-sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next →</button>
                </div>
            )}
        </div>
    );
}
