import { useEffect, useState } from 'react';
import { crmApi, Customer } from '../../api/crm';
import { Link } from 'react-router-dom';

export default function CustomerListPage() {
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState({ type: '', hasLine: '' });

    useEffect(() => {
        fetchCustomers();
    }, [filter]);

    const fetchCustomers = async () => {
        try {
            setLoading(true);
            const res = await crmApi.getCustomers(filter);
            setCustomers(res.data || []);
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
                    Customers (CRM)
                </h1>
                <div className="flex gap-4">
                    <select
                        className="input-field"
                        value={filter.type}
                        onChange={(e) => setFilter({ ...filter, type: e.target.value })}
                    >
                        <option value="">All Types</option>
                        <option value="new">First Time (New)</option>
                        <option value="repeat">Repeat (Loyal)</option>
                    </select>
                    <select
                        className="input-field"
                        value={filter.hasLine}
                        onChange={(e) => setFilter({ ...filter, hasLine: e.target.value })}
                    >
                        <option value="">Has LINE Auth</option>
                        <option value="true">Yes</option>
                        <option value="false">No</option>
                    </select>
                </div>
            </div>

            <div className="card overflow-hidden">
                {loading ? (
                    <div className="p-8 text-center text-gray-500">Loading customers...</div>
                ) : (
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-gray-100 bg-gray-50/50">
                                <th className="p-4 font-medium text-gray-600">Name / Phone</th>
                                <th className="p-4 font-medium text-gray-600">LINE UID</th>
                                <th className="p-4 font-medium text-gray-600">Total Spent</th>
                                <th className="p-4 font-medium text-gray-600">Purchases</th>
                                <th className="p-4 font-medium text-gray-600">Last Interaction</th>
                                <th className="p-4 font-medium text-gray-600 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {customers.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="p-8 text-center text-gray-500">No customers found</td>
                                </tr>
                            ) : (
                                customers.map((c) => (
                                    <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                                        <td className="p-4">
                                            <div className="font-semibold text-gray-800">{c.name || 'Unknown'}</div>
                                            <div className="text-sm text-gray-500">{c.phone || 'No phone'}</div>
                                        </td>
                                        <td className="p-4">
                                            {c.lineUid ? (
                                                <span className="inline-flex items-center px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
                                                    Connected
                                                </span>
                                            ) : (
                                                <span className="text-gray-400 text-sm">--</span>
                                            )}
                                        </td>
                                        <td className="p-4 font-medium text-indigo-600">${c.totalSpent}</td>
                                        <td className="p-4">{c.purchaseCount}</td>
                                        <td className="p-4 text-sm text-gray-500">
                                            {c.lastInteractionDate ? new Date(c.lastInteractionDate).toLocaleDateString() : 'Never'}
                                        </td>
                                        <td className="p-4 text-right">
                                            <Link
                                                to={`/crm/${c.id}`}
                                                className="btn-primary text-sm px-3 py-1.5 inline-block"
                                            >
                                                View Timeline
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
