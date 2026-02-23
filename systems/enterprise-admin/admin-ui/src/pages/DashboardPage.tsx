import { useEffect, useState } from 'react';
import api from '../api/client';

interface Stats {
    totalUsers: number;
    totalRoles: number;
    totalPermissions: number;
    recentLogins: number;
}

export default function DashboardPage() {
    const [stats, setStats] = useState<Stats>({ totalUsers: 0, totalRoles: 0, totalPermissions: 0, recentLogins: 0 });

    useEffect(() => {
        Promise.all([
            api.get('/users'),
            api.get('/roles'),
        ]).then(([usersRes, rolesRes]) => {
            const users = usersRes.data;
            const roles = rolesRes.data;
            const totalPermissions = roles.data.reduce(
                (sum: number, r: any) => sum + (r.permissions?.length || 0), 0,
            );
            setStats({
                totalUsers: users.meta?.total || users.data?.length || 0,
                totalRoles: roles.data?.length || 0,
                totalPermissions,
                recentLogins: users.data?.filter((u: any) => u.lastLoginAt).length || 0,
            });
        });
    }, []);

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Dashboard</h1>
                    <p className="page-subtitle">Overview of your system</p>
                </div>
            </div>

            <div className="stat-grid">
                <div className="stat-card glass-card">
                    <div className="stat-value">{stats.totalUsers}</div>
                    <div className="stat-label">Total Users</div>
                </div>
                <div className="stat-card glass-card">
                    <div className="stat-value">{stats.totalRoles}</div>
                    <div className="stat-label">Roles Defined</div>
                </div>
                <div className="stat-card glass-card">
                    <div className="stat-value">{stats.totalPermissions}</div>
                    <div className="stat-label">Permission Grants</div>
                </div>
                <div className="stat-card glass-card">
                    <div className="stat-value">{stats.recentLogins}</div>
                    <div className="stat-label">Active Sessions</div>
                </div>
            </div>

            <div className="glass-card" style={{ padding: 24 }}>
                <h3 style={{ marginBottom: 16, fontWeight: 600 }}>Quick Start Guide</h3>
                <p className="text-muted text-sm" style={{ lineHeight: 1.8 }}>
                    Welcome to the Admin Panel. Use the sidebar to navigate between sections:<br />
                    • <strong>Users</strong> — Create, edit, and manage user accounts<br />
                    • <strong>Roles & Permissions</strong> — Define roles and assign granular permissions<br />
                </p>
            </div>
        </div>
    );
}
