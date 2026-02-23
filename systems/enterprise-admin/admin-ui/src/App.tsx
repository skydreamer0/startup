import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import UsersPage from './pages/UsersPage';
import RolesPage from './pages/RolesPage';
import AuditLogsPage from './pages/AuditLogsPage';
import CustomerListPage from './pages/CRM/CustomerListPage';
import CustomerDetailPage from './pages/CRM/CustomerDetailPage';
import AdminLayout from './layouts/AdminLayout';

function ProtectedRoute() {
    const { user, loading } = useAuth();
    if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text-muted)' }}>Loading...</div>;
    return user ? <Outlet /> : <Navigate to="/login" replace />;
}

function PublicRoute() {
    const { user, loading } = useAuth();
    if (loading) return null;
    return user ? <Navigate to="/dashboard" replace /> : <Outlet />;
}

export default function App() {
    return (
        <BrowserRouter>
            <AuthProvider>
                <Routes>
                    {/* Public */}
                    <Route element={<PublicRoute />}>
                        <Route path="/login" element={<LoginPage />} />
                    </Route>

                    {/* Protected */}
                    <Route element={<ProtectedRoute />}>
                        <Route element={<AdminLayout />}>
                            <Route path="/dashboard" element={<DashboardPage />} />
                            <Route path="/users" element={<UsersPage />} />
                            <Route path="/roles" element={<RolesPage />} />
                            <Route path="/audit-logs" element={<AuditLogsPage />} />
                            {/* CRM Phase 3 */}
                            <Route path="/crm" element={<CustomerListPage />} />
                            <Route path="/crm/:id" element={<CustomerDetailPage />} />
                        </Route>
                    </Route>

                    {/* Default redirect */}
                    <Route path="*" element={<Navigate to="/dashboard" replace />} />
                </Routes>
            </AuthProvider>
        </BrowserRouter>
    );
}
