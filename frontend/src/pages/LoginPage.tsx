import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../app/auth";
import { errorMessage } from "../services/api";

export default function LoginPage() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (!username.trim() || !password) {
      setError("Ingresá tu usuario y contraseña.");
      return;
    }
    setBusy(true);
    try {
      await login(username.trim(), password);
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
        {error && (
          <div className="alert alert-danger py-2 small" role="alert">
            {error}
          </div>
        )}
        <div className="mb-3">
          <label className="form-label" htmlFor="username">
            Usuario
          </label>
          <input id="username" className="form-control form-control-lg" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} autoFocus />
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
