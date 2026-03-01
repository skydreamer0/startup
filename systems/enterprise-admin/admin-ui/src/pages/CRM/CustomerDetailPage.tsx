import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { crmApi, Customer } from '../../api/crm';

export default function CustomerDetailPage() {
    const { id } = useParams<{ id: string }>();
    const [newInteraction, setNewInteraction] = useState({ type: 'STORE_VISIT', content: '' });
    const queryClient = useQueryClient();

    const { data: customer, isLoading: loading } = useQuery<Customer | null>({
        queryKey: ['crm', 'customer', id],
        queryFn: () => id ? crmApi.getCustomerById(id) : Promise.resolve(null),
        enabled: !!id,
    });

    const addInteractionMutation = useMutation({
        mutationFn: (data: { type: string; content: string }) =>
            crmApi.addInteraction(id!, data),
        onSuccess: () => {
            setNewInteraction({ ...newInteraction, content: '' });
            queryClient.invalidateQueries({ queryKey: ['crm', 'customer', id] });
        },
    });

    const handleAddInteraction = (e: React.FormEvent) => {
        e.preventDefault();
        if (!id || !newInteraction.content) return;
        addInteractionMutation.mutate(newInteraction);
    };

    if (loading) return (
        <div className="p-20 flex justify-center">
            <div className="shimmer glass-card" style={{ width: '100%', height: '400px' }}></div>
        </div>
    );

    if (!customer) return (
        <div className="p-20 text-center">
            <h2 style={{ color: '#ef4444' }}>Profile not found</h2>
            <Link to="/crm" className="btn btn-ghost mt-12">Return to Directory</Link>
        </div>
    );

    return (
        <div className="customer-detail-page">
            <header className="page-header" style={{ marginBottom: '32px' }}>
                <Link to="/crm" style={{ color: 'var(--text-dim)', fontSize: '14px', textDecoration: 'none', display: 'block', marginBottom: '8px' }}>
                    ← Back to Directory
                </Link>
                <h1 className="page-title">{customer.name || 'Anonymous Customer'}</h1>
                <p className="page-subtitle" style={{ color: 'var(--text-dim)' }}>Comprehensive customer profile and engagement timeline</p>
            </header>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '32px' }}>
                {/* Left: Stats Card */}
                <aside className="space-y-24">
                    <section className="glass-card" style={{ padding: '24px' }}>
                        <h3 style={{ fontSize: '16px', marginBottom: '20px', color: 'var(--text-main)' }}>Contact Details</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div>
                                <label className="stat-label">Phone Number</label>
                                <div style={{ color: 'var(--text-main)', fontWeight: 600 }}>{customer.phone || 'N/A'}</div>
                            </div>
                            <div>
                                <label className="stat-label">LINE Connectivity</label>
                                <div>
                                    {customer.lineUid ? (
                                        <span className="badge badge-success">Connected</span>
                                    ) : (
                                        <span style={{ color: 'var(--text-dim)', fontSize: '13px' }}>Not Linked</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </section>

                    <section className="glass-card" style={{ padding: '24px' }}>
                        <h3 style={{ fontSize: '16px', marginBottom: '20px', color: 'var(--text-main)' }}>Commerce Summary</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div className="flex justify-between">
                                <span className="stat-label">Lifetime Value</span>
                                <span style={{ fontWeight: 800, color: '#818cf8' }}>${customer.totalSpent.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="stat-label">Total Orders</span>
                                <span style={{ fontWeight: 600 }}>{customer.purchaseCount}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="stat-label">Last Purchase</span>
                                <span style={{ fontSize: '13px' }}>
                                    {customer.lastPurchaseDate ? new Date(customer.lastPurchaseDate).toLocaleDateString() : 'Never'}
                                </span>
                            </div>
                        </div>
                    </section>
                </aside>

                {/* Right: Timeline & Activities */}
                <main className="space-y-24">
                    <section className="glass-card" style={{ padding: '28px' }}>
                        <h3 style={{ fontSize: '18px', marginBottom: '20px' }}>Log New Interaction</h3>
                        <form onSubmit={handleAddInteraction} style={{ display: 'flex', gap: '12px' }}>
                            <select
                                className="input-control"
                                style={{ width: '150px' }}
                                value={newInteraction.type}
                                onChange={e => setNewInteraction({ ...newInteraction, type: e.target.value })}
                            >
                                <option value="STORE_VISIT">🏪 Store Visit</option>
                                <option value="PHONE_CALL">📞 Phone Call</option>
                                <option value="LINE_MESSAGE">💬 LINE Msg</option>
                            </select>
                            <input
                                type="text"
                                className="input-control"
                                style={{ flex: 1 }}
                                placeholder="Note down key takeaways from this interaction..."
                                value={newInteraction.content}
                                onChange={e => setNewInteraction({ ...newInteraction, content: e.target.value })}
                                required
                            />
                            <button
                                type="submit"
                                disabled={addInteractionMutation.isPending || !newInteraction.content}
                                className="btn btn-primary"
                                style={{ padding: '0 24px' }}
                            >
                                {addInteractionMutation.isPending ? 'Saving...' : 'Log Note'}
                            </button>
                        </form>
                    </section>

                    <section className="glass-card" style={{ padding: '28px' }}>
                        <h3 style={{ fontSize: '18px', marginBottom: '24px' }}>Engagement History</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', position: 'relative' }}>
                            {customer.interactions?.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-dim)' }}>
                                    No records found in historical timeline.
                                </div>
                            ) : (
                                [...(customer.interactions ?? [])].reverse().map((int) => (
                                    <div key={int.id} style={{
                                        padding: '16px',
                                        background: 'rgba(255,255,255,0.02)',
                                        borderRadius: '12px',
                                        border: '1px solid var(--border-light)',
                                        display: 'flex',
                                        gap: '16px'
                                    }}>
                                        <div style={{
                                            width: '40px',
                                            height: '40px',
                                            background: 'var(--bg-glass)',
                                            borderRadius: '10px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: '18px'
                                        }}>
                                            {int.type === 'STORE_VISIT' ? '🏪' : int.type === 'LINE_MESSAGE' ? '💬' : '📞'}
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase' }}>
                                                    {int.type.replace('_', ' ')}
                                                </span>
                                                <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                                                    {new Date(int.interactedAt).toLocaleString()}
                                                </span>
                                            </div>
                                            <p style={{ margin: 0, fontSize: '14px', lineHeight: '1.6' }}>{int.content}</p>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </section>
                </main>
            </div>
        </div>
    );
}
