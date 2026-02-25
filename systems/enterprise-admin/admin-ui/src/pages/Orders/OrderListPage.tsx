import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ordersApi, Order } from '../../api/orders';
import { Link } from 'react-router-dom';

export default function OrderListPage() {
    const [statusFilter, setStatusFilter] = useState('');

    const { data: ordersData, isLoading: loading } = useQuery({
        queryKey: ['orders', statusFilter],
        queryFn: () => ordersApi.getOrders({ status: statusFilter || undefined }),
    });

    const orders: Order[] = ordersData?.data || [];

    const getStatusBadgeClass = (status: string) => {
        switch (status) {
            case 'completed': return 'badge-success';
            case 'pending': return 'badge-warning';
            case 'cancelled': return 'badge-danger';
            default: return '';
        }
    };

    return (
        <div className="orders-page">
            <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                <div>
                    <h1 className="page-title">Sales Orders</h1>
                    <p className="page-subtitle" style={{ color: 'var(--text-dim)' }}>Track customer purchases and fulfillment status</p>
                </div>
                <div className="flex gap-12">
                    <select
                        className="input-control"
                        style={{ width: '180px' }}
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                    >
                        <option value="">All Statuses</option>
                        <option value="pending">Pending</option>
                        <option value="completed">Completed</option>
                        <option value="cancelled">Cancelled</option>
                    </select>
                    <button className="btn btn-primary">+ Create Order</button>
                </div>
            </header>

            <div className="glass-card table-container">
                {loading ? (
                    <div className="p-20 text-center shimmer" style={{ height: '300px' }}></div>
                ) : (
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Order ID / Date</th>
                                <th>Customer</th>
                                <th>Items</th>
                                <th>Total Amount</th>
                                <th>Status</th>
                                <th style={{ textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {orders.length === 0 ? (
                                <tr>
                                    <td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-dim)' }}>
                                        No orders found matching your criteria.
                                    </td>
                                </tr>
                            ) : (
                                orders.map((o) => (
                                    <tr key={o.id}>
                                        <td>
                                            <div style={{ fontFamily: 'JetBrains Mono', fontSize: '12px', color: 'var(--text-main)', fontWeight: 600 }}>
                                                #{o.id.slice(0, 8).toUpperCase()}
                                            </div>
                                            <div style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
                                                {new Date(o.createdAt).toLocaleString()}
                                            </div>
                                        </td>
                                        <td>
                                            <div style={{ fontWeight: 600 }}>{o.customer?.name || 'Walk-in'}</div>
                                            <div style={{ fontSize: '12px', color: 'var(--text-dim)' }}>{o.customer?.phone}</div>
                                        </td>
                                        <td>
                                            <span style={{ color: 'var(--text-dim)' }}>{o._count?.items || 0} items</span>
                                        </td>
                                        <td>
                                            <div style={{ fontWeight: 800, color: 'var(--text-main)' }}>
                                                ${o.totalAmount.toLocaleString()}
                                            </div>
                                            <div style={{ fontSize: '11px', color: o.paymentStatus === 'paid' ? '#10b981' : '#f59e0b' }}>
                                                {o.paymentStatus.toUpperCase()}
                                            </div>
                                        </td>
                                        <td>
                                            <span className={`badge ${getStatusBadgeClass(o.status)}`}>
                                                {o.status}
                                            </span>
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            <button className="btn btn-ghost" style={{ padding: '6px 14px', fontSize: '13px' }}>
                                                Details
                                            </button>
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
