import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import POSLoginPage from './pages/POSLoginPage';
import POSCheckoutPage from './pages/POSCheckoutPage';
import CustomerDisplayPage from './pages/CustomerDisplayPage';

function isAuthenticated() {
  return !!localStorage.getItem('pos_accessToken');
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={isAuthenticated() ? <Navigate to="/" replace /> : <POSLoginPage />} />
        <Route path="/" element={isAuthenticated() ? <POSCheckoutPage /> : <Navigate to="/login" replace />} />
        <Route path="/customer-display" element={<CustomerDisplayPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
