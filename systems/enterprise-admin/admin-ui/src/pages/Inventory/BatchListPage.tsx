import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { batchesApi, ProductBatch } from '../../api/batches';
import { inventoryApi, Product } from '../../api/inventory';

type ApiError = {
    response?: {
        data?: {
            error?: {
                message?: string;
            };
        };
    };
};

type BatchForm = {
    productId: string;
    batchNumber: string;
    expiryDate: string;
    quantity: string;
    costPrice: string;
};

const emptyBatchForm: BatchForm = {
    productId: '',
    batchNumber: '',
    expiryDate: '',
    quantity: '',
    costPrice: '',
};

function getExpiryStatus(expiryDate: string): { label: string; badgeClass: string } {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(expiryDate);
    expiry.setHours(0, 0, 0, 0);

    if (expiry < today) {
        return { label: '已過期', badgeClass: 'badge-danger' };
    }

    const diffMs = expiry.getTime() - today.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays <= 30) {
        return { label: '即將到期', badgeClass: 'badge-warning' };
    }

    return { label: '正常', badgeClass: 'badge-success' };
}

export default function BatchListPage() {
    const [expiringSoon, setExpiringSoon] = useState(false);
    const [showCreate, setShowCreate] = useState(false);
    const [batchForm, setBatchForm] = useState<BatchForm>(emptyBatchForm);
    const [saving, setSaving] = useState(false);
    const queryClient = useQueryClient();

    const { data: batchesData, isLoading: loading } = useQuery({
        queryKey: ['batches', expiringSoon],
        queryFn: () => batchesApi.getAll({ expiringSoon: expiringSoon || undefined }),
    });

    const { data: products } = useQuery({
        queryKey: ['inventory', 'products', 'batches'],
        queryFn: () => inventoryApi.getProducts(),
    });

    const batches: ProductBatch[] = batchesData?.data || [];
    const productList: Product[] = products || [];

    function openCreate() {
        setBatchForm(emptyBatchForm);
        setShowCreate(true);
    }

    function closeCreate() {
        setShowCreate(false);
        setBatchForm(emptyBatchForm);
    }

    async function handleCreate(e: React.FormEvent) {
        e.preventDefault();
        setSaving(true);
        try {
            await batchesApi.create({
                productId: batchForm.productId,
                batchNumber: batchForm.batchNumber,
                expiryDate: batchForm.expiryDate,
                quantity: Number(batchForm.quantity),
                costPrice: Number(batchForm.costPrice),
            });
            closeCreate();
            queryClient.invalidateQueries({ queryKey: ['batches'] });
        } catch (err) {
            const message = (err as ApiError).response?.data?.error?.message || 'Failed to create batch';
            alert(message);
        } finally {
            setSaving(false);
        }
    }

    async function handleDelete(id: string, batchNumber: string) {
        if (!confirm(`確定要刪除批號「${batchNumber}」嗎？`)) return;
        try {
            await batchesApi.delete(id);
            queryClient.invalidateQueries({ queryKey: ['batches'] });
        } catch (err) {
            const message = (err as ApiError).response?.data?.error?.message || 'Failed to delete batch';
            alert(message);
        }
    }

    return (
        <div className="batch-list-page">
            <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                <div>
                    <h1 className="page-title">批號效期管理</h1>
                    <p className="page-subtitle" style={{ color: 'var(--text-muted)' }}>管理商品批號與效期，追蹤庫存有效期限</p>
                </div>
                <div className="flex gap-12">
                    <div className="flex gap-8">
                        <button
                            className={`btn ${!expiringSoon ? 'btn-primary' : 'btn-ghost'}`}
                            onClick={() => setExpiringSoon(false)}
                        >
                            全部
                        </button>
                        <button
                            className={`btn ${expiringSoon ? 'btn-primary' : 'btn-ghost'}`}
                            onClick={() => setExpiringSoon(true)}
                        >
                            30天內到期
                        </button>
                    </div>
                    <button className="btn btn-primary" onClick={openCreate}>+ 新增批號</button>
                </div>
            </header>

            <div className="card table-container">
                {loading ? (
                    <div className="card"><p>Loading...</p></div>
                ) : (
                    <table className="table">
                        <thead>
                            <tr>
                                <th>批號</th>
                                <th>商品名稱</th>
                                <th>到期日</th>
                                <th>狀態</th>
                                <th>剩餘數量</th>
                                <th>進貨成本</th>
                                <th style={{ textAlign: 'right' }}>操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            {batches.length === 0 ? (
                                <tr>
                                    <td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                                        目前沒有批號資料。
                                    </td>
                                </tr>
                            ) : (
                                batches.map((batch) => {
                                    const { label, badgeClass } = getExpiryStatus(batch.expiryDate);
                                    return (
                                        <tr key={batch.id}>
                                            <td>
                                                <div style={{ fontFamily: 'JetBrains Mono', fontSize: '13px', fontWeight: 600 }}>
                                                    {batch.batchNumber}
                                                </div>
                                            </td>
                                            <td>
                                                <div style={{ fontWeight: 600 }}>{batch.product?.name || '-'}</div>
                                                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{batch.product?.sku}</div>
                                            </td>
                                            <td>
                                                {new Date(batch.expiryDate).toLocaleDateString('zh-TW')}
                                            </td>
                                            <td>
                                                <span className={`badge ${badgeClass}`}>{label}</span>
                                            </td>
                                            <td>{batch.quantity.toLocaleString()}</td>
                                            <td>${Number(batch.costPrice).toLocaleString()}</td>
                                            <td style={{ textAlign: 'right' }}>
                                                <button
                                                    className="btn btn-danger btn-sm"
                                                    onClick={() => handleDelete(batch.id, batch.batchNumber)}
                                                >
                                                    刪除
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                )}
            </div>

            {showCreate && (
                <div className="modal-overlay" onClick={closeCreate}>
                    <div className="modal-content card" onClick={(e) => e.stopPropagation()}>
                        <h2 className="modal-title">新增批號</h2>
                        <form onSubmit={handleCreate}>
                            <div className="login-form">
                                <div className="input-group">
                                    <label className="input-label">商品</label>
                                    <select
                                        className="input-field"
                                        required
                                        value={batchForm.productId}
                                        onChange={(e) => setBatchForm({ ...batchForm, productId: e.target.value })}
                                    >
                                        <option value="">選擇商品</option>
                                        {productList.map((p) => (
                                            <option key={p.id} value={p.id}>
                                                {p.sku} - {p.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="input-group">
                                    <label className="input-label">批號</label>
                                    <input
                                        className="input-field"
                                        type="text"
                                        required
                                        placeholder="例：BATCH-20260101"
                                        value={batchForm.batchNumber}
                                        onChange={(e) => setBatchForm({ ...batchForm, batchNumber: e.target.value })}
                                    />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">到期日</label>
                                    <input
                                        className="input-field"
                                        type="date"
                                        required
                                        value={batchForm.expiryDate}
                                        onChange={(e) => setBatchForm({ ...batchForm, expiryDate: e.target.value })}
                                    />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">數量</label>
                                    <input
                                        className="input-field"
                                        type="number"
                                        min="1"
                                        step="1"
                                        required
                                        value={batchForm.quantity}
                                        onChange={(e) => setBatchForm({ ...batchForm, quantity: e.target.value })}
                                    />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">進貨成本</label>
                                    <input
                                        className="input-field"
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        required
                                        value={batchForm.costPrice}
                                        onChange={(e) => setBatchForm({ ...batchForm, costPrice: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-ghost" onClick={closeCreate}>取消</button>
                                <button type="submit" className="btn btn-primary" disabled={saving}>
                                    {saving ? '建立中...' : '建立批號'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
