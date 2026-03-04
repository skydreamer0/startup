import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { crmApi, Customer } from '../../api/crm';
import { Link } from 'react-router-dom';

export default function CustomerListPage() {
    const [filter, setFilter] = useState({ type: '', hasLine: '' });

    const { data: customersData, isLoading: loading } = useQuery({
        queryKey: ['crm', 'customers', filter],
        queryFn: () => crmApi.getCustomers(filter),
    });

    const customers: Customer[] = customersData?.data || [];

    return (
        <div className="crm-list-page">
            <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                <div>
                    <h1 className="page-title">Customer Directory</h1>
                    <p className="page-subtitle" style={{ color: 'var(--text-muted)' }}>Manage customer relationships and interaction history</p>
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

            <div className="card table-container">
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
                                    <td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                                        No matching customers found.
                                    </td>
                                </tr>
                            ) : (
                                customers.map((c) => (
                                    <tr key={c.id}>
                                        <td>
                                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{c.name || 'Unknown'}</div>
                                            <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{c.phone || 'No phone'}</div>
                                        </td>
                                        <td>
                                            {c.lineUid ? (
                                                <span className="badge badge-success">Connected</span>
                                            ) : (
                                                <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Inactive</span>
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
