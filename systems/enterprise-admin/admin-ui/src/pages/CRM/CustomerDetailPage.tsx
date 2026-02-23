import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { crmApi, Customer } from '../../api/crm';

export default function CustomerDetailPage() {
    const { id } = useParams<{ id: string }>();
    const [customer, setCustomer] = useState<Customer | null>(null);
    const [loading, setLoading] = useState(true);
    const [newInteraction, setNewInteraction] = useState({ type: 'STORE_VISIT', content: '' });
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (id) fetchCustomer(id);
    }, [id]);

    const fetchCustomer = async (customerId: string) => {
        try {
            setLoading(true);
            const data = await crmApi.getCustomerById(customerId);
            setCustomer(data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleAddInteraction = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!id || !newInteraction.content) return;

        try {
            setSubmitting(true);
            await crmApi.addInteraction(id, newInteraction);
            setNewInteraction({ ...newInteraction, content: '' });
            fetchCustomer(id); // refresh timeline
        } catch (err) {
            console.error(err);
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) return <div className="p-8 text-center text-gray-500">Loading customer profile...</div>;
    if (!customer) return <div className="p-8 text-center text-red-500">Customer not found.</div>;

    return (
        <div className="page-container fade-in">
            <div className="flex items-center gap-4 mb-6">
                <Link to="/crm" className="text-gray-500 hover:text-gray-800 transition-colors">
                    ← Back to List
                </Link>
                <h1 className="text-2xl font-bold text-gray-800">
                    Customer Profile
                </h1>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Col: Info */}
                <div className="card lg:col-span-1 space-y-6">
                    <div className="border-b border-gray-100 pb-4">
                        <h2 className="text-xl font-semibold mb-1">{customer.name || 'Unknown User'}</h2>
                        <p className="text-sm text-gray-500">{customer.phone || 'No phone'}</p>
                    </div>

                    <div>
                        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">Metrics</h3>
                        <div className="space-y-3 font-medium">
                            <div className="flex justify-between">
                                <span className="text-gray-600">Total Spent</span>
                                <span className="text-indigo-600">${customer.totalSpent}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-600">Purchases</span>
                                <span className="text-gray-900">{customer.purchaseCount}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-600">LINE UID</span>
                                {customer.lineUid ? (
                                    <span className="text-green-600 text-xs bg-green-50 px-2 py-0.5 rounded">Linked</span>
                                ) : (
                                    <span className="text-gray-400">N/A</span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Col: Timeline & Input */}
                <div className="lg:col-span-2 space-y-6">

                    <div className="card">
                        <h3 className="text-lg font-semibold mb-4 text-gray-800">Add Interaction / Note</h3>
                        <form onSubmit={handleAddInteraction} className="flex flex-col gap-3">
                            <div className="flex gap-3">
                                <select
                                    className="input-field max-w-[150px]"
                                    value={newInteraction.type}
                                    onChange={e => setNewInteraction({ ...newInteraction, type: e.target.value })}
                                >
                                    <option value="STORE_VISIT">Store Visit</option>
                                    <option value="PHONE_CALL">Phone Call</option>
                                    <option value="LINE_MESSAGE">LINE Message</option>
                                </select>
                                <input
                                    type="text"
                                    className="input-field flex-1"
                                    placeholder="Record what the customer asked about..."
                                    value={newInteraction.content}
                                    onChange={e => setNewInteraction({ ...newInteraction, content: e.target.value })}
                                    required
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={submitting || !newInteraction.content}
                                className="btn-primary self-end"
                            >
                                {submitting ? 'Adding...' : 'Add Note'}
                            </button>
                        </form>
                    </div>

                    <div className="card">
                        <h3 className="text-lg font-semibold mb-6 text-gray-800">Timeline</h3>
                        <div className="space-y-6 relative before:absolute before:inset-0 before:ml-2 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-gray-200 before:to-transparent">
                            {/* @ts-ignore */}
                            {customer.interactions?.length === 0 ? (
                                <div className="text-gray-500 text-center py-4 relative z-10">No interactions yet.</div>
                            ) : (
                                /* @ts-ignore */
                                customer.interactions?.map((int) => (
                                    <div key={int.id} className="relative z-10 p-4 border border-gray-100 rounded-lg bg-white shadow-sm ml-6 md:ml-0 md:w-[calc(50%-1.5rem)] md:even:ml-auto">
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="text-xs font-semibold px-2 py-1 bg-indigo-50 text-indigo-700 rounded-full">{int.type.replace('_', ' ')}</span>
                                            <span className="text-xs text-gray-400">{new Date(int.interactedAt).toLocaleString()}</span>
                                        </div>
                                        <p className="text-gray-700 text-sm whitespace-pre-wrap">{int.content}</p>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
