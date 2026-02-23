import { useEffect, useState } from 'react';
import { inventoryApi, Supplier } from '../../api/inventory';

export default function SupplierListPage() {
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchSuppliers();
    }, []);

    const fetchSuppliers = async () => {
        try {
            setLoading(true);
            const res = await inventoryApi.getSuppliers();
            setSuppliers(res.data || []);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="page-container fade-in">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-500">
                    Suppliers Management
                </h1>
                <button className="btn-primary">Add Supplier</button>
            </div>

            <div className="card overflow-hidden">
                {loading ? (
                    <div className="p-8 text-center text-gray-500">Loading suppliers...</div>
                ) : (
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-gray-100 bg-gray-50/50">
                                <th className="p-4 font-medium text-gray-600">Company Name</th>
                                <th className="p-4 font-medium text-gray-600">Contact Person</th>
                                <th className="p-4 font-medium text-gray-600">Phone / Email</th>
                                <th className="p-4 font-medium text-gray-600">Delivery Reliability (%)</th>
                                <th className="p-4 font-medium text-gray-600">Defect Rate (%)</th>
                                <th className="p-4 font-medium text-gray-600 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {suppliers.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="p-8 text-center text-gray-500">No suppliers found</td>
                                </tr>
                            ) : (
                                suppliers.map((s) => (
                                    <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                                        <td className="p-4 font-semibold text-gray-800">{s.name}</td>
                                        <td className="p-4 text-gray-600">{s.contactName || '--'}</td>
                                        <td className="p-4">
                                            <div className="text-sm text-gray-800">{s.phone || '--'}</div>
                                            <div className="text-sm text-gray-500">{s.email || '--'}</div>
                                        </td>
                                        <td className="p-4">
                                            {s.deliveryReliability !== undefined ? (
                                                <span className={`font-medium ${s.deliveryReliability < 90 ? 'text-red-500' : 'text-green-600'}`}>
                                                    {s.deliveryReliability}%
                                                </span>
                                            ) : '--'}
                                        </td>
                                        <td className="p-4">
                                            {s.defectRate !== undefined ? (
                                                <span className={`font-medium ${s.defectRate > 2 ? 'text-red-500' : 'text-green-600'}`}>
                                                    {s.defectRate}%
                                                </span>
                                            ) : '--'}
                                        </td>
                                        <td className="p-4 text-right">
                                            <button className="text-indigo-600 hover:text-indigo-800 text-sm font-medium">Edit</button>
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
