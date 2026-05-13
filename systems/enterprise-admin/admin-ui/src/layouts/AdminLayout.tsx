import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function AdminLayout() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    function handleLogout() {
        logout();
        navigate('/login');
    }

    return (
        <div className="admin-layout">
            <aside className="sidebar">
                <div className="sidebar-logo">STARTER ADMIN</div>

                <nav className="sidebar-nav">
                    <NavLink to="/dashboard" className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}>
                        <span className="icon">📊</span> <span>Dashboard</span>
                    </NavLink>

                    <div className="sidebar-section">Business Operations</div>
                    <NavLink to="/crm" className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}>
                        <span className="icon">👤</span> <span>CRM</span>
                    </NavLink>
                    <NavLink to="/inventory" className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}>
                        <span className="icon">📦</span> <span>Inventory</span>
                    </NavLink>
                    <NavLink to="/suppliers" className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}>
                        <span className="icon">🏢</span> <span>Suppliers</span>
                    </NavLink>
                    <NavLink to="/orders" className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}>
                        <span className="icon">🛒</span> <span>Orders</span>
                    </NavLink>

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
                    <button className="btn btn-ghost btn-sm" onClick={handleLogout} style={{ width: '100%', justifyContent: 'center' }}>
                        Logout
                    </button>
                </div>
            </aside>

            <main className="main-content">
                <Outlet />
            </main>
        </div>
    );
}
