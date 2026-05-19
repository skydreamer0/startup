import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { inventoryApi, Product, Supplier } from '../../api/inventory';
import { excelApi } from '../../api/excel';
import PlanGate from '../../components/PlanGate';
import ImportProductsModal from '../../components/ImportProductsModal';

type ProductForm = {
    sku: string;
    name: string;
    description: string;
    supplierId: string;
    costPrice: string;
    retailPrice: string;
    stockQuantity: string;
    safetyStock: string;
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

const emptyProductForm: ProductForm = {
    sku: '',
    name: '',
    description: '',
    supplierId: '',
    costPrice: '0',
    retailPrice: '0',
    stockQuantity: '0',
    safetyStock: '10',
};

export default function ProductListPage() {
    const [filter, setFilter] = useState({ lowStock: '' });
    const [showCreate, setShowCreate] = useState(false);
    const [editProduct, setEditProduct] = useState<Product | null>(null);
    const [productForm, setProductForm] = useState<ProductForm>(emptyProductForm);
    const [saving, setSaving] = useState(false);
    const [showImport, setShowImport] = useState(false);
    const queryClient = useQueryClient();

    const exportMutation = useMutation({
        mutationFn: () => excelApi.exportProducts(),
        onError: (err) => alert(err instanceof Error ? err.message : 'Export failed'),
    });

    const exportInventoryMutation = useMutation({
        mutationFn: () => excelApi.exportInventory(),
        onError: (err) => alert(err instanceof Error ? err.message : 'Export failed'),
    });

    const { data: productsData, isLoading: loading } = useQuery({
        queryKey: ['inventory', 'products', filter],
        queryFn: () => inventoryApi.getProducts(filter),
    });

    const { data: suppliersData } = useQuery({
        queryKey: ['inventory', 'suppliers'],
        queryFn: () => inventoryApi.getSuppliers(),
    });

    const products: Product[] = productsData?.data || [];
    const suppliers: Supplier[] = suppliersData?.data || [];

    function openCreate() {
        setEditProduct(null);
        setProductForm(emptyProductForm);
        setShowCreate(true);
    }

    function openEdit(product: Product) {
        setShowCreate(false);
        setEditProduct(product);
        setProductForm({
            sku: product.sku,
            name: product.name,
            description: product.description || '',
            supplierId: product.supplierId || product.supplier?.id || '',
            costPrice: String(product.costPrice),
            retailPrice: String(product.retailPrice),
            stockQuantity: String(product.stockQuantity),
            safetyStock: String(product.safetyStock),
        });
    }

    function closeModal() {
        setShowCreate(false);
        setEditProduct(null);
        setProductForm(emptyProductForm);
    }

    async function saveProduct(e: React.FormEvent) {
        e.preventDefault();
        setSaving(true);
        const payload: Partial<Product> = {
            sku: productForm.sku.trim(),
            name: productForm.name.trim(),
            description: productForm.description.trim() || undefined,
            supplierId: productForm.supplierId || undefined,
            costPrice: Number(productForm.costPrice),
            retailPrice: Number(productForm.retailPrice),
            stockQuantity: Number(productForm.stockQuantity),
            safetyStock: Number(productForm.safetyStock),
        };

        try {
            if (editProduct) {
                await inventoryApi.updateProduct(editProduct.id, payload);
            } else {
                await inventoryApi.createProduct(payload);
            }
            closeModal();
            queryClient.invalidateQueries({ queryKey: ['inventory', 'products'] });
        } catch (err) {
            const message = (err as ApiError).response?.data?.error?.message || 'Failed to save product';
            alert(message);
        } finally {
            setSaving(false);
        }
    }

    const modalTitle = editProduct ? 'Edit Product' : 'Add Product';

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
                    <PlanGate plan="starter" fallback={null}>
                        <button
                            className="btn btn-ghost"
                            onClick={() => exportMutation.mutate()}
                            disabled={exportMutation.isPending}
                        >
                            {exportMutation.isPending ? 'Exporting...' : 'Export Products'}
                        </button>
                        <button
                            className="btn btn-ghost"
                            onClick={() => exportInventoryMutation.mutate()}
                            disabled={exportInventoryMutation.isPending}
                        >
                            {exportInventoryMutation.isPending ? 'Exporting...' : 'Export Inventory'}
                        </button>
                        <button className="btn btn-ghost" onClick={() => setShowImport(true)}>
                            Import Products
                        </button>
                    </PlanGate>
                    <button className="btn btn-primary" onClick={openCreate}>Add Product</button>
                </div>
            </header>
            {showImport && (
                <ImportProductsModal
                    onClose={() => setShowImport(false)}
                    onSuccess={() => {
                        queryClient.invalidateQueries({ queryKey: ['inventory', 'products'] });
                    }}
                />
            )}

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
                                                <button className="btn btn-ghost btn-sm" onClick={() => openEdit(p)}>Edit</button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                )}
            </div>

            {(showCreate || editProduct) && (
                <div className="modal-overlay" onClick={closeModal}>
                    <div className="modal-content card" onClick={(e) => e.stopPropagation()}>
                        <h2 className="modal-title">{modalTitle}</h2>
                        <form onSubmit={saveProduct}>
                            <div className="login-form">
                                <div className="input-group">
                                    <label className="input-label">SKU</label>
                                    <input className="input-field" required value={productForm.sku}
                                        onChange={(e) => setProductForm({ ...productForm, sku: e.target.value })} />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">Name</label>
                                    <input className="input-field" required value={productForm.name}
                                        onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">Description</label>
                                    <input className="input-field" value={productForm.description}
                                        onChange={(e) => setProductForm({ ...productForm, description: e.target.value })} />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">Supplier</label>
                                    <select className="input-field" value={productForm.supplierId}
                                        onChange={(e) => setProductForm({ ...productForm, supplierId: e.target.value })}>
                                        <option value="">No supplier</option>
                                        {suppliers.map((supplier) => (
                                            <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="input-group">
                                    <label className="input-label">Cost Price</label>
                                    <input className="input-field" type="number" min="0" step="0.01" required value={productForm.costPrice}
                                        onChange={(e) => setProductForm({ ...productForm, costPrice: e.target.value })} />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">Retail Price</label>
                                    <input className="input-field" type="number" min="0" step="0.01" required value={productForm.retailPrice}
                                        onChange={(e) => setProductForm({ ...productForm, retailPrice: e.target.value })} />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">Stock Quantity</label>
                                    <input className="input-field" type="number" min="0" step="1" required value={productForm.stockQuantity}
                                        onChange={(e) => setProductForm({ ...productForm, stockQuantity: e.target.value })} />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">Safety Stock</label>
                                    <input className="input-field" type="number" min="0" step="1" required value={productForm.safetyStock}
                                        onChange={(e) => setProductForm({ ...productForm, safetyStock: e.target.value })} />
                                </div>
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-ghost" onClick={closeModal}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={saving}>
                                    {saving ? 'Saving...' : editProduct ? 'Save Changes' : 'Create Product'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
