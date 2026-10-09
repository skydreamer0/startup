import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { batchesApi, type BatchChangeRecord, type ProductBatch } from '../../api/batches';

const labels = { RELEASED: '已驗收可售', QUARANTINE: '待驗收隔離', BLOCKED: '封鎖' };
const date = (value: string) => new Date(value).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
function describe(record: BatchChangeRecord, side: 'before' | 'after') {
    const value = record[side];
    if ('exists' in value) return '尚未收貨';
    if (record.operation === 'INITIAL_RELEASE') return labels[value.status];
    return record.operation === 'STATUS' ? labels[value.status] : record.operation === 'EXPIRY' ? date(value.expiryDate) : `$${value.costPrice}`;
}
function errorMessage(error: unknown) {
    const response = (error as { response?: { status?: number; data?: { error?: { message?: string } } } }).response;
    if (response?.status === 403) return '權限不足，無法完成批次更正或放行。請洽有權限的管理者。';
    return response?.data?.error?.message || '未能確認更正成功。請先重新載入歷史與批次狀態，確認後再操作。';
}

export default function BatchAuditPanel({ batch, onClose }: { batch: ProductBatch; onClose: () => void }) {
    const client = useQueryClient();
    const [operation, setOperation] = useState<'STATUS' | 'EXPIRY' | 'COST'>('STATUS');
    const [status, setStatus] = useState<ProductBatch['status']>('QUARANTINE');
    const [expiry, setExpiry] = useState('');
    const [cost, setCost] = useState('');
    const [reason, setReason] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [cursor, setCursor] = useState<string | undefined>();
    const history = useQuery({ queryKey: ['batch-history', batch.id, cursor], queryFn: () => batchesApi.history(batch.id, cursor) });

    async function submit(event: React.FormEvent) {
        event.preventDefault();
        if (saving) return;
        setSaving(true); setError(''); setSuccess('');
        try {
            if (operation === 'STATUS') await batchesApi.changeStatus(batch.id, { status, reason: reason.trim() });
            else if (operation === 'EXPIRY') await batchesApi.correctExpiry(batch.id, { expiryDate: `${expiry}T00:00:00.000Z`, reason: reason.trim() });
            else await batchesApi.correctCost(batch.id, { costPrice: Number(cost), reason: reason.trim() });
            setReason(''); setCursor(undefined); setSuccess('更正已保存，並留下不可覆寫的稽核紀錄');
            await Promise.all([client.invalidateQueries({ queryKey: ['batches'] }), client.invalidateQueries({ queryKey: ['batch-history', batch.id] })]);
        } catch (err) { setError(errorMessage(err)); }
        finally { setSaving(false); }
    }

    return <section className="card" aria-label={`批次 ${batch.batchNumber} 更正與歷史`} style={{ marginTop: 24, padding: 24 }}>
        <div className="flex gap-12" style={{ justifyContent: 'space-between' }}>
            <h2>批次 {batch.batchNumber}：更正與歷史</h2>
            <button type="button" className="btn btn-ghost" style={{ minHeight: 44 }} onClick={onClose} disabled={saving}>關閉</button>
        </div>
        <p>現況：{labels[batch.status]}。每次更正必填原因；放行需要獨立權限，到期當日不可售。更正不會變更庫存量或既有訂單成本。</p>
        <form onSubmit={submit}>
            <fieldset disabled={saving} style={{ border: 0, padding: 0 }}>
                <div className="input-group">
                    <label htmlFor="batch-audit-operation">更正項目</label>
                    <select id="batch-audit-operation" className="input-field" value={operation} onChange={e => { setOperation(e.target.value as typeof operation); setError(''); setSuccess(''); }}>
                        <option value="STATUS">狀態轉換</option><option value="EXPIRY">效期更正</option><option value="COST">成本更正</option>
                    </select>
                </div>
                {operation === 'STATUS' ? <div className="input-group">
                    <label htmlFor="batch-audit-status">變更後狀態</label>
                    <select id="batch-audit-status" className="input-field" value={status} onChange={e => setStatus(e.target.value as ProductBatch['status'])}>
                        <option value="QUARANTINE">待驗收隔離</option><option value="BLOCKED">封鎖</option><option value="RELEASED">已驗收可售（需獨立放行權限）</option>
                    </select>
                </div> : operation === 'EXPIRY' ? <div className="input-group">
                    <label htmlFor="batch-audit-expiry">更正後到期日</label>
                    <input id="batch-audit-expiry" className="input-field" type="date" required value={expiry} onChange={e => setExpiry(e.target.value)} />
                </div> : <div className="input-group">
                    <label htmlFor="batch-audit-cost">更正後成本</label>
                    <input id="batch-audit-cost" className="input-field" type="number" min="0.0001" max="99999999.9999" step="0.0001" required value={cost} onChange={e => setCost(e.target.value)} />
                </div>}
                <div className="input-group">
                    <label htmlFor="batch-audit-reason">更正原因（必填）</label>
                    <textarea id="batch-audit-reason" className="input-field" required maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} />
                </div>
                <button type="submit" className="btn btn-primary" style={{ minHeight: 44 }} disabled={saving || !reason.trim()}>{saving ? '保存中…' : '保存更正與稽核紀錄'}</button>
            </fieldset>
        </form>
        {error && <p role="alert">{error}</p>}
        {success && <p role="status">{success}</p>}
        <h3>更正歷史（最新在前）</h3>
        {history.isPending ? <p role="status">載入歷史中…</p> : history.isError ? <div><p role="alert">無法載入更正歷史，不能視為沒有紀錄。</p><button type="button" className="btn btn-ghost" onClick={() => void history.refetch()}>重新載入歷史</button></div> : <>
            {!history.data.items.length && <p>目前沒有更正紀錄</p>}
            <ol>{history.data.items.map(record => <li key={record.id} style={{ marginBottom: 16 }}>
                <p>{date(record.createdAt)}（台北時間）・操作者 {record.actorId}・{record.operation === 'INITIAL_RELEASE' ? '初次放行' : record.operation === 'STATUS' ? '狀態' : record.operation === 'EXPIRY' ? '效期' : '成本'}</p>
                <p>{describe(record, 'before')} → {describe(record, 'after')}</p><p>原因：{record.reason}</p>
            </li>)}</ol>
            {cursor && <button type="button" className="btn btn-ghost" onClick={() => setCursor(undefined)}>回到最新紀錄</button>}
            {history.data.nextCursor && <button type="button" className="btn btn-ghost" onClick={() => setCursor(history.data.nextCursor!)}>更早的紀錄</button>}
        </>}
    </section>;
}
