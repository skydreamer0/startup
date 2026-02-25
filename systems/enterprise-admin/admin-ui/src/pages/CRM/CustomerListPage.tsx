import { useEffect, useState } from 'react';
import { crmApi, Customer } from '../../api/crm';
import { Link } from 'react-router-dom';

export default function CustomerListPage() {
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState({ type: '', hasLine: '' });

    useEffect(() => {
        fetchCustomers();
    }, [filter]);

    const fetchCustomers = async () => {
        try {
            setLoading(true);
            const res = await crmApi.getCustomers(filter);
            setCustomers(res.data || []);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="crm-list-page">
            <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                <div>
                    <h1 className="page-title">Customer Directory</h1>
                    <p className="page-subtitle" style={{ color: 'var(--text-dim)' }}>Manage customer relationships and interaction history</p>
                </div>
                <div className="flex gap-12">
                    <select
                        className="input-control"
                        style={{ width: '160px' }}
                        value={filter.type}
                        onChange={(e) => setFilter({ ...filter, type: e.target.value })}
                    >
                        <option value="">All Types</option>
                        <option value="new">First Time</option>
                        <option value="repeat">Repeat Loyal</option>
                    </select>
                    <select
                        className="input-control"
                        style={{ width: '160px' }}
                        value={filter.hasLine}
                        onChange={(e) => setFilter({ ...filter, hasLine: e.target.value })}
                    >
                        <option value="">All Status</option>
                        <option value="true">LINE Connected</option>
                        <option value="false">Not Connected</option>
                    </select>
                </div>
            </header>

            <div className="glass-card table-container">
                {loading ? (
                    <div className="p-20 text-center shimmer" style={{ height: '300px' }}></div>
                ) : (
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Name / Contact</th>
                                <th>LINE Auth</th>
                                <th>LTV (Spent)</th>
                                <th>Count</th>
                                <th>Last Activity</th>
                                <th style={{ textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {customers.length === 0 ? (
                                <tr>
                                    <td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-dim)' }}>
                                        No matching customers found.
                                    </td>
                                </tr>
                            ) : (
                                customers.map((c) => (
                                    <tr key={c.id}>
                                        <td>
                                            <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{c.name || 'Unknown'}</div>
                                            <div style={{ fontSize: '13px', color: 'var(--text-dim)' }}>{c.phone || 'No phone'}</div>
                                        </td>
                                        <td>
                                            {c.lineUid ? (
                                                <span className="badge badge-success">Connected</span>
                                            ) : (
                                                <span style={{ color: 'var(--text-dim)', fontSize: '12px' }}>Inactive</span>
                                            )}
                                        </td>
                                        <td>
                                            <span style={{ fontWeight: 700, color: '#818cf8' }}>${c.totalSpent.toLocaleString()}</span>
                                        </td>
                                        <td>{c.purchaseCount}</td>
                                        <td style={{ fontSize: '13px' }}>
                                            {c.lastInteractionDate ? new Date(c.lastInteractionDate).toLocaleDateString() : 'Never'}
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            <Link
                                                to={`/crm/${c.id}`}
                                                className="btn btn-primary"
                                                style={{ padding: '6px 14px', fontSize: '13px' }}
                                            >
                                                Timeline
                                            </Link>
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
