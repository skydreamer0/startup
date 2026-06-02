import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';

interface Permission { id: string; action: string; resource: string; }
interface Role {
    id: string;
    name: string;
    description: string | null;
    isSystem: boolean;
    permissions: Permission[];
}

export default function RolesPage() {
    const [selectedRole, setSelectedRole] = useState<Role | null>(null);
    const queryClient = useQueryClient();

    const { data: rolesData } = useQuery({
        queryKey: ['roles'],
        queryFn: async () => {
            const [rolesRes, permsRes] = await Promise.all([
                api.get('/roles'),
                api.get('/roles/permissions'),
            ]);
            return { roles: rolesRes.data.data as Role[], permissions: permsRes.data.data as Permission[] };
        },
    });

    const roles = rolesData?.roles || [];
    const allPermissions = rolesData?.permissions || [];

    function isAssigned(role: Role, perm: Permission) {
        return role.permissions.some((p) => p.action === perm.action && p.resource === perm.resource);
    }

    async function togglePermission(role: Role, perm: Permission) {
        if (role.isSystem) return; // Can't edit system roles

        const currentIds = role.permissions.map((p) => p.id);
        const permMatch = allPermissions.find((p) => p.action === perm.action && p.resource === perm.resource);
        if (!permMatch) return;

        let newIds: string[];
        if (currentIds.includes(permMatch.id)) {
            newIds = currentIds.filter((id) => id !== permMatch.id);
        } else {
            newIds = [...currentIds, permMatch.id];
        }

        await api.put(`/roles/${role.id}/permissions`, { permissionIds: newIds });
        queryClient.invalidateQueries({ queryKey: ['roles'] });
    }

    // Group permissions by resource
    const groupedPerms: Record<string, Permission[]> = {};
    allPermissions.forEach((p) => {
        if (!groupedPerms[p.resource]) groupedPerms[p.resource] = [];
        groupedPerms[p.resource].push(p);
    });

    return (
        <div className="admin-page roles-page">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Roles & Permissions</h1>
                    <p className="page-subtitle">{roles.length} roles, {allPermissions.length} permissions</p>
                </div>
            </div>

            <div className="admin-surface-grid">
                {/* Role List */}
                <div className="card role-list-card">
                    <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12, padding: '0 8px' }}>
                        Roles
                    </h3>
                    {roles.map((role) => (
                        <div
                            key={role.id}
                            onClick={() => setSelectedRole(role)}
                            className={`role-list-item ${selectedRole?.id === role.id ? 'active' : ''}`}
                        >
                            <div style={{ fontWeight: 500, fontSize: 14 }}>{role.name}</div>
                            <div className="text-muted text-sm" style={{ marginTop: 2 }}>
                                {role.permissions.length} permissions
                                {role.isSystem && <span className="role-system-label">SYSTEM</span>}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Permission Matrix */}
                <div className="card" style={{ padding: 24 }}>
                    {selectedRole ? (
                        <>
                            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>{selectedRole.name}</h3>
                            <p className="text-muted text-sm" style={{ marginBottom: 20 }}>
                                {selectedRole.description || 'No description'}
                                {selectedRole.isSystem && ' — System role (read-only)'}
                            </p>

                            {Object.entries(groupedPerms).map(([resource, perms]) => (
                                <div key={resource} style={{ marginBottom: 20 }}>
                                    <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                                        {resource}
                                    </h4>
                                    <div className="permissions-grid">
                                        {perms.map((perm) => (
                                            <div
                                                key={perm.id}
                                                className={`permission-chip ${isAssigned(selectedRole, perm) ? 'assigned' : ''}`}
                                                onClick={() => togglePermission(selectedRole, perm)}
                                                style={{ cursor: selectedRole.isSystem ? 'default' : 'pointer' }}
                                            >
                                                {perm.action}:{perm.resource}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </>
                    ) : (
                        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
                            Select a role from the list to view its permissions
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
