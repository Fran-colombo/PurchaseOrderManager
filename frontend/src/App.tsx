import type { ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./app/auth";
import { Loading } from "./components/ui";
import AppLayout from "./layouts/AppLayout";
import { AdjustmentDetailPage, AdjustmentsPage, IndexesPage } from "./pages/CacPages";
import { CertificateDetailPage, CertificatesPage, NewCertificatePage } from "./pages/CertificatePages";
import { ClientDetailPage, ClientsPage, ProjectDetailPage, ProjectsPage } from "./pages/ContractPages";
import DashboardPage from "./pages/DashboardPage";
import LoginPage from "./pages/LoginPage";
import { ClaimDetailPage, ClaimsPage, PaymentDetailPage, PaymentsPage, RetentionDetailPage, RetentionsPage } from "./pages/MoneyPages";
import { OrderDetailPage, OrdersPage } from "./pages/OrderPages";
import { AuditPage, CalendarPage, DocumentsPage, ProfilePage, ReportsPage, SystemSettingsPage, UsersPage } from "./pages/SystemPages";

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="vh-100 d-flex align-items-center justify-content-center"><Loading text="Verificando sesión…" /></div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <>{children}</>;
}

function AdminRoute({ children }: { children: ReactNode }) {
  const { isAdmin } = useAuth();
  if (!isAdmin)
    return (
      <div className="alert alert-warning">
        <i className="bi bi-lock me-2" />Esta sección es solo para administradores del sistema.
      </div>
    );
  return <>{children}</>;
}

function NotFound() {
  return (
    <div className="state-box empty">
      <i className="bi bi-signpost-split fs-3 text-secondary" />
      <div>
        <div className="fw-semibold">No encontramos esta página</div>
        <a href="/">Volver al inicio</a>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="calendario" element={<CalendarPage />} />
        <Route path="clientes" element={<ClientsPage />} />
        <Route path="clientes/:id" element={<ClientDetailPage />} />
        <Route path="obras" element={<ProjectsPage />} />
        <Route path="obras/:id" element={<ProjectDetailPage />} />
        <Route path="ordenes" element={<OrdersPage />} />
        <Route path="ordenes/:id" element={<OrderDetailPage />} />
        <Route path="certificados" element={<CertificatesPage />} />
        <Route path="certificados/nuevo" element={<NewCertificatePage />} />
        <Route path="certificados/:id" element={<CertificateDetailPage />} />
        <Route path="reajustes" element={<AdjustmentsPage />} />
        <Route path="reajustes/:id" element={<AdjustmentDetailPage />} />
        <Route path="indices" element={<IndexesPage />} />
        <Route path="pagos" element={<PaymentsPage />} />
        <Route path="pagos/:id" element={<PaymentDetailPage />} />
        <Route path="retenciones" element={<RetentionsPage />} />
        <Route path="retenciones/:id" element={<RetentionDetailPage />} />
        <Route path="reclamos" element={<ClaimsPage />} />
        <Route path="reclamos/:id" element={<ClaimDetailPage />} />
        <Route path="reportes" element={<ReportsPage />} />
        <Route path="documentos" element={<DocumentsPage />} />
        <Route path="perfil" element={<ProfilePage />} />
        <Route path="admin/usuarios" element={<AdminRoute><UsersPage /></AdminRoute>} />
        <Route path="admin/sistema" element={<AdminRoute><SystemSettingsPage /></AdminRoute>} />
        <Route path="admin/auditoria" element={<AdminRoute><AuditPage /></AdminRoute>} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
