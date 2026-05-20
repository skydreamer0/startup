import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import UsersPage from './pages/UsersPage';
import RolesPage from './pages/RolesPage';
import AuditLogsPage from './pages/AuditLogsPage';
import CustomerListPage from './pages/CRM/CustomerListPage';
import CrmAnalyticsPage from './pages/CRM/CrmAnalyticsPage';
import CustomerDetailPage from './pages/CRM/CustomerDetailPage';
import ProductListPage from './pages/Inventory/ProductListPage';
import InventoryAnalyticsPage from './pages/Inventory/InventoryAnalyticsPage';
import SupplierListPage from './pages/Inventory/SupplierListPage';
import OrderListPage from './pages/Orders/OrderListPage';
import MarginAnalysisPage from './pages/Reports/MarginAnalysisPage';
import CashFlowPage from './pages/Reports/CashFlowPage';
import SalesRankingPage from './pages/Reports/SalesRankingPage';
import AdminLayout from './layouts/AdminLayout';
import PlanGate from './components/PlanGate';
import PosPreviewPage from './pages/POS/PosPreviewPage';
import BatchListPage from './pages/Inventory/BatchListPage';
import ShiftListPage from './pages/Shifts/ShiftListPage';
import AccountingSyncPage from './pages/AccountingSyncPage';
import MarketingPage from './pages/Marketing/MarketingPage';

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
                        {/* POS — own layout, outside AdminLayout */}
                        <Route path="/pos" element={<PosPreviewPage />} />
                        <Route element={<AdminLayout />}>
                            <Route path="/dashboard" element={<DashboardPage />} />
                            <Route path="/users" element={<UsersPage />} />
                            <Route path="/roles" element={<RolesPage />} />
                            <Route path="/audit-logs" element={<AuditLogsPage />} />
                            {/* CRM Phase 3 */}
                            <Route path="/crm" element={<CustomerListPage />} />
                            <Route path="/crm/analytics" element={<PlanGate plan="pro"><CrmAnalyticsPage /></PlanGate>} />
                            <Route path="/crm/:id" element={<CustomerDetailPage />} />
                            {/* Inventory Phase 3 */}
                            <Route path="/inventory" element={<ProductListPage />} />
                            <Route path="/inventory/analytics" element={<PlanGate plan="pro"><InventoryAnalyticsPage /></PlanGate>} />
                            <Route path="/suppliers" element={<SupplierListPage />} />
                            {/* Inventory batches Phase 8 */}
                            <Route path="/inventory/batches" element={<BatchListPage />} />
                            {/* Orders Phase 4 */}
                            <Route path="/orders" element={<OrderListPage />} />
                            {/* Shifts Phase 8 */}
                            <Route path="/shifts" element={<ShiftListPage />} />
                            {/* Marketing Phase 6 — pro */}
                            <Route path="/marketing/line" element={<MarketingPage />} />
                            {/* Financial Reports Phase 5 — starter+ */}
                            <Route path="/reports/margin" element={<PlanGate plan="starter"><MarginAnalysisPage /></PlanGate>} />
                            <Route path="/reports/cashflow" element={<PlanGate plan="starter"><CashFlowPage /></PlanGate>} />
                            <Route path="/reports/sales-ranking" element={<PlanGate plan="starter"><SalesRankingPage /></PlanGate>} />
                            {/* Integrations Phase 6 — pro */}
                            <Route path="/integrations/accounting" element={<AccountingSyncPage />} />
                        </Route>
                    </Route>

                    {/* Default redirect */}
                    <Route path="*" element={<Navigate to="/dashboard" replace />} />
                </Routes>
            </AuthProvider>
        </BrowserRouter>
    );
}
