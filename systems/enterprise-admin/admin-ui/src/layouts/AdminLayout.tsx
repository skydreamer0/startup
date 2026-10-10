import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/authContext';
import { usePlan, planMeets } from '../hooks/usePlan';
import ThemeToggle from '../components/ThemeToggle';
import { PlanUpgradeToast } from '../components/PlanUpgradeToast';
import brandMarkDark from '../assets/brand/flow-capsule-v1/mark-dark.svg?no-inline';

export default function AdminLayout() {
    const { user, logout } = useAuth();
    const { data: planInfo } = usePlan();
    const hasStarter = planMeets(planInfo?.plan, 'starter');
    const hasPro = planMeets(planInfo?.plan, 'pro');
    const navigate = useNavigate();

    function handleLogout() {
        logout();
        navigate('/login');
    }

    return (
        <div className="admin-layout">
            <aside className="sidebar">
                <div className="sidebar-logo">
                    <img src={brandMarkDark} alt="" width={32} height={32} style={{ verticalAlign: 'middle', marginRight: 8 }} />
                    STARTER ADMIN
                </div>

                <nav className="sidebar-nav">
                    <NavLink to="/dashboard" className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}>
                        <span className="icon">📊</span> <span>Dashboard</span>
                    </NavLink>

                    <div className="sidebar-section">Business Operations</div>
                    <NavLink to="/crm" className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`} end>
                        <span className="icon">👤</span> <span>CRM</span>
                    </NavLink>
                    {hasPro && (
                        <NavLink to="/crm/analytics" className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}>
                            <span className="icon">📊</span> <span>CRM Analytics</span>
                        </NavLink>
                    )}
                    <NavLink to="/inventory" className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`} end>
                        <span className="icon">📦</span> <span>Inventory</span>
                    </NavLink>
                    {hasPro && (
                        <NavLink to="/inventory/analytics" className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}>
                            <span className="icon">📊</span> <span>Inventory Analytics</span>
                        </NavLink>
                    )}
                    <NavLink to="/inventory/batches" className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}>
                        <span className="icon">📦</span> <span>批號管理</span>
                    </NavLink>
                    <NavLink to="/suppliers" className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}>
                        <span className="icon">🏢</span> <span>Suppliers</span>
                    </NavLink>
                    <NavLink to="/orders" className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}>
                        <span className="icon">🛒</span> <span>Orders</span>
                    </NavLink>
                    <NavLink to="/shifts" className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}>
                        <span className="icon">🕐</span> <span>Shifts</span>
                    </NavLink>

                    {hasPro && (
                        <>
                            <div className="sidebar-section">Marketing</div>
                            <NavLink to="/marketing/line" className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}>
                                <span className="icon">💬</span> <span>LINE 推播</span>
                            </NavLink>
                        </>
                    )}

                    {hasStarter && (
                        <>
                            <div className="sidebar-section">Financial Reports</div>
                            <NavLink to="/reports/margin" className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}>
                                <span className="icon">📈</span> <span>Margin Analysis</span>
                            </NavLink>
                            <NavLink to="/reports/cashflow" className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}>
                                <span className="icon">💰</span> <span>Cash Flow</span>
                            </NavLink>
                            <NavLink to="/reports/sales-ranking" className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}>
                                <span className="icon">🏆</span> <span>Sales Ranking</span>
                            </NavLink>
                        </>
                    )}

                    {hasPro && (
                        <>
                            <div className="sidebar-section">Integrations</div>
                            <NavLink to="/integrations/accounting" className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}>
                                <span className="icon">🧾</span> <span>Accounting Sync</span>
                            </NavLink>
                        </>
                    )}

                    <div className="sidebar-section">System Admin</div>
                    <NavLink to="/users" className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}>
                        <span className="icon">👥</span> <span>Users</span>
                    </NavLink>
                    <NavLink to="/roles" className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}>
                        <span className="icon">🔐</span> <span>Roles</span>
                    </NavLink>
                    <NavLink to="/audit-logs" className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}>
                        <span className="icon">📋</span> <span>Audit Logs</span>
                    </NavLink>
                </nav>

                <div className="sidebar-footer">
                    <div className="sidebar-user">
                        <strong>{user?.fullName}</strong>
                        <span>{user?.roles?.[0] || 'User'}</span>
                    </div>
                    <ThemeToggle />
                    <button className="btn btn-ghost btn-sm" onClick={handleLogout} style={{ width: '100%', justifyContent: 'center' }}>
                        Logout
                    </button>
                </div>
            </aside>

            <main className="main-content">
                <Outlet />
            </main>
            <PlanUpgradeToast />
        </div>
    );
}
