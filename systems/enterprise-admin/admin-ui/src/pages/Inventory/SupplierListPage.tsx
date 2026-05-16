import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { inventoryApi, Supplier } from '../../api/inventory';

type SupplierForm = {
    name: string;
    contactName: string;
    email: string;
    phone: string;
    address: string;
    deliveryReliability: string;
    defectRate: string;
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

const emptySupplierForm: SupplierForm = {
    name: '',
    contactName: '',
    email: '',
    phone: '',
    address: '',
    deliveryReliability: '',
    defectRate: '',
};

export default function SupplierListPage() {
    const [showCreate, setShowCreate] = useState(false);
    const [editSupplier, setEditSupplier] = useState<Supplier | null>(null);
    const [supplierForm, setSupplierForm] = useState<SupplierForm>(emptySupplierForm);
    const [saving, setSaving] = useState(false);
    const queryClient = useQueryClient();

    const { data: suppliersData, isLoading: loading } = useQuery({
        queryKey: ['inventory', 'suppliers'],
        queryFn: () => inventoryApi.getSuppliers(),
    });

    const suppliers: Supplier[] = suppliersData?.data || [];

    function openCreate() {
        setEditSupplier(null);
        setSupplierForm(emptySupplierForm);
        setShowCreate(true);
    }

    function openEdit(supplier: Supplier) {
        setShowCreate(false);
        setEditSupplier(supplier);
        setSupplierForm({
            name: supplier.name,
            contactName: supplier.contactName || '',
            email: supplier.email || '',
            phone: supplier.phone || '',
            address: supplier.address || '',
            deliveryReliability: supplier.deliveryReliability === undefined ? '' : String(supplier.deliveryReliability),
            defectRate: supplier.defectRate === undefined ? '' : String(supplier.defectRate),
        });
    }

    function closeModal() {
        setShowCreate(false);
        setEditSupplier(null);
        setSupplierForm(emptySupplierForm);
    }

    async function saveSupplier(e: React.FormEvent) {
        e.preventDefault();
        setSaving(true);
        const payload: Partial<Supplier> = {
            name: supplierForm.name.trim(),
            contactName: supplierForm.contactName.trim() || undefined,
            email: supplierForm.email.trim(),
            phone: supplierForm.phone.trim() || undefined,
            address: supplierForm.address.trim() || undefined,
            deliveryReliability: supplierForm.deliveryReliability === '' ? undefined : Number(supplierForm.deliveryReliability),
            defectRate: supplierForm.defectRate === '' ? undefined : Number(supplierForm.defectRate),
        };

        try {
            if (editSupplier) {
                await inventoryApi.updateSupplier(editSupplier.id, payload);
            } else {
                await inventoryApi.createSupplier(payload);
            }
            closeModal();
            queryClient.invalidateQueries({ queryKey: ['inventory', 'suppliers'] });
        } catch (err) {
            const message = (err as ApiError).response?.data?.error?.message || 'Failed to save supplier';
            alert(message);
        } finally {
            setSaving(false);
        }
    }

    const modalTitle = editSupplier ? 'Edit Supplier' : 'Add Supplier';

    return (
        <div>
            <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1 className="page-title">Suppliers Management</h1>
                    <p className="page-subtitle">{suppliers.length} active suppliers</p>
                </div>
                <button className="btn btn-primary" onClick={openCreate}>Add Supplier</button>
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
                                            <button className="btn btn-ghost btn-sm" onClick={() => openEdit(s)}>Edit</button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                )}
            </div>

            {(showCreate || editSupplier) && (
                <div className="modal-overlay" onClick={closeModal}>
                    <div className="modal-content card" onClick={(e) => e.stopPropagation()}>
                        <h2 className="modal-title">{modalTitle}</h2>
                        <form onSubmit={saveSupplier}>
                            <div className="login-form">
                                <div className="input-group">
                                    <label className="input-label">Company Name</label>
                                    <input className="input-field" required value={supplierForm.name}
                                        onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })} />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">Contact Person</label>
                                    <input className="input-field" value={supplierForm.contactName}
                                        onChange={(e) => setSupplierForm({ ...supplierForm, contactName: e.target.value })} />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">Email</label>
                                    <input className="input-field" type="email" value={supplierForm.email}
                                        onChange={(e) => setSupplierForm({ ...supplierForm, email: e.target.value })} />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">Phone</label>
                                    <input className="input-field" value={supplierForm.phone}
                                        onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })} />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">Address</label>
                                    <input className="input-field" value={supplierForm.address}
                                        onChange={(e) => setSupplierForm({ ...supplierForm, address: e.target.value })} />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">Delivery Reliability (%)</label>
                                    <input className="input-field" type="number" min="0" max="100" step="0.01" value={supplierForm.deliveryReliability}
                                        onChange={(e) => setSupplierForm({ ...supplierForm, deliveryReliability: e.target.value })} />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">Defect Rate (%)</label>
                                    <input className="input-field" type="number" min="0" max="100" step="0.01" value={supplierForm.defectRate}
                                        onChange={(e) => setSupplierForm({ ...supplierForm, defectRate: e.target.value })} />
                                </div>
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-ghost" onClick={closeModal}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={saving}>
                                    {saving ? 'Saving...' : editSupplier ? 'Save Changes' : 'Create Supplier'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
