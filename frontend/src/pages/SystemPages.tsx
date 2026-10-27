import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../app/auth";
import { useToast } from "../app/toast";
import { CheckField, Field, FormError, SelectField } from "../components/form";
import { Card, ConfirmDialog, DataTable, EmptyState, ErrorBox, Loading, Modal, Money, PageHeader, Pagination, StatusBadge, type Column } from "../components/ui";
import { useApi, useStoredState } from "../hooks/useApi";
import { api, download, errorMessage, fieldErrors } from "../services/api";
import type { Client, Page, Project, User } from "../types";
import { date, dateTime, label, todayIso } from "../utils/format";

/* ---------- Calendario ---------- */

interface CalendarEvent {
  date: string;
  kind: string;
  title: string;
  amount: string;
  path: string;
}

const KIND_ICON: Record<string, string> = {
  liberacion_caucion: "bi-shield-check text-success",
  vencimiento_certificado: "bi-receipt text-primary",
  pago_prometido: "bi-cash-coin text-warning",
  seguimiento: "bi-telephone text-secondary",
};

const iso = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;

export function CalendarPage() {
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const start = iso(cursor);
  const end = iso(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0));
  const { data, loading, error, reload } = useApi<CalendarEvent[]>("/calendar", { start, end });
  const grouped = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of data ?? []) map.set(event.date, [...(map.get(event.date) ?? []), event]);
    return [...map.entries()];
  }, [data]);
  const today = todayIso();
  const rawMonth = cursor.toLocaleDateString("es-AR", { month: "long", year: "numeric" });
  const monthName = rawMonth.charAt(0).toUpperCase() + rawMonth.slice(1);

  const days = useMemo(() => {
    const first = (cursor.getDay() + 6) % 7;
    const total = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    return [...Array(first).fill(null), ...Array.from({ length: total }, (_, index) => index + 1)];
  }, [cursor]);
  const byDay = new Map(grouped);

  return (
    <>
      <PageHeader
        title="Calendario"
        subtitle="Liberaciones de caución, vencimientos de certificados, pagos prometidos y seguimientos."
        actions={
          <div className="btn-group">
            <button className="btn btn-outline-secondary" aria-label="Mes anterior" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}><i className="bi bi-chevron-left" /></button>
            <button className="btn btn-outline-secondary" onClick={() => setCursor(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>{monthName}</button>
            <button className="btn btn-outline-secondary" aria-label="Mes siguiente" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}><i className="bi bi-chevron-right" /></button>
          </div>
        }
      />
      {error && <ErrorBox message={error} onRetry={reload} />}
      <div className="row g-3">
        <div className="col-12 col-xl-7 d-none d-md-block">
          <Card>
            <div className="calendar-grid">
              {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((day) => <div key={day} className="calendar-head">{day}</div>)}
              {days.map((day, index) => {
                if (!day) return <div key={`e-${index}`} className="calendar-cell empty" />;
                const key = iso(new Date(cursor.getFullYear(), cursor.getMonth(), day));
                const events = byDay.get(key) ?? [];
                return (
                  <div key={key} className={`calendar-cell ${key === today ? "today" : ""}`}>
                    <div className="calendar-day">{day}</div>
                    {events.slice(0, 3).map((event, position) => (
                      <Link key={position} to={event.path} className="calendar-event" title={event.title}>
                        <i className={`bi ${KIND_ICON[event.kind] ?? "bi-dot"}`} /> {event.title}
                      </Link>
                    ))}
                    {events.length > 3 && <div className="small text-secondary">+{events.length - 3} más</div>}
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
        <div className="col-12 col-xl-5">
          <Card title="Agenda del mes">
            {loading && !data ? (
              <Loading />
            ) : grouped.length === 0 ? (
              <EmptyState title="Sin eventos este mes" />
            ) : (
              <div className="agenda">
                {grouped.map(([day, events]) => (
                  <div key={day} className="agenda-day">
                    <div className={`agenda-date ${day < today ? "text-secondary" : ""}`}>{date(day)}</div>
                    {events.map((event, index) => (
                      <Link key={index} to={event.path} className="agenda-item">
                        <i className={`bi ${KIND_ICON[event.kind] ?? "bi-dot"}`} />
                        <span className="flex-grow-1">{event.title}</span>
                        <Money value={event.amount} />
                      </Link>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

/* ---------- Reportes ---------- */

interface Report {
  name: string;
  title: string;
  columns: { key: string; label: string }[];
  rows: Record<string, string>[];
  totals: Record<string, string>;
}

const MONEY_KEYS = new Set(["base", "reajuste", "bruto", "retencion", "neto", "cobrado", "pendiente", "retenido", "recuperado", "importe", "aprobado", "calculado", "presentado"]);
const STATUS_KEYS = new Set(["estado", "canal", "metodo", "tipo", "criterio"]);
const isIsoDate = (value: unknown) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

function cell(key: string, value: string, currency: string) {
  if (value === "" || value === null || value === undefined) return <span className="text-secondary">—</span>;
  if (MONEY_KEYS.has(key)) return <Money value={value} currency={currency || "ARS"} />;
  if (STATUS_KEYS.has(key)) return key === "estado" ? <StatusBadge value={value} /> : label(value);
  if (isIsoDate(value)) return date(value);
  return value;
}

export function ReportsPage() {
  const [params, setParams] = useSearchParams();
  const { meta } = useAuth();
  const notify = useToast();
  const catalog = useApi<{ name: string; title: string }[]>("/reports");
  const clients = useApi<Page<Client>>("/clients", { page_size: 200 });
  const projects = useApi<Page<Project>>("/projects", { page_size: 200 });
  const name = params.get("r") ?? "estado_cuenta_cliente";
  const [filters, setFilters] = useStoredState("filters.reports", { client_id: "", project_id: "", currency: "", date_from: "", date_to: "" });
  const { data, loading, error, reload } = useApi<Report>(`/reports/${name}`, filters);
  const [exporting, setExporting] = useState(false);

  const exportAs = async (format: "csv" | "xlsx") => {
    setExporting(true);
    try {
      const query = new URLSearchParams({ format, ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value)) });
      await download(`/reports/${name}/export?${query.toString()}`, `${name}_${todayIso()}.${format}`);
    } catch (caught) {
      notify(errorMessage(caught), "danger");
    } finally {
      setExporting(false);
    }
  };

  const columns: Column<Record<string, string>>[] = (data?.columns ?? []).map((column, index) => ({
    key: column.key,
    header: column.label,
    align: MONEY_KEYS.has(column.key) ? "end" : undefined,
    primary: index === 0,
    render: (row) => cell(column.key, row[column.key], row.moneda),
  }));

  return (
    <>
      <PageHeader
        title="Reportes"
        subtitle="La exportación usa los mismos filtros y cálculos que la pantalla."
        actions={
          <>
            <button className="btn btn-outline-secondary" disabled={exporting || !data?.rows.length} onClick={() => exportAs("csv")}><i className="bi bi-filetype-csv me-1" />CSV</button>
            <button className="btn btn-outline-success" disabled={exporting || !data?.rows.length} onClick={() => exportAs("xlsx")}><i className="bi bi-file-earmark-excel me-1" />Excel</button>
          </>
        }
      />
      <div className="tabs-scroll mb-3" role="tablist">
        {(catalog.data ?? []).map((item) => (
          <button key={item.name} role="tab" aria-selected={item.name === name} className={`tab-btn ${item.name === name ? "active" : ""}`} onClick={() => setParams({ r: item.name })}>
            {item.title}
          </button>
        ))}
      </div>
      <Card bodyClass="p-0">
        <div className="filters">
          <select className="form-select" value={filters.client_id} onChange={(event) => setFilters({ ...filters, client_id: event.target.value, project_id: "" })} aria-label="Cliente">
            <option value="">Todos los clientes</option>
            {(clients.data?.items ?? []).map((row) => <option key={row.id} value={row.id}>{row.legal_name}</option>)}
          </select>
          <select className="form-select" value={filters.project_id} onChange={(event) => setFilters({ ...filters, project_id: event.target.value })} aria-label="Obra">
            <option value="">Todas las obras</option>
            {(projects.data?.items ?? []).filter((row) => !filters.client_id || String(row.client_id) === filters.client_id).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
          </select>
          <select className="form-select" value={filters.currency} onChange={(event) => setFilters({ ...filters, currency: event.target.value })} aria-label="Moneda">
            <option value="">Todas las monedas</option>
            {(meta?.currencies ?? []).map((code) => <option key={code} value={code}>{code}</option>)}
          </select>
          <input type="date" className="form-control" value={filters.date_from} onChange={(event) => setFilters({ ...filters, date_from: event.target.value })} aria-label="Desde" title="Desde" />
          <input type="date" className="form-control" value={filters.date_to} onChange={(event) => setFilters({ ...filters, date_to: event.target.value })} aria-label="Hasta" title="Hasta" />
        </div>
        {error ? (
          <div className="p-3"><ErrorBox message={error} onRetry={reload} /></div>
        ) : loading && !data ? (
          <Loading />
        ) : (
          <>
            <DataTable rows={data?.rows ?? []} columns={columns} rowKey={(row) => JSON.stringify(row)} empty={<EmptyState title="El reporte no tiene filas" text="Probá con otros filtros." />} />
            {data && Object.keys(data.totals).length > 0 && (
              <div className="report-totals">
                <strong>Totales ({data.totals.moneda})</strong>
                {data.columns.filter((column) => MONEY_KEYS.has(column.key)).map((column) => (
                  <span key={column.key}>{column.label}: <Money value={data.totals[column.key]} currency={data.totals.moneda} /></span>
                ))}
              </div>
            )}
            {data && data.rows.length > 0 && Object.keys(data.totals).length === 0 && <div className="report-totals text-secondary small">Hay importes en distintas monedas: filtrá por moneda para ver totales.</div>}
          </>
        )}
      </Card>
    </>
  );
}

/* ---------- Documentos ---------- */

interface DocumentRow {
  id: number;
  entity_type: string;
  entity_id: number;
  original_name: string;
  content_type: string;
  size_bytes: number;
  uploaded_at: string;
  uploaded_by: string | null;
}

const ENTITY_PATH: Record<string, string> = {
  client: "/clientes",
  project: "/obras",
  purchase_order: "/ordenes",
  certificate: "/certificados",
  payment: "/pagos",
  retention: "/retenciones",
  claim: "/reclamos",
  adjustment: "/reajustes",
};

const ENTITY_LABEL: Record<string, string> = {
  client: "Cliente",
  project: "Obra",
  purchase_order: "Orden de compra",
  certificate: "Certificado",
  payment: "Pago",
  retention: "Retención",
  claim: "Reclamo",
  adjustment: "Reajuste",
};

export function DocumentsPage() {
  const notify = useToast();
  const [entity, setEntity] = useStoredState("filters.documents", { entity_type: "" });
  const { data, loading, error, reload } = useApi<DocumentRow[]>("/documents", entity);
  const [removing, setRemoving] = useState<DocumentRow | null>(null);
  const columns: Column<DocumentRow>[] = [
    { key: "n", header: "Archivo", render: (row) => <><i className="bi bi-file-earmark me-1" />{row.original_name}</>, primary: true },
    { key: "e", header: "Asociado a", render: (row) => <Link to={`${ENTITY_PATH[row.entity_type] ?? ""}/${row.entity_id}`}>{ENTITY_LABEL[row.entity_type] ?? row.entity_type} #{row.entity_id}</Link> },
    { key: "s", header: "Tamaño", align: "end", render: (row) => `${(row.size_bytes / 1024).toLocaleString("es-AR", { maximumFractionDigits: 0 })} KB`, hideOnMobile: true },
    { key: "d", header: "Subido", render: (row) => dateTime(row.uploaded_at) },
    {
      key: "a",
      header: "",
      align: "end",
      render: (row) => (
        <div className="d-flex gap-1 justify-content-end">
          <button className="btn btn-sm btn-outline-primary" aria-label="Descargar" onClick={() => download(`/documents/${row.id}/download`, row.original_name).catch((caught) => notify(errorMessage(caught), "danger"))}><i className="bi bi-download" /></button>
          <button className="btn btn-sm btn-outline-danger" aria-label="Eliminar" onClick={() => setRemoving(row)}><i className="bi bi-trash" /></button>
        </div>
      ),
    },
  ];
  return (
    <>
      <PageHeader title="Documentos" subtitle="Los archivos solo se descargan con una sesión iniciada. Para adjuntar uno, abrí la ficha del registro." />
      <Card bodyClass="p-0">
        <div className="filters">
          <select className="form-select" value={entity.entity_type} onChange={(event) => setEntity({ entity_type: event.target.value })} aria-label="Tipo">
            <option value="">Todos los registros</option>
            {Object.entries(ENTITY_LABEL).map(([key, text]) => <option key={key} value={key}>{text}</option>)}
          </select>
        </div>
        {error ? <div className="p-3"><ErrorBox message={error} onRetry={reload} /></div> : loading && !data ? <Loading /> : <DataTable rows={data ?? []} columns={columns} rowKey={(row) => row.id} empty={<EmptyState title="No hay documentos" text="Adjuntá archivos desde la ficha de una orden, certificado, pago o reclamo." />} />}
      </Card>
      {removing && (
        <ConfirmDialog
          title="Eliminar documento"
          danger
          confirmLabel="Eliminar"
          message={<>Se eliminará <strong>{removing.original_name}</strong>. La eliminación queda registrada en la auditoría.</>}
          onCancel={() => setRemoving(null)}
          onConfirm={async () => {
            try {
              await api.delete(`/documents/${removing.id}`);
              notify("Documento eliminado.");
              reload();
            } catch (caught) {
              notify(errorMessage(caught), "danger");
            }
            setRemoving(null);
          }}
        />
      )}
    </>
  );
}

/* ---------- Perfil ---------- */

export function ProfilePage() {
  const { user, reload } = useAuth();
  const notify = useToast();
  const [profile, setProfile] = useState({ full_name: user?.full_name ?? "", email: user?.email ?? "" });
  const [password, setPassword] = useState({ current_password: "", new_password: "", repeat: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  const saveProfile = async () => {
    try {
      await api.put("/auth/me", profile);
      await reload();
      notify("Perfil actualizado.");
    } catch (caught) {
      notify(errorMessage(caught), "danger");
    }
  };

  const changePassword = async () => {
    setError("");
    const local: Record<string, string> = {};
    if (password.new_password.length < 8) local.new_password = "Usá al menos 8 caracteres.";
    if (password.new_password !== password.repeat) local.repeat = "Las contraseñas no coinciden.";
    setErrors(local);
    if (Object.keys(local).length) return;
    try {
      await api.post("/auth/change-password", { current_password: password.current_password, new_password: password.new_password });
      notify("Contraseña cambiada. Las otras sesiones se cerraron.");
      setPassword({ current_password: "", new_password: "", repeat: "" });
      await reload();
    } catch (caught) {
      setErrors(fieldErrors(caught));
      setError(errorMessage(caught));
    }
  };

  if (!user) return <Loading />;
  return (
    <>
      <PageHeader title="Mi perfil" subtitle={<>Usuario <strong>{user.username}</strong> · {user.role === "sysadmin" ? "Administrador" : "Usuario normal"}</>} />
      <div className="row g-3">
        <div className="col-12 col-lg-6">
          <Card title="Datos personales">
            <div className="row g-3">
              <Field name="full_name" label="Nombre y apellido" className="col-12" value={profile.full_name} onChange={(value) => setProfile({ ...profile, full_name: value })} />
              <Field name="email" label="Correo" type="email" className="col-12" value={profile.email} onChange={(value) => setProfile({ ...profile, email: value })} />
              <div className="col-12"><button className="btn btn-primary" onClick={saveProfile}>Guardar</button></div>
            </div>
          </Card>
        </div>
        <div className="col-12 col-lg-6">
          <Card title="Cambiar contraseña">
            <FormError message={error} />
            <div className="row g-3">
              <Field name="current_password" label="Contraseña actual" type="password" className="col-12" value={password.current_password} onChange={(value) => setPassword({ ...password, current_password: value })} />
              <Field name="new_password" label="Nueva contraseña" type="password" className="col-12" value={password.new_password} onChange={(value) => setPassword({ ...password, new_password: value })} error={errors.new_password} hint="Mínimo 8 caracteres." />
              <Field name="repeat" label="Repetir nueva contraseña" type="password" className="col-12" value={password.repeat} onChange={(value) => setPassword({ ...password, repeat: value })} error={errors.repeat} />
              <div className="col-12"><button className="btn btn-primary" onClick={changePassword}>Cambiar contraseña</button></div>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

/* ---------- Administración: usuarios ---------- */

function UserModal({ initial, onClose, onSaved }: { initial?: User; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ username: initial?.username ?? "", email: initial?.email ?? "", full_name: initial?.full_name ?? "", role: initial?.role ?? "normal", is_active: initial?.is_active ?? true, password: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setError("");
    const local: Record<string, string> = {};
    if (!initial && form.username.trim().length < 3) local.username = "Mínimo 3 caracteres.";
    if (!initial && form.password.length < 8) local.password = "La contraseña inicial debe tener al menos 8 caracteres.";
    if (initial && form.password && form.password.length < 8) local.password = "Mínimo 8 caracteres.";
    setErrors(local);
    if (Object.keys(local).length) return;
    setBusy(true);
    try {
      if (initial) {
        const payload: Record<string, unknown> = { email: form.email, full_name: form.full_name, role: form.role, is_active: form.is_active };
        if (form.password) payload.password = form.password;
        await api.put(`/users/${initial.id}`, payload);
      } else {
        await api.post("/users", form);
      }
      onSaved();
    } catch (caught) {
      setErrors(fieldErrors(caught));
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={initial ? `Editar ${initial.username}` : "Nuevo usuario"} onClose={onClose} footer={<><button className="btn btn-outline-secondary" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={busy} onClick={submit}>Guardar</button></>}>
      <FormError message={error} />
      <div className="row g-3">
        <Field name="username" label="Usuario" required className="col-12" value={form.username} onChange={(value) => setForm({ ...form, username: value })} error={errors.username} disabled={Boolean(initial)} />
        <Field name="full_name" label="Nombre y apellido" className="col-12" value={form.full_name} onChange={(value) => setForm({ ...form, full_name: value })} />
        <Field name="email" label="Correo" required type="email" className="col-12" value={form.email} onChange={(value) => setForm({ ...form, email: value })} error={errors.email} hint="Es el dato con el que el usuario inicia sesión." />
        <SelectField name="role" label="Rol" className="col-12" value={form.role} onChange={(value) => setForm({ ...form, role: value as User["role"] })} options={[{ value: "normal", label: "Usuario normal" }, { value: "sysadmin", label: "Administrador del sistema" }]} />
        <Field name="password" label={initial ? "Nueva contraseña (opcional)" : "Contraseña inicial"} required={!initial} type="password" className="col-12" value={form.password} onChange={(value) => setForm({ ...form, password: value })} error={errors.password} hint={initial ? "Si la cambiás, se cierran las sesiones abiertas del usuario." : "Comunicásela al usuario por un canal seguro."} />
        <CheckField name="is_active" label="Usuario activo" checked={form.is_active} onChange={(value) => setForm({ ...form, is_active: value })} />
      </div>
    </Modal>
  );
}

export function UsersPage() {
  const notify = useToast();
  const { user: me } = useAuth();
  const { data, loading, error, reload } = useApi<User[]>("/users");
  const [editing, setEditing] = useState<User | "new" | null>(null);
  const [removing, setRemoving] = useState<User | null>(null);
  const columns: Column<User>[] = [
    { key: "u", header: "Usuario", render: (row) => <>{row.username}{row.id === me?.id && <span className="badge text-bg-light ms-1">vos</span>}</>, primary: true },
    { key: "n", header: "Nombre", render: (row) => row.full_name || "—" },
    { key: "e", header: "Correo", render: (row) => row.email, hideOnMobile: true },
    { key: "r", header: "Rol", render: (row) => <span className={`badge ${row.role === "sysadmin" ? "text-bg-dark" : "text-bg-light"}`}>{row.role === "sysadmin" ? "Administrador" : "Normal"}</span> },
    { key: "s", header: "Estado", render: (row) => <span className={`badge ${row.is_active ? "text-bg-success" : "text-bg-secondary"}`}>{row.is_active ? "Activo" : "Inactivo"}</span> },
    {
      key: "a",
      header: "",
      align: "end",
      render: (row) => (
        <div className="d-flex gap-1 justify-content-end">
          <button className="btn btn-sm btn-outline-secondary" aria-label="Editar usuario" onClick={() => setEditing(row)}><i className="bi bi-pencil" /></button>
          {row.id !== me?.id && <button className="btn btn-sm btn-outline-danger" aria-label="Eliminar usuario" onClick={() => setRemoving(row)}><i className="bi bi-trash" /></button>}
        </div>
      ),
    },
  ];
  return (
    <>
      <PageHeader title="Usuarios" subtitle="Solo un administrador puede crear usuarios. No existe registro público." actions={<button className="btn btn-primary" onClick={() => setEditing("new")}><i className="bi bi-person-plus me-1" />Nuevo usuario</button>} />
      <Card bodyClass="p-0">
        {error ? <div className="p-3"><ErrorBox message={error} onRetry={reload} /></div> : loading && !data ? <Loading /> : <DataTable rows={data ?? []} columns={columns} rowKey={(row) => row.id} />}
      </Card>
      {editing && <UserModal initial={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} onSaved={() => { notify("Usuario guardado."); setEditing(null); reload(); }} />}
      {removing && (
        <ConfirmDialog
          title="Eliminar usuario"
          danger
          confirmLabel="Eliminar"
          message={<>Se eliminará <strong>{removing.username}</strong>. Si tiene acciones registradas en la auditoría, el sistema pedirá desactivarlo en lugar de borrarlo. El último administrador activo no se puede eliminar.</>}
          onCancel={() => setRemoving(null)}
          onConfirm={async () => {
            try {
              await api.delete(`/users/${removing.id}`);
              notify("Usuario eliminado.");
              reload();
            } catch (caught) {
              notify(errorMessage(caught), "danger");
            }
            setRemoving(null);
          }}
        />
      )}
    </>
  );
}

/* ---------- Administración: sistema ---------- */

interface Setting {
  key: string;
  value: string;
  description: string;
}

interface Rule {
  id: number;
  code: string;
  days_before: number | null;
  repeat_every_days: number | null;
  is_active: boolean;
  description: string;
}

interface EmailStatus {
  enabled: boolean;
  auto_send: boolean;
  host: string;
  port: number;
  from_address: string;
  from_name: string;
  bcc: string;
  send_hour: number;
  send_until_hour: number;
  check_minutes: number;
  recent: { id: number; created_at: string | null; to_address: string; subject: string; status: string; automatic: boolean; error: string }[];
}

function EmailSettingsCard() {
  const notify = useToast();
  const status = useApi<EmailStatus>("/settings/email");
  const [testing, setTesting] = useState(false);

  const test = async () => {
    setTesting(true);
    try {
      const { data } = await api.post("/settings/email/test");
      notify(data.detail);
    } catch (caught) {
      notify(errorMessage(caught), "danger");
    } finally {
      setTesting(false);
      status.reload();
    }
  };

  const data = status.data;
  return (
    <Card title={<><i className="bi bi-envelope-paper me-2" />Correo automático a clientes</>}>
      {status.error ? (
        <ErrorBox message={status.error} onRetry={status.reload} />
      ) : !data ? (
        <Loading />
      ) : !data.enabled ? (
        <div className="small">
          <p className="mb-2"><span className="badge text-bg-secondary me-1">Desactivado</span>No hay servidor de correo configurado, así que los avisos se mandan a mano con los botones de WhatsApp y Correo.</p>
          <p className="text-secondary mb-0">Para activarlo hay que completar <code>SMTP_HOST</code>, <code>SMTP_FROM</code>, <code>SMTP_USERNAME</code> y <code>SMTP_PASSWORD</code> en el archivo <code>.env</code> del servidor y reiniciar la aplicación.</p>
        </div>
      ) : (
        <>
          <dl className="kv-grid mb-3">
            <div className="kv-item"><dt>Estado</dt><dd>{data.auto_send ? <span className="badge text-bg-success">Envío automático activo</span> : <span className="badge text-bg-warning">Solo envío manual</span>}</dd></div>
            <div className="kv-item"><dt>Remitente</dt><dd>{data.from_name} &lt;{data.from_address}&gt;</dd></div>
            <div className="kv-item"><dt>Servidor</dt><dd>{data.host}:{data.port}</dd></div>
            <div className="kv-item"><dt>Horario de envío</dt><dd>De {data.send_hour} a {data.send_until_hour} h, revisa cada {data.check_minutes} min</dd></div>
            {data.bcc && <div className="kv-item"><dt>Copia oculta</dt><dd>{data.bcc}</dd></div>}
          </dl>
          <button className="btn btn-outline-primary btn-sm" disabled={testing} onClick={test}>
            {testing ? <span className="spinner-border spinner-border-sm me-1" /> : <i className="bi bi-send me-1" />}
            Enviarme un correo de prueba
          </button>
          <h3 className="fs-6 fw-semibold mt-4 mb-2">Últimos envíos</h3>
          {data.recent.length === 0 ? (
            <p className="small text-secondary mb-0">Todavía no se envió ningún correo.</p>
          ) : (
            <ul className="list-unstyled small mb-0 vstack gap-2">
              {data.recent.map((row) => (
                <li key={row.id} className="border-top pt-2">
                  <div className="d-flex justify-content-between gap-2">
                    <span className="text-truncate">{row.to_address}</span>
                    <span className={`badge ${row.status === "enviado" ? "text-bg-success" : "text-bg-danger"}`}>{row.status === "enviado" ? "Enviado" : "Error"}</span>
                  </div>
                  <div className="text-secondary">{dateTime(row.created_at)} · {row.automatic ? "automático" : "manual"} · {row.subject}</div>
                  {row.error && <div className="text-danger">{row.error}</div>}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Card>
  );
}

export function SystemSettingsPage() {
  const notify = useToast();
  const settings = useApi<Setting[]>("/settings");
  const rules = useApi<Rule[]>("/reminder-rules");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [ruleDrafts, setRuleDrafts] = useState<Record<number, Partial<Rule>>>({});

  const saveSetting = async (key: string) => {
    try {
      await api.put(`/settings/${key}`, { value: drafts[key] });
      notify("Configuración guardada.");
      setDrafts(({ [key]: _, ...rest }) => rest);
      settings.reload();
    } catch (caught) {
      notify(errorMessage(caught), "danger");
    }
  };

  const saveRule = async (rule: Rule) => {
    try {
      await api.put(`/reminder-rules/${rule.id}`, ruleDrafts[rule.id]);
      notify("Regla guardada.");
      setRuleDrafts(({ [rule.id]: _, ...rest }) => rest);
      rules.reload();
    } catch (caught) {
      notify(errorMessage(caught), "danger");
    }
  };

  return (
    <>
      <PageHeader title="Configuración del sistema" subtitle="Valores por defecto para nuevas órdenes y reglas de recordatorios." />
      <div className="row g-3">
        <div className="col-12 col-xl-6">
          <Card title="Parámetros generales">
            {settings.error ? (
              <ErrorBox message={settings.error} onRetry={settings.reload} />
            ) : !settings.data ? (
              <Loading />
            ) : (
              <div className="vstack gap-3">
                {settings.data.map((row) => {
                  const value = drafts[row.key] ?? row.value;
                  return (
                    <div key={row.key}>
                      <label className="form-label mb-1" htmlFor={`s-${row.key}`}>{row.description || row.key}</label>
                      <div className="input-group">
                        <input id={`s-${row.key}`} className="form-control" value={value} onChange={(event) => setDrafts({ ...drafts, [row.key]: event.target.value })} />
                        <button className="btn btn-outline-primary" disabled={drafts[row.key] === undefined} onClick={() => saveSetting(row.key)}>Guardar</button>
                      </div>
                      <div className="form-text">{row.key}</div>
                    </div>
                  );
                })}
              </div>
            )}
            <p className="small text-secondary mt-3 mb-0">Cambiar estos valores no modifica órdenes ni certificados existentes.</p>
          </Card>
          <div className="mt-3">
            <EmailSettingsCard />
          </div>
        </div>
        <div className="col-12 col-xl-6">
          <Card title="Reglas de recordatorios">
            {rules.error ? (
              <ErrorBox message={rules.error} onRetry={rules.reload} />
            ) : !rules.data ? (
              <Loading />
            ) : (
              <div className="vstack gap-3">
                {rules.data.map((rule) => {
                  const draft = { ...rule, ...ruleDrafts[rule.id] };
                  const change = (patch: Partial<Rule>) => setRuleDrafts({ ...ruleDrafts, [rule.id]: { ...ruleDrafts[rule.id], ...patch } });
                  return (
                    <div key={rule.id} className="border rounded p-3">
                      <div className="d-flex justify-content-between align-items-start gap-2 mb-2">
                        <div>
                          <div className="fw-semibold">{rule.description || label(rule.code)}</div>
                          <div className="small text-secondary">{rule.code}</div>
                        </div>
                        <div className="form-check form-switch">
                          <input className="form-check-input" type="checkbox" role="switch" aria-label="Activa" checked={draft.is_active} onChange={(event) => change({ is_active: event.target.checked })} />
                        </div>
                      </div>
                      <div className="row g-2 align-items-end">
                        <Field name={`db-${rule.id}`} label="Días de anticipación" type="number" className="col-5" value={draft.days_before ?? ""} onChange={(value) => change({ days_before: value === "" ? null : Number(value) })} />
                        <Field name={`re-${rule.id}`} label="Repetir cada (días)" type="number" className="col-5" value={draft.repeat_every_days ?? ""} onChange={(value) => change({ repeat_every_days: value === "" ? null : Number(value) })} />
                        <div className="col-2 text-end">
                          <button className="btn btn-outline-primary" disabled={!ruleDrafts[rule.id]} onClick={() => saveRule(rule)} aria-label="Guardar regla"><i className="bi bi-check-lg" /></button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

/* ---------- Administración: auditoría ---------- */

interface AuditRow {
  id: number;
  user_id: number | null;
  created_at: string;
  entity_type: string;
  entity_id: string;
  action: string;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  reason: string;
  impact: string;
}

export function AuditPage() {
  const [filters, setFilters] = useStoredState("filters.audit", { entity_type: "", page: 1 });
  const { data, loading, error, reload } = useApi<Page<AuditRow>>("/audit", filters);
  const users = useApi<User[]>("/users");
  const [open, setOpen] = useState<AuditRow | null>(null);
  const userName = (id: number | null) => (id ? users.data?.find((row) => row.id === id)?.username ?? `#${id}` : "Sistema");
  const columns: Column<AuditRow>[] = [
    { key: "d", header: "Fecha", render: (row) => dateTime(row.created_at), primary: true },
    { key: "u", header: "Usuario", render: (row) => userName(row.user_id) },
    { key: "e", header: "Registro", render: (row) => `${ENTITY_LABEL[row.entity_type] ?? label(row.entity_type)} #${row.entity_id}` },
    { key: "a", header: "Acción", render: (row) => label(row.action) },
    { key: "r", header: "Motivo", render: (row) => row.reason || "—", hideOnMobile: true },
  ];
  return (
    <>
      <PageHeader title="Auditoría" subtitle="Historial de solo lectura. No se puede editar ni borrar desde la aplicación." />
      <Card bodyClass="p-0">
        <div className="filters">
          <input className="form-control" placeholder="Tipo de registro (por ejemplo, certificate)" value={filters.entity_type} onChange={(event) => setFilters({ entity_type: event.target.value, page: 1 })} aria-label="Tipo de registro" />
        </div>
        {error ? <div className="p-3"><ErrorBox message={error} onRetry={reload} /></div> : loading && !data ? <Loading /> : <DataTable rows={data?.items ?? []} columns={columns} rowKey={(row) => row.id} onRowClick={setOpen} />}
        {data && <Pagination page={data.page} pageSize={data.page_size} total={data.total} onChange={(page) => setFilters({ ...filters, page })} />}
      </Card>
      {open && (
        <Modal title={`Registro de auditoría #${open.id}`} size="modal-lg" onClose={() => setOpen(null)}>
          <p className="small text-secondary">{dateTime(open.created_at)} · {userName(open.user_id)} · {label(open.action)}</p>
          {open.reason && <p><strong>Motivo:</strong> {open.reason}</p>}
          {open.impact && <p><strong>Impacto:</strong> {open.impact}</p>}
          <div className="row g-3">
            <div className="col-12 col-md-6">
              <div className="small fw-semibold mb-1">Antes</div>
              <pre className="audit-json">{open.old_values ? JSON.stringify(open.old_values, null, 2) : "—"}</pre>
            </div>
            <div className="col-12 col-md-6">
              <div className="small fw-semibold mb-1">Después</div>
              <pre className="audit-json">{open.new_values ? JSON.stringify(open.new_values, null, 2) : "—"}</pre>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
