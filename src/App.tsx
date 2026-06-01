import { Routes, Route, Navigate } from 'react-router-dom';
import { getSession } from './lib/auth';
import { Login } from './views/Login';
import { Register } from './views/Register';
import { OperatorDashboard } from './views/operator/Dashboard';
import { UsersApproval } from './views/operator/UsersApproval';
import { NewDelivery } from './views/operator/NewDelivery';
import { ShareDelivery } from './views/operator/ShareDelivery';
import { MessengerDashboard } from './views/messenger/Dashboard';
import { MessengerDelivery } from './views/messenger/Delivery';
import { CustomerTracking } from './views/customer/Tracking';

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
  return (
    <Routes>
      {/* Público */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/p/c/:token" element={<CustomerTracking />} />

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

      {/* Mensajero */}
      <Route path="/mensajero" element={
        <RequireAuth role="messenger"><MessengerDashboard /></RequireAuth>
      } />
      <Route path="/mensajero/envio/:id" element={
        <RequireAuth role="messenger"><MessengerDelivery /></RequireAuth>
      } />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
