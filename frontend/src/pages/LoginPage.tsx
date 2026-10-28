import { useEffect, useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../app/auth";
import { clearLogoutReason, errorMessage, logoutReason } from "../services/api";

export default function LoginPage() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [expired] = useState(() => logoutReason() === "expired");

  useEffect(() => {
    clearLogoutReason();
  }, []);

  if (user) return <Navigate to="/" replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (!email.trim() || !password) {
      setError("Ingresá tu correo y contraseña.");
      return;
    }
    setBusy(true);
    try {
      await login(email.trim(), password);
      const target = (location.state as { from?: string } | null)?.from ?? "/";
      navigate(target, { replace: true });
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={submit} noValidate>
        <div className="d-flex align-items-center gap-2 mb-4">
          <span className="brand-mark">K</span>
          <div>
            <div className="fw-bold fs-5" style={{ color: "var(--ink)" }}>
              Conkreto
            </div>
            <div className="small text-secondary">Certificados, reajustes y cauciones</div>
          </div>
        </div>
        <h1 className="fs-5 fw-semibold mb-3">Iniciar sesión</h1>
        {expired && !error && (
          <div className="alert alert-warning py-2 small" role="status">
            <i className="bi bi-clock-history me-1" />
            Tu sesión venció. Ingresá de nuevo para continuar.
          </div>
        )}
        {error && (
          <div className="alert alert-danger py-2 small" role="alert">
            {error}
          </div>
        )}
        <div className="mb-3">
          <label className="form-label" htmlFor="email">
            Correo electrónico
          </label>
          <input id="email" type="email" inputMode="email" className="form-control form-control-lg" autoComplete="username" placeholder="nombre@conkreto.com" value={email} onChange={(event) => setEmail(event.target.value)} autoFocus />
        </div>
        <div className="mb-4">
          <label className="form-label" htmlFor="password">
            Contraseña
          </label>
          <input id="password" type="password" className="form-control form-control-lg" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </div>
        <button className="btn btn-primary btn-lg w-100" disabled={busy}>
          {busy && <span className="spinner-border spinner-border-sm me-2" />}
          Ingresar
        </button>
        <p className="small text-secondary mt-3 mb-0">Las cuentas las crea un administrador. No hay registro público.</p>
      </form>
    </div>
  );
}
