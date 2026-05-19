import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { accountingApi } from '../api/accounting';
import PlanGate from '../components/PlanGate';

type ApiError = {
    response?: {
        data?: {
            error?: {
                message?: string;
            };
        };
    };
};

function AccountingSyncPageInner() {
    const [orderId, setOrderId] = useState('');
    const queryClient = useQueryClient();

    const { data: provider, isLoading: providerLoading } = useQuery({
        queryKey: ['accounting', 'provider'],
        queryFn: () => accountingApi.getProviderInfo(),
    });

    const { data: statusData, isLoading: statusLoading } = useQuery({
        queryKey: ['accounting', 'sync-status'],
        queryFn: () => accountingApi.getSyncStatus({ limit: 50 }),
    });

    const syncOrderMutation = useMutation({
        mutationFn: (id: string) => accountingApi.syncOrder(id),
        onSuccess: (result) => {
            queryClient.invalidateQueries({ queryKey: ['accounting', 'sync-status'] });
            if (result.alreadySynced) {
                alert(`Order already synced (externalId: ${result.log.externalId ?? '-'})`);
            } else {
                alert(`Sync succeeded — externalId: ${result.log.externalId ?? '-'}`);
            }
            setOrderId('');
        },
        onError: (err: unknown) => {
            const message = (err as ApiError).response?.data?.error?.message || 'Sync failed';
            alert(message);
        },
    });

    const logs = statusData?.data || [];

    function handleSync(e: React.FormEvent) {
        e.preventDefault();
        if (!orderId.trim()) return;
        syncOrderMutation.mutate(orderId.trim());
    }

    return (
        <div className="accounting-sync-page">
            <header className="page-header" style={{ marginBottom: '32px' }}>
                <h1 className="page-title">會計系統拋轉</h1>
                <p className="page-subtitle" style={{ color: 'var(--text-muted)' }}>
                    將訂單與費用同步至外部會計系統 (QuickBooks / Xero)
                </p>
            </header>

            {/* Provider info card */}
            <div className="card" style={{ marginBottom: '24px', padding: '20px' }}>
                <h2 style={{ marginBottom: '12px', fontSize: '16px', fontWeight: 700 }}>目前提供者</h2>
                {providerLoading ? (
                    <p style={{ color: 'var(--text-muted)' }}>Loading...</p>
                ) : provider ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ fontSize: '18px', fontWeight: 600, textTransform: 'capitalize' }}>
                            {provider.name}
                        </div>
                        <span className={`badge ${provider.configured ? 'badge-success' : 'badge-warning'}`}>
                            {provider.configured ? '已設定' : '未設定'}
                        </span>
                        {!provider.configured && provider.name !== 'mock' && (
                            <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                                請設定環境變數以啟用此提供者
                            </span>
                        )}
                    </div>
                ) : (
                    <p style={{ color: 'var(--text-muted)' }}>無法取得提供者資訊</p>
                )}
            </div>

            {/* Manual sync */}
            <div className="card" style={{ marginBottom: '24px', padding: '20px' }}>
                <h2 style={{ marginBottom: '12px', fontSize: '16px', fontWeight: 700 }}>手動拋轉訂單</h2>
                <form onSubmit={handleSync} style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
                    <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
                        <label className="input-label">訂單 ID</label>
                        <input
                            className="input-field"
                            type="text"
                            placeholder="輸入訂單 ID"
                            value={orderId}
                            onChange={(e) => setOrderId(e.target.value)}
                        />
                    </div>
                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={syncOrderMutation.isPending || !orderId.trim()}
                    >
                        {syncOrderMutation.isPending ? '拋轉中...' : '拋轉'}
                    </button>
                </form>
            </div>

            {/* Recent sync logs */}
            <div className="card table-container">
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)' }}>
                    <h2 style={{ fontSize: '16px', fontWeight: 700 }}>近期拋轉紀錄</h2>
                </div>
                {statusLoading ? (
                    <div style={{ padding: '20px' }}><p>Loading...</p></div>
                ) : (
                    <table className="table">
                        <thead>
                            <tr>
                                <th>類型</th>
                                <th>Entity ID</th>
                                <th>提供者</th>
                                <th>狀態</th>
                                <th>External ID</th>
                                <th>同步時間</th>
                                <th>錯誤訊息</th>
                            </tr>
                        </thead>
                        <tbody>
                            {logs.length === 0 ? (
                                <tr>
                                    <td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                                        目前沒有拋轉紀錄。
                                    </td>
                                </tr>
                            ) : (
                                logs.map((log) => (
                                    <tr key={log.id}>
                                        <td>{log.entityType}</td>
                                        <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>
                                            {log.entityId.slice(0, 12)}…
                                        </td>
                                        <td style={{ textTransform: 'capitalize' }}>{log.provider}</td>
                                        <td>
                                            <span className={`badge ${
                                                log.status === 'synced' ? 'badge-success'
                                                    : log.status === 'failed' ? 'badge-danger'
                                                        : 'badge-warning'
                                            }`}>
                                                {log.status}
                                            </span>
                                        </td>
                                        <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>
                                            {log.externalId || '-'}
                                        </td>
                                        <td style={{ fontSize: '13px' }}>
                                            {log.syncedAt ? new Date(log.syncedAt).toLocaleString('zh-TW') : '-'}
                                        </td>
                                        <td style={{ fontSize: '12px', color: 'var(--text-muted)', maxWidth: '280px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={log.errorMessage || ''}>
                                            {log.errorMessage || '-'}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}

export default function AccountingSyncPage() {
    return (
        <PlanGate plan="pro">
            <AccountingSyncPageInner />
        </PlanGate>
    );
}
