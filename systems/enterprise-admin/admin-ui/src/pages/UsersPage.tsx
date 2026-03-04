import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';

interface Role { id: string; name: string; }
interface User {
    id: string;
    email: string;
    fullName: string;
    status: string;
    lastLoginAt: string | null;
    createdAt: string;
    roles: Role[];
}

export default function UsersPage() {
    const [search, setSearch] = useState('');
    const queryClient = useQueryClient();

    // Create modal
    const [showCreate, setShowCreate] = useState(false);
    const [createForm, setCreateForm] = useState({ email: '', password: '', fullName: '' });

    // Edit modal
    const [editUser, setEditUser] = useState<User | null>(null);
    const [editForm, setEditForm] = useState({ fullName: '', status: '', roleIds: [] as string[] });

    const [saving, setSaving] = useState(false);

    const { data: usersData } = useQuery({
        queryKey: ['users', search],
        queryFn: async () => {
            const params: Record<string, string> = {};
            if (search) params.search = search;
            const res = await api.get('/users', { params });
            return { users: res.data.data as User[], total: res.data.meta?.total || 0 };
        },
    });

    const { data: rolesData } = useQuery({
        queryKey: ['allRoles'],
        queryFn: async () => {
            const res = await api.get('/roles');
            return res.data.data.map((r: any) => ({ id: r.id, name: r.name })) as Role[];
        },
    });

    const users = usersData?.users || [];
    const total = usersData?.total || 0;
    const allRoles = rolesData || [];

    async function createUser(e: React.FormEvent) {
        e.preventDefault();
        setSaving(true);
        try {
            await api.post('/users', createForm);
            setShowCreate(false);
            setCreateForm({ email: '', password: '', fullName: '' });
            queryClient.invalidateQueries({ queryKey: ['users'] });
        } catch (err: any) {
            alert(err.response?.data?.error?.message || 'Failed to create user');
        } finally {
            setSaving(false);
        }
    }

    function openEdit(user: User) {
        setEditUser(user);
        setEditForm({
            fullName: user.fullName,
            status: user.status,
            roleIds: user.roles.map((r) => r.id),
        });
    }

    async function saveEdit(e: React.FormEvent) {
        e.preventDefault();
        if (!editUser) return;
        setSaving(true);
        try {
            await api.put(`/users/${editUser.id}`, {
                fullName: editForm.fullName,
                status: editForm.status,
                roleIds: editForm.roleIds,
            });
            setEditUser(null);
            queryClient.invalidateQueries({ queryKey: ['users'] });
        } catch (err: any) {
            alert(err.response?.data?.error?.message || 'Failed to update user');
        } finally {
            setSaving(false);
        }
    }

    async function deleteUser(id: string, email: string) {
        if (!confirm(`Are you sure you want to deactivate ${email}?`)) return;
        try {
            await api.delete(`/users/${id}`);
            queryClient.invalidateQueries({ queryKey: ['users'] });
        } catch (err: any) {
            alert(err.response?.data?.error?.message || 'Failed');
        }
    }

    function toggleRole(roleId: string) {
        setEditForm((prev) => ({
            ...prev,
            roleIds: prev.roleIds.includes(roleId)
                ? prev.roleIds.filter((id) => id !== roleId)
                : [...prev.roleIds, roleId],
        }));
    }

    function statusBadge(status: string) {
        const map: Record<string, string> = {
            active: 'badge-active',
            suspended: 'badge-suspended',
            pending_verification: 'badge-pending',
        };
        return <span className={`badge ${map[status] || ''}`}>{status}</span>;
    }

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Users</h1>
                    <p className="page-subtitle">{total} users total</p>
                </div>
                <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ New User</button>
            </div>

            <div style={{ marginBottom: 20 }}>
                <input
                    className="input-field search-bar"
                    placeholder="Search by name or email..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
            </div>

            <div className="card" style={{ overflow: 'hidden' }}>
                <table className="table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Email</th>
                            <th>Role</th>
                            <th>Status</th>
                            <th>Last Login</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map((u) => (
                            <tr key={u.id}>
                                <td style={{ fontWeight: 500 }}>{u.fullName}</td>
                                <td className="text-muted">{u.email}</td>
                                <td>
                                    <div className="flex gap-8">
                                        {u.roles?.map((r) => (
                                            <span key={r.id} className="badge badge-role">{r.name}</span>
                                        ))}
                                        {(!u.roles || u.roles.length === 0) && <span className="text-muted text-sm">No role</span>}
                                    </div>
                                </td>
                                <td>{statusBadge(u.status)}</td>
                                <td className="text-muted text-sm">
                                    {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : '—'}
                                </td>
                                <td>
                                    <div className="flex gap-8">
                                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(u)}>Edit</button>
                                        <button className="btn btn-danger btn-sm" onClick={() => deleteUser(u.id, u.email)}>Delete</button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {users.length === 0 && (
                            <tr><td colSpan={6}>
                                <div className="empty-state">
                                    <div className="empty-state-icon">👥</div>
                                    <div className="empty-state-title">No Users Found</div>
                                    <div className="empty-state-text">
                                        {search ? 'No users match your search criteria. Try a different keyword.' : 'No users have been created yet. Click "+ New User" to get started.'}
                                    </div>
                                </div>
                            </td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Create User Modal */}
            {showCreate && (
                <div className="modal-overlay" onClick={() => setShowCreate(false)}>
                    <div className="modal-content card" onClick={(e) => e.stopPropagation()}>
                        <h2 className="modal-title">Create New User</h2>
                        <form onSubmit={createUser}>
                            <div className="login-form">
                                <div className="input-group">
                                    <label className="input-label">Full Name</label>
                                    <input className="input-field" required value={createForm.fullName}
                                        onChange={(e) => setCreateForm({ ...createForm, fullName: e.target.value })} />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">Email</label>
                                    <input className="input-field" type="email" required value={createForm.email}
                                        onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">Password</label>
                                    <input className="input-field" type="password" required minLength={8} value={createForm.password}
                                        onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} />
                                </div>
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={saving}>
                                    {saving ? 'Creating...' : 'Create User'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Edit User Modal */}
            {editUser && (
                <div className="modal-overlay" onClick={() => setEditUser(null)}>
                    <div className="modal-content card" onClick={(e) => e.stopPropagation()}>
                        <h2 className="modal-title">Edit User</h2>
                        <p className="text-muted text-sm" style={{ marginTop: -16, marginBottom: 20 }}>{editUser.email}</p>
                        <form onSubmit={saveEdit}>
                            <div className="login-form">
                                <div className="input-group">
                                    <label className="input-label">Full Name</label>
                                    <input className="input-field" required value={editForm.fullName}
                                        onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })} />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">Status</label>
                                    <select className="input-field" value={editForm.status}
                                        onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}>
                                        <option value="active">Active</option>
                                        <option value="suspended">Suspended</option>
                                        <option value="pending_verification">Pending Verification</option>
                                    </select>
                                </div>
                                <div className="input-group">
                                    <label className="input-label">Roles</label>
                                    <div className="permissions-grid">
                                        {allRoles.map((role) => (
                                            <div
                                                key={role.id}
                                                className={`permission-chip ${editForm.roleIds.includes(role.id) ? 'assigned' : ''}`}
                                                onClick={() => toggleRole(role.id)}
                                                style={{ cursor: 'pointer', fontSize: 13 }}
                                            >
                                                {role.name}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-ghost" onClick={() => setEditUser(null)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={saving}>
                                    {saving ? 'Saving...' : 'Save Changes'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
