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
        <div className="page-container fade-in">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-teal-400 to-emerald-500">
                    Inventory (Products)
                </h1>
                <div className="flex gap-4">
                    <select
                        className="input-field"
                        value={filter.lowStock}
                        onChange={(e) => setFilter({ lowStock: e.target.value })}
                    >
                        <option value="">All Inventory</option>
                        <option value="true">⚠️ Low Stock Alerts</option>
                    </select>
                    <button className="btn-primary">Add Product</button>
                </div>
            </div>

            <div className="card overflow-hidden">
                {loading ? (
                    <div className="p-8 text-center text-gray-500">Loading inventory...</div>
                ) : (
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-gray-100 bg-gray-50/50">
                                <th className="p-4 font-medium text-gray-600">SKU / Name</th>
                                <th className="p-4 font-medium text-gray-600">Supplier</th>
                                <th className="p-4 font-medium text-gray-600">Cost / Retail</th>
                                <th className="p-4 font-medium text-gray-600">Stock Qty</th>
                                <th className="p-4 font-medium text-gray-600">Status</th>
                                <th className="p-4 font-medium text-gray-600 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {products.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="p-8 text-center text-gray-500">No products found</td>
                                </tr>
                            ) : (
                                products.map((p) => {
                                    const isLowStock = p.stockQuantity <= p.safetyStock;
                                    return (
                                        <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                                            <td className="p-4">
                                                <div className="font-mono text-xs text-gray-400 mb-0.5">{p.sku}</div>
                                                <div className="font-semibold text-gray-800">{p.name}</div>
                                            </td>
                                            <td className="p-4 text-sm text-gray-600">
                                                {p.supplier?.name || '--'}
                                            </td>
                                            <td className="p-4">
                                                <div className="text-sm">
                                                    <span className="text-gray-500">Cost: </span>${p.costPrice}
                                                </div>
                                                <div className="text-sm">
                                                    <span className="text-gray-500">Retail: </span><span className="text-indigo-600 font-medium">${p.retailPrice}</span>
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                <span className={`font-semibold ${isLowStock ? 'text-red-600' : 'text-gray-900'}`}>
                                                    {p.stockQuantity}
                                                </span>
                                                <span className="text-xs text-gray-400 ml-1">/ {p.safetyStock} limit</span>
                                            </td>
                                            <td className="p-4">
                                                {isLowStock ? (
                                                    <span className="inline-flex items-center px-2 py-1 bg-red-100 text-red-700 text-xs rounded-full">
                                                        Low Stock
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
                                                        Healthy
                                                    </span>
                                                )}
                                            </td>
                                            <td className="p-4 text-right">
                                                <button className="text-indigo-600 hover:text-indigo-800 text-sm font-medium">Edit</button>
                                            </td>
                                        </tr>
                                    )
                                })
                            )}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
