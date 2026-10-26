import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../app/auth";
import { ClientNoticeButtons } from "../components/ClientNotice";
import { api } from "../services/api";
import type { Reminder } from "../types";
import { date, label, money } from "../utils/format";

const NAV = [
  { section: "General" },
  { to: "/", label: "Inicio", icon: "bi-speedometer2", end: true },
  { to: "/calendario", label: "Vencimientos", icon: "bi-calendar3" },
  { section: "Contratos" },
  { to: "/clientes", label: "Clientes", icon: "bi-building" },
  { to: "/obras", label: "Obras", icon: "bi-cone-striped" },
  { to: "/ordenes", label: "Órdenes de compra", icon: "bi-file-earmark-text" },
  { section: "Finanzas" },
  { to: "/certificados", label: "Certificados", icon: "bi-clipboard-check" },
  { to: "/reajustes", label: "Reajustes CAC", icon: "bi-graph-up-arrow" },
  { to: "/indices", label: "Índices CAC", icon: "bi-table" },
  { to: "/pagos", label: "Pagos", icon: "bi-cash-coin" },
  { section: "Cauciones" },
  { to: "/retenciones", label: "Retenciones", icon: "bi-safe2" },
  { to: "/reclamos", label: "Reclamos", icon: "bi-megaphone" },
  { section: "Información" },
  { to: "/reportes", label: "Reportes", icon: "bi-bar-chart-line" },
  { to: "/documentos", label: "Documentos", icon: "bi-paperclip" },
] as const;

const ADMIN_NAV = [
  { to: "/admin/usuarios", label: "Usuarios", icon: "bi-people" },
  { to: "/admin/sistema", label: "Configuración", icon: "bi-sliders" },
  { to: "/admin/auditoria", label: "Auditoría", icon: "bi-shield-check" },
];

const TITLES: [RegExp, string][] = [
  [/^\/$/, "Inicio"],
  [/^\/calendario/, "Calendario de vencimientos"],
  [/^\/clientes/, "Clientes"],
  [/^\/obras/, "Obras"],
  [/^\/ordenes/, "Órdenes de compra"],
  [/^\/certificados/, "Certificados"],
  [/^\/reajustes/, "Reajustes CAC"],
  [/^\/indices/, "Índices CAC"],
  [/^\/pagos/, "Pagos"],
  [/^\/retenciones/, "Retenciones de caución"],
  [/^\/reclamos/, "Reclamos y seguimiento"],
  [/^\/reportes/, "Reportes"],
  [/^\/documentos/, "Documentos"],
  [/^\/perfil/, "Mi perfil"],
  [/^\/admin\/usuarios/, "Usuarios"],
  [/^\/admin\/sistema/, "Configuración del sistema"],
  [/^\/admin\/auditoria/, "Auditoría"],
];

interface SearchResult {
  type: string;
  id: number;
  title: string;
  subtitle: string;
  path: string;
}

function GlobalSearch({ onNavigate }: { onNavigate?: () => void }) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (term.trim().length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get<SearchResult[]>("/search", { params: { q: term } });
        setResults(data);
        setOpen(true);
      } catch {
        setResults([]);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [term]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const go = (path: string) => {
    setOpen(false);
    setTerm("");
    onNavigate?.();
    navigate(path);
  };

  return (
    <div className="global-search" ref={box}>
      <i className="bi bi-search" />
      <input
        type="search"
        className="form-control"
        placeholder="Buscar cliente, obra, OC, certificado, pago…"
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        onFocus={() => results.length && setOpen(true)}
        aria-label="Búsqueda global"
      />
      {open && term.trim().length >= 2 && (
        <div className="search-results">
          {results.length === 0 ? (
            <div className="p-3 text-secondary small">No se encontraron resultados.</div>
          ) : (
            results.map((result) => (
              <button key={`${result.type}-${result.id}`} className="search-result" onClick={() => go(result.path)}>
                <span className="search-type">{label(result.type)}</span>
                <span className="text-truncate">
                  <strong>{result.title}</strong>
                  {result.subtitle && <span className="text-secondary"> · {label(result.subtitle)}</span>}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function Notifications() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Reminder[]>([]);
  const box = useRef<HTMLDivElement>(null);
  const location = useLocation();

  const load = async () => {
    try {
      const { data } = await api.get<Reminder[]>("/reminders");
      setItems(data.filter((item) => item.status !== "gestionado"));
    } catch {
      setItems([]);
    }
  };

  useEffect(() => {
    load();
  }, [location.pathname]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const pending = items.filter((item) => item.status === "pendiente").length;

  const mark = async (reminder: Reminder, action: "seen" | "managed") => {
    await api.post(`/reminders/${reminder.id}/${action}`);
    load();
  };

  return (
    <div className="position-relative" ref={box}>
      <button className="icon-btn" aria-label="Recordatorios" onClick={() => setOpen((value) => !value)}>
        <i className="bi bi-bell" />
        {pending > 0 && <span className="notif-dot">{pending > 9 ? "9+" : pending}</span>}
      </button>
      {open && (
        <div className="notif-panel">
          <div className="notif-head">Recordatorios</div>
          {items.length === 0 ? (
            <div className="p-3 small text-secondary">No hay recordatorios pendientes.</div>
          ) : (
            items.slice(0, 15).map((item) => (
              <div key={item.id} className={`notif-item ${item.status === "pendiente" ? "unread" : ""}`}>
                <Link to={item.link_path} className="text-decoration-none text-reset" onClick={() => { setOpen(false); mark(item, "seen"); }}>
                  <div className="fw-semibold small">{item.title}</div>
                  <div className="small text-secondary">
                    {item.due_date ? date(item.due_date) : "Sin fecha"} · {money(item.amount, item.currency)}
                  </div>
                </Link>
                {item.contact ? (
                  <ClientNoticeButtons reminder={item} onDone={load} />
                ) : (
                  <button className="btn btn-link btn-sm p-0 small" onClick={() => mark(item, "managed")}>
                    Marcar gestionado
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function AppLayout() {
  const { user, logout, isAdmin } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const location = useLocation();
  const title = TITLES.find(([pattern]) => pattern.test(location.pathname))?.[1] ?? "Conkreto";

  useEffect(() => {
    setMenuOpen(false);
    setUserOpen(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);

  const nav = (
    <nav className="side-nav" aria-label="Navegación principal">
      {NAV.map((item, index) =>
        "section" in item ? (
          <div key={`s-${index}`} className="nav-section">
            {item.section}
          </div>
        ) : (
          <NavLink key={item.to} to={item.to} end={"end" in item ? item.end : false} className="nav-item">
            <i className={`bi ${item.icon}`} />
            <span>{item.label}</span>
          </NavLink>
        ),
      )}
      {isAdmin && (
        <>
          <div className="nav-section">Administración</div>
          {ADMIN_NAV.map((item) => (
            <NavLink key={item.to} to={item.to} className="nav-item">
              <i className={`bi ${item.icon}`} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </>
      )}
    </nav>
  );

  return (
    <div className="app-shell">
      <aside className="sidebar d-none d-lg-flex">
        <Link to="/" className="brand">
          <span className="brand-mark">K</span>
          <span>
            Conkreto
            <small>Certificados y cauciones</small>
          </span>
        </Link>
        {nav}
      </aside>

      {menuOpen && (
        <>
          <div className="mobile-drawer" role="dialog" aria-label="Menú">
            <div className="d-flex align-items-center justify-content-between pe-2">
              <Link to="/" className="brand">
                <span className="brand-mark">K</span>
                <span>Conkreto</span>
              </Link>
              <button className="icon-btn text-white" aria-label="Cerrar menú" onClick={() => setMenuOpen(false)}>
                <i className="bi bi-x-lg" />
              </button>
            </div>
            <div className="px-3 pb-2 d-md-none">
              <GlobalSearch onNavigate={() => setMenuOpen(false)} />
            </div>
            {nav}
          </div>
          <div className="drawer-backdrop" onClick={() => setMenuOpen(false)} />
        </>
      )}

      <div className="main-area">
        <header className="topbar">
          <button className="icon-btn d-lg-none" aria-label="Abrir menú" onClick={() => setMenuOpen(true)}>
            <i className="bi bi-list" />
          </button>
          <div className="topbar-title text-truncate">{title}</div>
          <div className="d-none d-md-block flex-grow-1 mx-3" style={{ maxWidth: 460 }}>
            <GlobalSearch />
          </div>
          <div className="ms-auto d-flex align-items-center gap-1">
            <Notifications />
            <div className="position-relative">
              <button className="user-btn" onClick={() => setUserOpen((value) => !value)} aria-label="Menú de usuario">
                <span className="avatar">{(user?.full_name || user?.username || "?").slice(0, 1).toUpperCase()}</span>
                <span className="d-none d-sm-inline text-truncate" style={{ maxWidth: 140 }}>
                  {user?.full_name || user?.username}
                </span>
                <i className="bi bi-chevron-down small" />
              </button>
              {userOpen && (
                <div className="user-menu">
                  <div className="px-3 py-2 border-bottom">
                    <div className="fw-semibold">{user?.username}</div>
                    <div className="small text-secondary">{label(user?.role)}</div>
                  </div>
                  <Link to="/perfil" className="user-menu-item">
                    <i className="bi bi-person" /> Perfil y contraseña
                  </Link>
                  <button className="user-menu-item" onClick={logout}>
                    <i className="bi bi-box-arrow-right" /> Cerrar sesión
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
