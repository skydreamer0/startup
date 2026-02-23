import { useEffect, useState } from 'react';
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
    const [roles, setRoles] = useState<Role[]>([]);
    const [allPermissions, setAllPermissions] = useState<Permission[]>([]);
    const [selectedRole, setSelectedRole] = useState<Role | null>(null);

    useEffect(() => { loadData(); }, []);

    async function loadData() {
        const [rolesRes, permsRes] = await Promise.all([
            api.get('/roles'),
            api.get('/roles/permissions'),
        ]);
        setRoles(rolesRes.data.data);
        setAllPermissions(permsRes.data.data);
    }

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
        loadData();
    }

    // Group permissions by resource
    const groupedPerms: Record<string, Permission[]> = {};
    allPermissions.forEach((p) => {
        if (!groupedPerms[p.resource]) groupedPerms[p.resource] = [];
        groupedPerms[p.resource].push(p);
    });

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Roles & Permissions</h1>
                    <p className="page-subtitle">{roles.length} roles, {allPermissions.length} permissions</p>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 24 }}>
                {/* Role List */}
                <div className="glass-card" style={{ padding: 16 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12, padding: '0 8px' }}>
                        Roles
                    </h3>
                    {roles.map((role) => (
                        <div
                            key={role.id}
                            onClick={() => setSelectedRole(role)}
                            style={{
                                padding: '14px 16px',
                                borderRadius: 'var(--radius-sm)',
                                cursor: 'pointer',
                                marginBottom: 4,
                                background: selectedRole?.id === role.id ? 'rgba(102, 126, 234, 0.12)' : 'transparent',
                                transition: 'background 0.15s',
                            }}
                        >
                            <div style={{ fontWeight: 500, fontSize: 14 }}>{role.name}</div>
                            <div className="text-muted text-sm" style={{ marginTop: 2 }}>
                                {role.permissions.length} permissions
                                {role.isSystem && <span style={{ marginLeft: 8, color: 'var(--accent-orange)', fontSize: 11 }}>SYSTEM</span>}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Permission Matrix */}
                <div className="glass-card" style={{ padding: 24 }}>
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
