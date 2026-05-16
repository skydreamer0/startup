import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { shiftsApi, Shift } from '../../api/shifts';
import { settlementsApi, DailySettlement } from '../../api/batches';

type ApiError = {
    response?: {
        data?: {
            error?: {
                message?: string;
            };
        };
    };
};

type ActiveTab = 'shifts' | 'settlements';

type ShiftForm = {
    staffId: string;
    openingCash: string;
    notes: string;
};

type CloseShiftForm = {
    closingCash: string;
    notes: string;
};

type SettlementForm = {
    shiftId: string;
    date: string;
    totalSales: string;
    totalOrders: string;
    cashAmount: string;
    cardAmount: string;
    linePayAmount: string;
    otherAmount: string;
    notes: string;
};

const emptyShiftForm: ShiftForm = {
    staffId: '',
    openingCash: '',
    notes: '',
};

const emptyCloseForm: CloseShiftForm = {
    closingCash: '',
    notes: '',
};

const emptySettlementForm: SettlementForm = {
    shiftId: '',
    date: new Date().toISOString().split('T')[0],
    totalSales: '',
    totalOrders: '',
    cashAmount: '',
    cardAmount: '',
    linePayAmount: '',
    otherAmount: '',
    notes: '',
};

export default function ShiftListPage() {
    const [activeTab, setActiveTab] = useState<ActiveTab>('shifts');
    const [statusFilter, setStatusFilter] = useState('');
    const [showCreateShift, setShowCreateShift] = useState(false);
    const [showCloseShift, setShowCloseShift] = useState<Shift | null>(null);
    const [shiftForm, setShiftForm] = useState<ShiftForm>(emptyShiftForm);
    const [closeForm, setCloseForm] = useState<CloseShiftForm>(emptyCloseForm);
    const [saving, setSaving] = useState(false);

    // Settlement state
    const [showCalculate, setShowCalculate] = useState(false);
    const [showCreateSettlement, setShowCreateSettlement] = useState(false);
    const [calculateShiftId, setCalculateShiftId] = useState('');
    const [calculateResult, setCalculateResult] = useState<Record<string, unknown> | null>(null);
    const [calculating, setCalculating] = useState(false);
    const [settlementForm, setSettlementForm] = useState<SettlementForm>(emptySettlementForm);

    const queryClient = useQueryClient();

    const { data: shiftsData, isLoading: shiftsLoading } = useQuery({
        queryKey: ['shifts', statusFilter],
        queryFn: () => shiftsApi.getAll({ status: statusFilter || undefined }),
    });

    const { data: settlementsData, isLoading: settlementsLoading } = useQuery({
        queryKey: ['settlements'],
        queryFn: () => settlementsApi.getAll(),
        enabled: activeTab === 'settlements',
    });

    const shifts: Shift[] = shiftsData?.data || [];
    const settlements: DailySettlement[] = settlementsData?.data || [];

    // --- Shift actions ---

    function openCreateShift() {
        setShiftForm(emptyShiftForm);
        setShowCreateShift(true);
    }

    async function handleCreateShift(e: React.FormEvent) {
        e.preventDefault();
        setSaving(true);
        try {
            await shiftsApi.create({
                staffId: shiftForm.staffId,
                openingCash: shiftForm.openingCash ? Number(shiftForm.openingCash) : undefined,
                notes: shiftForm.notes || undefined,
            });
            setShowCreateShift(false);
            setShiftForm(emptyShiftForm);
            queryClient.invalidateQueries({ queryKey: ['shifts'] });
        } catch (err) {
            const message = (err as ApiError).response?.data?.error?.message || 'Failed to create shift';
            alert(message);
        } finally {
            setSaving(false);
        }
    }

    function openCloseShift(shift: Shift) {
        setCloseForm(emptyCloseForm);
        setShowCloseShift(shift);
    }

    async function handleCloseShift(e: React.FormEvent) {
        e.preventDefault();
        if (!showCloseShift) return;
        setSaving(true);
        try {
            await shiftsApi.close(showCloseShift.id, {
                closingCash: Number(closeForm.closingCash),
                notes: closeForm.notes || undefined,
            });
            setShowCloseShift(null);
            setCloseForm(emptyCloseForm);
            queryClient.invalidateQueries({ queryKey: ['shifts'] });
        } catch (err) {
            const message = (err as ApiError).response?.data?.error?.message || 'Failed to close shift';
            alert(message);
        } finally {
            setSaving(false);
        }
    }

    // --- Settlement actions ---

    async function handleCalculate() {
        if (!calculateShiftId) {
            alert('請選擇班別');
            return;
        }
        setCalculating(true);
        try {
            const result = await settlementsApi.calculate(calculateShiftId);
            setCalculateResult(result.data);
        } catch (err) {
            const message = (err as ApiError).response?.data?.error?.message || 'Failed to calculate settlement';
            alert(message);
        } finally {
            setCalculating(false);
        }
    }

    async function handleCreateSettlement(e: React.FormEvent) {
        e.preventDefault();
        setSaving(true);
        try {
            await settlementsApi.create({
                shiftId: settlementForm.shiftId,
                date: settlementForm.date,
                totalSales: Number(settlementForm.totalSales),
                totalOrders: Number(settlementForm.totalOrders),
                cashAmount: Number(settlementForm.cashAmount),
                cardAmount: Number(settlementForm.cardAmount),
                linePayAmount: Number(settlementForm.linePayAmount),
                otherAmount: Number(settlementForm.otherAmount),
                notes: settlementForm.notes || undefined,
            });
            setShowCreateSettlement(false);
            setSettlementForm(emptySettlementForm);
            queryClient.invalidateQueries({ queryKey: ['settlements'] });
        } catch (err) {
            const message = (err as ApiError).response?.data?.error?.message || 'Failed to create settlement';
            alert(message);
        } finally {
            setSaving(false);
        }
    }

    async function handleConfirmSettlement(id: string) {
        if (!confirm('確定要確認此日結記錄嗎？')) return;
        try {
            await settlementsApi.confirm(id);
            queryClient.invalidateQueries({ queryKey: ['settlements'] });
        } catch (err) {
            const message = (err as ApiError).response?.data?.error?.message || 'Failed to confirm settlement';
            alert(message);
        }
    }

    return (
        <div className="shift-list-page">
            <header className="page-header" style={{ marginBottom: '32px' }}>
                <h1 className="page-title">班別管理與日結</h1>
                <p className="page-subtitle" style={{ color: 'var(--text-muted)' }}>管理班別開收班與日結報表</p>
            </header>

            {/* Tab Navigation */}
            <div className="flex gap-8" style={{ marginBottom: '24px', borderBottom: '1px solid var(--border-color)' }}>
                <button
                    className={`btn ${activeTab === 'shifts' ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ borderRadius: '6px 6px 0 0' }}
                    onClick={() => setActiveTab('shifts')}
                >
                    班別管理
                </button>
                <button
                    className={`btn ${activeTab === 'settlements' ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ borderRadius: '6px 6px 0 0' }}
                    onClick={() => setActiveTab('settlements')}
                >
                    日結報表
                </button>
            </div>

            {/* Shifts Tab */}
            {activeTab === 'shifts' && (
                <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <div className="flex gap-8">
                            <select
                                className="input-control"
                                style={{ width: '160px' }}
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                            >
                                <option value="">全部</option>
                                <option value="OPEN">進行中</option>
                                <option value="CLOSED">已結班</option>
                            </select>
                        </div>
                        <button className="btn btn-primary" onClick={openCreateShift}>+ 開班</button>
                    </div>

                    <div className="card table-container">
                        {shiftsLoading ? (
                            <div className="card"><p>Loading...</p></div>
                        ) : (
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>值班人員</th>
                                        <th>狀態</th>
                                        <th>開班時間</th>
                                        <th>收班時間</th>
                                        <th>開班金額</th>
                                        <th>收班金額</th>
                                        <th>訂單數</th>
                                        <th style={{ textAlign: 'right' }}>操作</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {shifts.length === 0 ? (
                                        <tr>
                                            <td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                                                目前沒有班別資料。
                                            </td>
                                        </tr>
                                    ) : (
                                        shifts.map((shift) => (
                                            <tr key={shift.id}>
                                                <td>
                                                    <div style={{ fontWeight: 600 }}>{shift.staff?.fullName || shift.staffId}</div>
                                                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{shift.staff?.email}</div>
                                                </td>
                                                <td>
                                                    <span className={`badge ${shift.status === 'OPEN' ? 'badge-success' : 'badge-warning'}`}>
                                                        {shift.status === 'OPEN' ? '進行中' : '已結班'}
                                                    </span>
                                                </td>
                                                <td style={{ fontSize: '13px' }}>
                                                    {new Date(shift.openedAt).toLocaleString('zh-TW')}
                                                </td>
                                                <td style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                                                    {shift.closedAt ? new Date(shift.closedAt).toLocaleString('zh-TW') : '-'}
                                                </td>
                                                <td>${(shift.openingCash ?? 0).toLocaleString()}</td>
                                                <td>{shift.closingCash != null ? `$${shift.closingCash.toLocaleString()}` : '-'}</td>
                                                <td>{shift._count?.orders ?? '-'}</td>
                                                <td style={{ textAlign: 'right' }}>
                                                    {shift.status === 'OPEN' && (
                                                        <button
                                                            className="btn btn-ghost btn-sm"
                                                            onClick={() => openCloseShift(shift)}
                                                        >
                                                            交班
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        )}
                    </div>
                </>
            )}

            {/* Settlements Tab */}
            {activeTab === 'settlements' && (
                <>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginBottom: '16px' }}>
                        <button className="btn btn-ghost" onClick={() => { setCalculateShiftId(''); setCalculateResult(null); setShowCalculate(true); }}>
                            試算日結
                        </button>
                        <button className="btn btn-primary" onClick={() => { setSettlementForm(emptySettlementForm); setShowCreateSettlement(true); }}>
                            + 建立日結
                        </button>
                    </div>

                    <div className="card table-container">
                        {settlementsLoading ? (
                            <div className="card"><p>Loading...</p></div>
                        ) : (
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>日期</th>
                                        <th>班別</th>
                                        <th>總銷售</th>
                                        <th>訂單數</th>
                                        <th>現金</th>
                                        <th>刷卡</th>
                                        <th>LINE Pay</th>
                                        <th>確認狀態</th>
                                        <th style={{ textAlign: 'right' }}>操作</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {settlements.length === 0 ? (
                                        <tr>
                                            <td colSpan={9} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                                                目前沒有日結記錄。
                                            </td>
                                        </tr>
                                    ) : (
                                        settlements.map((s) => (
                                            <tr key={s.id}>
                                                <td style={{ fontWeight: 600 }}>
                                                    {new Date(s.date).toLocaleDateString('zh-TW')}
                                                </td>
                                                <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                                    {s.shift?.staff?.fullName || s.shiftId.slice(0, 8)}
                                                </td>
                                                <td style={{ fontWeight: 700 }}>${s.totalSales.toLocaleString()}</td>
                                                <td>{s.totalOrders}</td>
                                                <td>${s.cashAmount.toLocaleString()}</td>
                                                <td>${s.cardAmount.toLocaleString()}</td>
                                                <td>${s.linePayAmount.toLocaleString()}</td>
                                                <td>
                                                    <span className={`badge ${s.confirmedAt ? 'badge-success' : 'badge-warning'}`}>
                                                        {s.confirmedAt ? '已確認' : '待確認'}
                                                    </span>
                                                </td>
                                                <td style={{ textAlign: 'right' }}>
                                                    {!s.confirmedAt && (
                                                        <button
                                                            className="btn btn-ghost btn-sm"
                                                            onClick={() => handleConfirmSettlement(s.id)}
                                                        >
                                                            確認
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        )}
                    </div>
                </>
            )}

            {/* Create Shift Modal */}
            {showCreateShift && (
                <div className="modal-overlay" onClick={() => setShowCreateShift(false)}>
                    <div className="modal-content card" onClick={(e) => e.stopPropagation()}>
                        <h2 className="modal-title">開班</h2>
                        <form onSubmit={handleCreateShift}>
                            <div className="login-form">
                                <div className="input-group">
                                    <label className="input-label">員工 ID</label>
                                    <input
                                        className="input-field"
                                        type="text"
                                        required
                                        placeholder="輸入員工 ID"
                                        value={shiftForm.staffId}
                                        onChange={(e) => setShiftForm({ ...shiftForm, staffId: e.target.value })}
                                    />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">開班金額</label>
                                    <input
                                        className="input-field"
                                        type="number"
                                        min="0"
                                        step="1"
                                        placeholder="0"
                                        value={shiftForm.openingCash}
                                        onChange={(e) => setShiftForm({ ...shiftForm, openingCash: e.target.value })}
                                    />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">備註</label>
                                    <input
                                        className="input-field"
                                        type="text"
                                        value={shiftForm.notes}
                                        onChange={(e) => setShiftForm({ ...shiftForm, notes: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-ghost" onClick={() => setShowCreateShift(false)}>取消</button>
                                <button type="submit" className="btn btn-primary" disabled={saving}>
                                    {saving ? '開班中...' : '確認開班'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Close Shift Modal */}
            {showCloseShift && (
                <div className="modal-overlay" onClick={() => setShowCloseShift(null)}>
                    <div className="modal-content card" onClick={(e) => e.stopPropagation()}>
                        <h2 className="modal-title">交班 — {showCloseShift.staff?.fullName || showCloseShift.staffId}</h2>
                        <form onSubmit={handleCloseShift}>
                            <div className="login-form">
                                <div className="input-group">
                                    <label className="input-label">收班金額</label>
                                    <input
                                        className="input-field"
                                        type="number"
                                        min="0"
                                        step="1"
                                        required
                                        placeholder="0"
                                        value={closeForm.closingCash}
                                        onChange={(e) => setCloseForm({ ...closeForm, closingCash: e.target.value })}
                                    />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">備註</label>
                                    <input
                                        className="input-field"
                                        type="text"
                                        value={closeForm.notes}
                                        onChange={(e) => setCloseForm({ ...closeForm, notes: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-ghost" onClick={() => setShowCloseShift(null)}>取消</button>
                                <button type="submit" className="btn btn-primary" disabled={saving}>
                                    {saving ? '處理中...' : '確認交班'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Calculate Settlement Modal */}
            {showCalculate && (
                <div className="modal-overlay" onClick={() => { setShowCalculate(false); setCalculateResult(null); }}>
                    <div className="modal-content card" onClick={(e) => e.stopPropagation()}>
                        <h2 className="modal-title">試算日結</h2>
                        <div className="login-form">
                            <div className="input-group">
                                <label className="input-label">選擇班別 ID</label>
                                <select
                                    className="input-field"
                                    value={calculateShiftId}
                                    onChange={(e) => setCalculateShiftId(e.target.value)}
                                >
                                    <option value="">選擇班別</option>
                                    {shifts.map((s) => (
                                        <option key={s.id} value={s.id}>
                                            {s.staff?.fullName || s.staffId} — {new Date(s.openedAt).toLocaleString('zh-TW')}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <button
                                className="btn btn-primary"
                                style={{ width: '100%' }}
                                onClick={handleCalculate}
                                disabled={calculating || !calculateShiftId}
                            >
                                {calculating ? '計算中...' : '試算'}
                            </button>
                            {calculateResult && (
                                <div className="card" style={{ marginTop: '16px', background: 'var(--bg-secondary)', padding: '16px' }}>
                                    <h3 style={{ marginBottom: '12px', fontWeight: 700 }}>試算結果</h3>
                                    <pre style={{ fontSize: '13px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                                        {JSON.stringify(calculateResult, null, 2)}
                                    </pre>
                                </div>
                            )}
                        </div>
                        <div className="modal-actions">
                            <button className="btn btn-ghost" onClick={() => { setShowCalculate(false); setCalculateResult(null); }}>關閉</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Create Settlement Modal */}
            {showCreateSettlement && (
                <div className="modal-overlay" onClick={() => setShowCreateSettlement(false)}>
                    <div className="modal-content card" onClick={(e) => e.stopPropagation()}>
                        <h2 className="modal-title">建立日結</h2>
                        <form onSubmit={handleCreateSettlement}>
                            <div className="login-form">
                                <div className="input-group">
                                    <label className="input-label">班別</label>
                                    <select
                                        className="input-field"
                                        required
                                        value={settlementForm.shiftId}
                                        onChange={(e) => setSettlementForm({ ...settlementForm, shiftId: e.target.value })}
                                    >
                                        <option value="">選擇班別</option>
                                        {shifts.map((s) => (
                                            <option key={s.id} value={s.id}>
                                                {s.staff?.fullName || s.staffId} — {new Date(s.openedAt).toLocaleString('zh-TW')}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="input-group">
                                    <label className="input-label">日期</label>
                                    <input
                                        className="input-field"
                                        type="date"
                                        required
                                        value={settlementForm.date}
                                        onChange={(e) => setSettlementForm({ ...settlementForm, date: e.target.value })}
                                    />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">總銷售金額</label>
                                    <input
                                        className="input-field"
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        required
                                        value={settlementForm.totalSales}
                                        onChange={(e) => setSettlementForm({ ...settlementForm, totalSales: e.target.value })}
                                    />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">訂單數</label>
                                    <input
                                        className="input-field"
                                        type="number"
                                        min="0"
                                        step="1"
                                        required
                                        value={settlementForm.totalOrders}
                                        onChange={(e) => setSettlementForm({ ...settlementForm, totalOrders: e.target.value })}
                                    />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">現金金額</label>
                                    <input
                                        className="input-field"
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        required
                                        value={settlementForm.cashAmount}
                                        onChange={(e) => setSettlementForm({ ...settlementForm, cashAmount: e.target.value })}
                                    />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">刷卡金額</label>
                                    <input
                                        className="input-field"
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        required
                                        value={settlementForm.cardAmount}
                                        onChange={(e) => setSettlementForm({ ...settlementForm, cardAmount: e.target.value })}
                                    />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">LINE Pay 金額</label>
                                    <input
                                        className="input-field"
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        required
                                        value={settlementForm.linePayAmount}
                                        onChange={(e) => setSettlementForm({ ...settlementForm, linePayAmount: e.target.value })}
                                    />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">其他金額</label>
                                    <input
                                        className="input-field"
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        required
                                        value={settlementForm.otherAmount}
                                        onChange={(e) => setSettlementForm({ ...settlementForm, otherAmount: e.target.value })}
                                    />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">備註</label>
                                    <input
                                        className="input-field"
                                        type="text"
                                        value={settlementForm.notes}
                                        onChange={(e) => setSettlementForm({ ...settlementForm, notes: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-ghost" onClick={() => setShowCreateSettlement(false)}>取消</button>
                                <button type="submit" className="btn btn-primary" disabled={saving}>
                                    {saving ? '建立中...' : '建立日結'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
