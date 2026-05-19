import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ordersApi, Order } from '../../api/orders';
import { crmApi, Customer } from '../../api/crm';
import { inventoryApi, Product } from '../../api/inventory';
import { excelApi } from '../../api/excel';
import PlanGate from '../../components/PlanGate';

type OrderForm = {
    customerId: string;
    productId: string;
    quantity: string;
    shippingAddress: string;
};

type ApiError = {
    response?: {
        data?: {
            error?: {
                message?: string;
            };
        };
    };
};

const emptyOrderForm: OrderForm = {
    customerId: '',
    productId: '',
    quantity: '1',
    shippingAddress: '',
};

export default function OrderListPage() {
    const [statusFilter, setStatusFilter] = useState('');
    const [showCreate, setShowCreate] = useState(false);
    const [orderForm, setOrderForm] = useState<OrderForm>(emptyOrderForm);
    const [saving, setSaving] = useState(false);
    const [exportFrom, setExportFrom] = useState('');
    const [exportTo, setExportTo] = useState('');
    const queryClient = useQueryClient();

    const exportMutation = useMutation({
        mutationFn: () => excelApi.exportOrders(exportFrom || undefined, exportTo || undefined),
        onError: (err) => alert(err instanceof Error ? err.message : 'Export failed'),
    });

    const { data: ordersData, isLoading: loading } = useQuery({
        queryKey: ['orders', statusFilter],
        queryFn: () => ordersApi.getOrders({ status: statusFilter || undefined }),
    });

    const { data: customersData } = useQuery({
        queryKey: ['crm', 'customers', 'orders'],
        queryFn: () => crmApi.getCustomers(),
    });

    const { data: productsData } = useQuery({
        queryKey: ['inventory', 'products', 'orders'],
        queryFn: () => inventoryApi.getProducts(),
    });

    const orders: Order[] = ordersData?.data || [];
    const customers: Customer[] = customersData?.data || [];
    const products: Product[] = productsData?.data || [];

    const getStatusBadgeClass = (status: string) => {
        switch (status) {
            case 'completed': return 'badge-success';
            case 'pending': return 'badge-warning';
            case 'cancelled': return 'badge-danger';
            default: return '';
        }
    };

    function openCreate() {
        setOrderForm(emptyOrderForm);
        setShowCreate(true);
    }

    function closeCreate() {
        setShowCreate(false);
        setOrderForm(emptyOrderForm);
    }

    async function createOrder(e: React.FormEvent) {
        e.preventDefault();
        setSaving(true);
        try {
            await ordersApi.createOrder({
                customerId: orderForm.customerId,
                shippingAddress: orderForm.shippingAddress.trim() || undefined,
                items: [
                    {
                        productId: orderForm.productId,
                        quantity: Number(orderForm.quantity),
                    },
                ],
            });
            closeCreate();
            queryClient.invalidateQueries({ queryKey: ['orders'] });
            queryClient.invalidateQueries({ queryKey: ['inventory', 'products'] });
        } catch (err) {
            const message = (err as ApiError).response?.data?.error?.message || 'Failed to create order';
            alert(message);
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="orders-page">
            <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                <div>
                    <h1 className="page-title">Sales Orders</h1>
                    <p className="page-subtitle" style={{ color: 'var(--text-muted)' }}>Track customer purchases and fulfillment status</p>
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
                    <PlanGate plan="starter" fallback={null}>
                        <input
                            type="date"
                            className="input-control"
                            style={{ width: '150px' }}
                            value={exportFrom}
                            onChange={(e) => setExportFrom(e.target.value)}
                            title="Export from date"
                        />
                        <input
                            type="date"
                            className="input-control"
                            style={{ width: '150px' }}
                            value={exportTo}
                            onChange={(e) => setExportTo(e.target.value)}
                            title="Export to date"
                        />
                        <button
                            className="btn btn-ghost"
                            onClick={() => exportMutation.mutate()}
                            disabled={exportMutation.isPending}
                        >
                            {exportMutation.isPending ? 'Exporting...' : 'Export Excel'}
                        </button>
                    </PlanGate>
                    <button className="btn btn-primary" onClick={openCreate}>+ Create Order</button>
                </div>
            </header>

            <div className="card table-container">
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
                                    <td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                                        No orders found matching your criteria.
                                    </td>
                                </tr>
                            ) : (
                                orders.map((o) => (
                                    <tr key={o.id}>
                                        <td>
                                            <div style={{ fontFamily: 'JetBrains Mono', fontSize: '12px', color: 'var(--text-primary)', fontWeight: 600 }}>
                                                #{o.id.slice(0, 8).toUpperCase()}
                                            </div>
                                            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                                {new Date(o.createdAt).toLocaleString()}
                                            </div>
                                        </td>
                                        <td>
                                            <div style={{ fontWeight: 600 }}>{o.customer?.name || 'Walk-in'}</div>
                                            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{o.customer?.phone}</div>
                                        </td>
                                        <td>
                                            <span style={{ color: 'var(--text-muted)' }}>{o._count?.items || 0} items</span>
                                        </td>
                                        <td>
                                            <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>
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

            {showCreate && (
                <div className="modal-overlay" onClick={closeCreate}>
                    <div className="modal-content card" onClick={(e) => e.stopPropagation()}>
                        <h2 className="modal-title">Create Order</h2>
                        <form onSubmit={createOrder}>
                            <div className="login-form">
                                <div className="input-group">
                                    <label className="input-label">Customer</label>
                                    <select className="input-field" required value={orderForm.customerId}
                                        onChange={(e) => setOrderForm({ ...orderForm, customerId: e.target.value })}>
                                        <option value="">Select customer</option>
                                        {customers.map((customer) => (
                                            <option key={customer.id} value={customer.id}>
                                                {customer.name || customer.phone || customer.id}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="input-group">
                                    <label className="input-label">Product</label>
                                    <select className="input-field" required value={orderForm.productId}
                                        onChange={(e) => setOrderForm({ ...orderForm, productId: e.target.value })}>
                                        <option value="">Select product</option>
                                        {products.map((product) => (
                                            <option key={product.id} value={product.id}>
                                                {product.sku} - {product.name} ({product.stockQuantity} in stock)
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="input-group">
                                    <label className="input-label">Quantity</label>
                                    <input className="input-field" type="number" min="1" step="1" required value={orderForm.quantity}
                                        onChange={(e) => setOrderForm({ ...orderForm, quantity: e.target.value })} />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">Shipping Address</label>
                                    <input className="input-field" value={orderForm.shippingAddress}
                                        onChange={(e) => setOrderForm({ ...orderForm, shippingAddress: e.target.value })} />
                                </div>
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-ghost" onClick={closeCreate}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={saving}>
                                    {saving ? 'Creating...' : 'Create Order'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
