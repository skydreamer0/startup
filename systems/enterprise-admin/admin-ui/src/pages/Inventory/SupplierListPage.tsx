import { useQuery } from '@tanstack/react-query';
import { inventoryApi, Supplier } from '../../api/inventory';

export default function SupplierListPage() {
    const { data: suppliersData, isLoading: loading } = useQuery({
        queryKey: ['inventory', 'suppliers'],
        queryFn: () => inventoryApi.getSuppliers(),
    });

    const suppliers: Supplier[] = suppliersData?.data || [];

    return (
        <div>
            <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1 className="page-title">Suppliers Management</h1>
                    <p className="page-subtitle">{suppliers.length} active suppliers</p>
                </div>
                <button className="btn btn-primary">Add Supplier</button>
            </header>

            <div className="table-container">
                {loading ? (
                    <div className="shimmer" style={{ height: '300px' }}></div>
                ) : (
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Company Name</th>
                                <th>Contact Person</th>
                                <th>Phone / Email</th>
                                <th>Delivery Reliability (%)</th>
                                <th>Defect Rate (%)</th>
                                <th style={{ textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {suppliers.length === 0 ? (
                                <tr>
                                    <td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                                        No suppliers found
                                    </td>
                                </tr>
                            ) : (
                                suppliers.map((s) => (
                                    <tr key={s.id}>
                                        <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{s.name}</td>
                                        <td className="text-muted">{s.contactName || '--'}</td>
                                        <td>
                                            <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{s.phone || '--'}</div>
                                            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{s.email || '--'}</div>
                                        </td>
                                        <td>
                                            {s.deliveryReliability !== undefined ? (
                                                <span className={`badge ${s.deliveryReliability < 90 ? 'badge-danger' : 'badge-success'}`}>
                                                    {s.deliveryReliability}%
                                                </span>
                                            ) : <span className="text-muted">--</span>}
                                        </td>
                                        <td>
                                            {s.defectRate !== undefined ? (
                                                <span className={`badge ${s.defectRate > 2 ? 'badge-danger' : 'badge-success'}`}>
                                                    {s.defectRate}%
                                                </span>
                                            ) : <span className="text-muted">--</span>}
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            <button className="btn btn-ghost btn-sm">Edit</button>
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
