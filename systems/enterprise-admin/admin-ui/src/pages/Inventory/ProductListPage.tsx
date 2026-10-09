import { useEffect, useState } from 'react';
import { isAxiosError } from 'axios';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { inventoryApi, Product, Supplier } from '../../api/inventory';
import { excelApi } from '../../api/excel';
import PlanGate from '../../components/PlanGate';
import ImportProductsModal from '../../components/ImportProductsModal';
import './ProductListPage.css';

type ProductForm = {
    sku: string;
    name: string;
    description: string;
    supplierId: string;
    costPrice: string;
    retailPrice: string;
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
    safetyStock: '10',
};

export default function ProductListPage() {
    const [filter, setFilter] = useState({ lowStock: '' });
    const [page, setPage] = useState(1);
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

    const { data: productsData, isPending: productsPending, isFetching: productsFetching,
        isSuccess: productsLoaded, isError: productsFailed,
        error: productsError, refetch: retryProducts } = useQuery({
        queryKey: ['inventory', 'products', { page, lowStock: filter.lowStock }],
        queryFn: () => inventoryApi.getProducts({ ...filter, page: String(page) }),
        retry: false,
        staleTime: 0,
        placeholderData: () => undefined,
    });

    const {
        data: suppliersData, isPending: suppliersLoading, isFetching: suppliersFetching,
        isError: suppliersFailed, isSuccess: suppliersLoaded, error: suppliersError, refetch: retrySuppliers,
    } = useQuery({
        queryKey: ['inventory', 'suppliers'],
        queryFn: () => inventoryApi.getSuppliers(),
        retry: false,
    });

    const loadedProducts = productsLoaded && !productsFetching ? productsData : undefined;
    const totalPages = loadedProducts ? Math.max(1, Math.ceil(loadedProducts.total / loadedProducts.limit)) : 1;
    const recoveringPage = Boolean(loadedProducts && page > totalPages);
    const confirmedProducts = recoveringPage ? undefined : loadedProducts;
    const loading = productsPending || productsFetching || recoveringPage;
    const products: Product[] = confirmedProducts?.data ?? [];
    useEffect(() => {
        if (loadedProducts && page > totalPages) setPage(totalPages);
    }, [loadedProducts, page, totalPages]);
    const productStatus = isAxiosError(productsError) ? productsError.response?.status : undefined;
    const productErrorMessage = productStatus === 403
        ? 'You do not have permission to view products (403).'
        : productStatus
            ? `Unable to load products (HTTP ${productStatus}).`
            : 'Unable to load products. Check your connection and retry.';
    const suppliers: Supplier[] = suppliersData ?? [];
    const supplierStatus = isAxiosError(suppliersError) ? suppliersError.response?.status : undefined;
    const supplierErrorMessage = supplierStatus === 403
        ? 'You do not have permission to view suppliers (403).'
        : supplierStatus
            ? `Unable to load suppliers (HTTP ${supplierStatus}).`
            : 'Unable to load suppliers. Check your connection and retry.';
    const selectedSupplierMissing = productForm.supplierId
        && !suppliers.some((supplier) => supplier.id === productForm.supplierId);
    const retainedSupplierName = editProduct?.supplier?.id === productForm.supplierId
        ? `${editProduct.supplier.name} (current selection)` : 'Current supplier (name unavailable)';

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
        <div className="inventory-product-page">
            <header className="page-header product-header">
                <div className="product-heading">
                    <h1 className="page-title">Inventory (Products)</h1>
                    <p className="page-subtitle">{loading ? 'Loading catalog...' : productsFailed ? 'Catalog unavailable' : confirmedProducts ? `${confirmedProducts.total} SKUs in catalog` : 'Loading catalog...'}</p>
                </div>
                <div className="product-toolbar">
                    <select
                        aria-label="Inventory filter"
                        className="input-field product-filter"
                        value={filter.lowStock}
                        onChange={(e) => { setFilter({ lowStock: e.target.value }); setPage(1); }}
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

            <div className="table-container product-table-scroll" role="region" aria-label="Products table" tabIndex={0}>
                {loading ? (
                    <div role="status" className="shimmer" style={{ height: '300px' }}>Loading products...</div>
                ) : productsFailed ? (
                    <div role="alert">
                        <p>{productErrorMessage}</p>
                        <button type="button" className="btn btn-ghost" onClick={() => { void retryProducts(); }}>Retry products</button>
                    </div>
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

            <nav aria-label="Product pagination" className="product-pagination">
                <button type="button" className="btn btn-ghost" disabled={page === 1}
                    onClick={() => setPage((current) => current - 1)}>Previous page</button>
                <span aria-live="polite">{loading ? `Page ${page} (loading)` : productsFailed ? `Page ${page} (unavailable)` : `Page ${page} of ${totalPages}`}</span>
                <button type="button" className="btn btn-ghost" disabled={loading || productsFailed || page >= totalPages}
                    onClick={() => setPage((current) => current + 1)}>Next page</button>
            </nav>

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
                                    <label className="input-label" htmlFor="product-supplier">Supplier</label>
                                    <select id="product-supplier" className="input-field" value={productForm.supplierId}
                                        disabled={suppliersLoading || suppliersFailed}
                                        onChange={(e) => setProductForm({ ...productForm, supplierId: e.target.value })}>
                                        <option value="">No supplier</option>
                                        {selectedSupplierMissing && (
                                            <option value={productForm.supplierId}>{retainedSupplierName}</option>
                                        )}
                                        {suppliers.map((supplier) => (
                                            <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                                        ))}
                                    </select>
                                    {suppliersFetching && <p role="status">Loading suppliers...</p>}
                                    {suppliersFailed && (
                                        <div role="alert">
                                            <p>{supplierErrorMessage}</p>
                                            <button type="button" className="btn btn-ghost" disabled={suppliersFetching}
                                                onClick={() => { void retrySuppliers(); }}>Retry suppliers</button>
                                        </div>
                                    )}
                                    {suppliersLoaded && suppliers.length === 0 && <p role="status">No suppliers found</p>}
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
                                    <output>{editProduct?.stockQuantity ?? 0}</output>
                                    <p>庫存由批次進貨與出庫更新；新商品請另行登記批次進貨。</p>
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
