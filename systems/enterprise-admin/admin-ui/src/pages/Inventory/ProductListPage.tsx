import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { inventoryApi, Product } from '../../api/inventory';

export default function ProductListPage() {
    const [filter, setFilter] = useState({ lowStock: '' });

    const { data: productsData, isLoading: loading } = useQuery({
        queryKey: ['inventory', 'products', filter],
        queryFn: () => inventoryApi.getProducts(filter),
    });

    const products: Product[] = productsData?.data || [];

    return (
        <div>
            <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1 className="page-title">Inventory (Products)</h1>
                    <p className="page-subtitle">{products.length} SKUs in catalog</p>
                </div>
                <div className="flex gap-12">
                    <select
                        className="input-field"
                        style={{ width: '180px' }}
                        value={filter.lowStock}
                        onChange={(e) => setFilter({ lowStock: e.target.value })}
                    >
                        <option value="">All Inventory</option>
                        <option value="true">{'\u26A0\uFE0F'} Low Stock Alerts</option>
                    </select>
                    <button className="btn btn-primary">Add Product</button>
                </div>
            </header>

            <div className="table-container">
                {loading ? (
                    <div className="shimmer" style={{ height: '300px' }}></div>
                ) : (
                    <table className="table">
                        <thead>
                            <tr>
                                <th>SKU / Name</th>
                                <th>Supplier</th>
                                <th>Cost / Retail</th>
                                <th>Stock Qty</th>
                                <th>Status</th>
                                <th style={{ textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {products.length === 0 ? (
                                <tr>
                                    <td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                                        No products found
                                    </td>
                                </tr>
                            ) : (
                                products.map((p) => {
                                    const isLowStock = p.stockQuantity <= p.safetyStock;
                                    return (
                                        <tr key={p.id}>
                                            <td>
                                                <div style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>{p.sku}</div>
                                                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{p.name}</div>
                                            </td>
                                            <td className="text-muted">{p.supplier?.name || '--'}</td>
                                            <td>
                                                <div style={{ fontSize: '13px' }}>
                                                    <span className="text-muted">Cost: </span>${p.costPrice}
                                                </div>
                                                <div style={{ fontSize: '13px' }}>
                                                    <span className="text-muted">Retail: </span>
                                                    <span style={{ color: 'var(--accent)', fontWeight: 600 }}>${p.retailPrice}</span>
                                                </div>
                                            </td>
                                            <td>
                                                <span style={{ fontWeight: 700, color: isLowStock ? 'var(--danger)' : 'var(--text-primary)' }}>
                                                    {p.stockQuantity}
                                                </span>
                                                <span className="text-muted" style={{ fontSize: '11px', marginLeft: '4px' }}>/ {p.safetyStock} limit</span>
                                            </td>
                                            <td>
                                                {isLowStock ? (
                                                    <span className="badge badge-danger">Low Stock</span>
                                                ) : (
                                                    <span className="badge badge-success">Healthy</span>
                                                )}
                                            </td>
                                            <td style={{ textAlign: 'right' }}>
                                                <button className="btn btn-ghost btn-sm">Edit</button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
