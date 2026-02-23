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
            {/* Sidebar */}
            <aside className="sidebar">
                <div className="sidebar-brand">⚡ Admin Panel</div>

                <nav className="sidebar-nav">
                    <NavLink to="/dashboard" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
                        <span className="icon">📊</span> Dashboard
                    </NavLink>
                    <NavLink to="/users" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
                        <span className="icon">👥</span> Users
                    </NavLink>
                    <NavLink to="/roles" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
                        <span className="icon">🛡️</span> Roles & Permissions
                    </NavLink>
                    <NavLink to="/audit-logs" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
                        <span className="icon">📋</span> Audit Logs
                    </NavLink>
                    <NavLink to="/crm" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
                        <span className="icon">🤝</span> CRM (Customers)
                    </NavLink>
                </nav>

                <div className="sidebar-footer">
                    <div className="sidebar-user">
                        <strong>{user?.fullName}</strong>
                        <span>{user?.roles[0]}</span>
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={handleLogout}>
                        Logout
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="main-content">
                <Outlet />
            </main>
        </div>
    );
}
