import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { getSession } from './lib/auth';
import { applyTenantTheme } from './lib/theme';
import { Login } from './views/Login';
import { Register } from './views/Register';
import { OperatorDashboard } from './views/operator/Dashboard';
import { UsersApproval } from './views/operator/UsersApproval';
import { NewDelivery } from './views/operator/NewDelivery';
import { ShareDelivery } from './views/operator/ShareDelivery';
import { AdminPanel } from './views/operator/AdminPanel';
import { ZonesManager } from './views/operator/Zones';
import { OperatorLiveMap } from './views/operator/LiveMap';
import { MessengerDashboard } from './views/messenger/Dashboard';
import { MessengerDelivery } from './views/messenger/Delivery';
import { CustomerTracking } from './views/customer/Tracking';
import { MessengerPortal } from './views/messenger/MessengerPortal';
import { FeaturesIndex } from './views/customer/FeaturesIndex';
import { PrivacyPolicy } from './views/PrivacyPolicy';
import { NotFound } from './views/NotFound';

function RequireAuth({ children, role }: { children: React.ReactNode; role?: string }) {
  const user = getSession();
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function HomeRedirect() {
  const user = getSession();
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === 'messenger' ? '/mensajero' : '/operador'} replace />;
}

export default function App() {
  useEffect(() => {
    const user = getSession();
    if (user?.tenant) {
      applyTenantTheme(user.tenant);
    }
  }, []);

  return (
    <Routes>
      {/* Público */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/tracking/:token" element={<CustomerTracking />} />
      <Route path="/m-portal/:token" element={<MessengerPortal />} />
      <Route path="/privacy" element={<PrivacyPolicy />} />
      <Route path="/enviosapp" element={<FeaturesIndex />} />

      {/* Raíz → redirige según rol */}
      <Route path="/" element={<HomeRedirect />} />

      {/* Operador */}
      <Route path="/operador" element={
        <RequireAuth role="operator"><OperatorDashboard /></RequireAuth>
      } />
      <Route path="/operador/nuevo" element={
        <RequireAuth role="operator"><NewDelivery /></RequireAuth>
      } />
      <Route path="/operador/envio/:id/compartir" element={
        <RequireAuth role="operator"><ShareDelivery /></RequireAuth>
      } />
      <Route path="/operador/usuarios" element={
        <RequireAuth role="operator"><UsersApproval /></RequireAuth>
      } />
      <Route path="/operador/admin" element={
        <RequireAuth role="operator"><AdminPanel /></RequireAuth>
      } />
      <Route path="/operador/zonas" element={
        <RequireAuth role="operator"><ZonesManager /></RequireAuth>
      } />
      <Route path="/operador/mapa" element={
        <RequireAuth role="operator"><OperatorLiveMap /></RequireAuth>
      } />

      {/* Mensajero */}
      <Route path="/mensajero" element={
        <RequireAuth role="messenger"><MessengerDashboard /></RequireAuth>
      } />
      <Route path="/mensajero/envio/:id" element={
        <RequireAuth role="messenger"><MessengerDelivery /></RequireAuth>
      } />

      {/* Fallback → 404 */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
