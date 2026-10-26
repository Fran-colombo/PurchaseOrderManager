import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../app/auth";
import { useToast } from "../app/toast";
import Attachments from "../components/Attachments";
import { Field, FormError, SelectField } from "../components/form";
import { Card, ConfirmDialog, DataTable, ErrorBox, KeyValues, Loading, Modal, Money, PageHeader, Pagination, StatusBadge, Tabs, type Column } from "../components/ui";
import { useApi, useStoredState } from "../hooks/useApi";
import { api, errorMessage, fieldErrors } from "../services/api";
import type { Certificate, Claim, Client, Page, Payment, Project, PurchaseOrder, Retention, Adjustment } from "../types";
import { date, label } from "../utils/format";

/* ---------- Clientes ---------- */

const EMPTY_CLIENT = { legal_name: "", trade_name: "", cuit: "", contact_name: "", email: "", phone: "", address: "", notes: "", status: "activo" };

function ClientForm({ initial, onClose, onSaved }: { initial?: Client; onClose: () => void; onSaved: (client: Client) => void }) {
  const [form, setForm] = useState<Record<string, string>>(initial ? { ...EMPTY_CLIENT, ...Object.fromEntries(Object.entries(initial).map(([key, value]) => [key, value ?? ""])) } : EMPTY_CLIENT);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (key: string) => (value: string) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    const local: Record<string, string> = {};
    if (form.legal_name.trim().length < 2) local.legal_name = "Ingresá la razón social.";
    setErrors(local);
    if (Object.keys(local).length) return;
    setBusy(true);
    setError("");
    try {
      const payload = { ...form, cuit: form.cuit || null };
      const { data } = initial ? await api.put<Client>(`/clients/${initial.id}`, payload) : await api.post<Client>("/clients", payload);
      onSaved(data);
    } catch (caught) {
      setErrors(fieldErrors(caught));
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={initial ? "Editar cliente" : "Nuevo cliente"}
      onClose={onClose}
      size="modal-lg"
      footer={
        <>
          <button className="btn btn-outline-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" disabled={busy} onClick={() => submit()}>
            {busy && <span className="spinner-border spinner-border-sm me-2" />}Guardar
          </button>
        </>
      }
    >
      <FormError message={error} />
      <form className="row g-3" onSubmit={submit}>
        <Field name="legal_name" label="Razón social" required value={form.legal_name} onChange={set("legal_name")} error={errors.legal_name} />
        <Field name="trade_name" label="Nombre comercial" value={form.trade_name} onChange={set("trade_name")} />
        <Field name="cuit" label="CUIT" value={form.cuit} onChange={set("cuit")} placeholder="30-12345678-9" error={errors.cuit} />
        <SelectField name="status" label="Estado" value={form.status} onChange={set("status")} options={["activo", "inactivo"]} />
        <Field name="contact_name" label="Contacto" value={form.contact_name} onChange={set("contact_name")} />
        <Field name="email" label="Correo electrónico" type="email" value={form.email} onChange={set("email")} hint="Se usa para los avisos de cobro por correo." />
        <Field name="phone" label="Teléfono / WhatsApp" type="tel" value={form.phone} onChange={set("phone")} placeholder="5491123456789" hint="Con código de país y área, sin 0 ni 15. Se usa para los avisos de cobro por WhatsApp." />
        <Field name="address" label="Dirección" value={form.address} onChange={set("address")} />
        <Field name="notes" label="Observaciones" type="textarea" className="col-12" value={form.notes} onChange={set("notes")} />
        <button type="submit" className="d-none" />
      </form>
    </Modal>
  );
}

export function ClientsPage() {
  const [filters, setFilters] = useStoredState("filters.clients", { q: "", status: "", page: 1 });
  const { data, loading, error, reload } = useApi<Page<Client>>("/clients", filters);
  const [editing, setEditing] = useState<Client | "new" | null>(null);
  const notify = useToast();

  const columns: Column<Client>[] = [
    { key: "name", header: "Razón social", render: (row) => row.legal_name, primary: true },
    { key: "trade", header: "Nombre comercial", render: (row) => row.trade_name || "—" },
    { key: "cuit", header: "CUIT", render: (row) => row.cuit || "—" },
    { key: "contact", header: "Contacto", render: (row) => row.contact_name || "—", hideOnMobile: true },
    { key: "status", header: "Estado", render: (row) => <StatusBadge value={row.status} /> },
  ];

  return (
    <>
      <PageHeader title="Clientes" subtitle="Empresas que emiten órdenes de compra." actions={<button className="btn btn-primary" onClick={() => setEditing("new")}><i className="bi bi-plus-lg me-1" />Nuevo cliente</button>} />
      <Card bodyClass="p-0">
        <div className="filters">
          <input className="form-control" placeholder="Buscar por nombre o CUIT" value={filters.q} onChange={(event) => setFilters({ ...filters, q: event.target.value, page: 1 })} aria-label="Buscar" />
          <select className="form-select" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value, page: 1 })} aria-label="Estado">
            <option value="">Todos los estados</option>
            <option value="activo">Activos</option>
            <option value="inactivo">Inactivos</option>
          </select>
        </div>
        {error ? <div className="p-3"><ErrorBox message={error} onRetry={reload} /></div> : loading && !data ? <Loading /> : <DataTable rows={data?.items ?? []} columns={columns} rowKey={(row) => row.id} rowLink={(row) => `/clientes/${row.id}`} />}
        {data && <Pagination page={data.page} pageSize={data.page_size} total={data.total} onChange={(page) => setFilters({ ...filters, page })} />}
      </Card>
      {editing && (
        <ClientForm
          initial={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            notify("Cliente guardado.");
            setEditing(null);
            reload();
          }}
        />
      )}
    </>
  );
}

export function ClientDetailPage() {
  const { id } = useParams();
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const notify = useToast();
  const { data: client, loading, error, reload } = useApi<Client>(`/clients/${id}`);
  const projects = useApi<Page<Project>>("/projects", { client_id: id, page_size: 100 });
  const orders = useApi<Page<PurchaseOrder>>("/purchase-orders", { client_id: id, page_size: 100 });
  const retentions = useApi<Page<Retention>>("/retentions", { client_id: id, page_size: 100 });
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (loading && !client) return <Loading />;
  if (error || !client) return <ErrorBox message={error ?? "No se encontró el cliente."} />;
  const pendingByCurrency = (retentions.data?.items ?? []).reduce<Record<string, number>>((acc, row) => {
    acc[row.currency] = (acc[row.currency] ?? 0) + Number(row.pending_amount);
    return acc;
  }, {});

  return (
    <>
      <PageHeader
        back={{ to: "/clientes", label: "Clientes" }}
        title={client.legal_name}
        subtitle={<>{client.cuit || "Sin CUIT"} · <StatusBadge value={client.status} /></>}
        actions={
          <>
            <button className="btn btn-outline-secondary" onClick={() => setEditing(true)}><i className="bi bi-pencil me-1" />Editar</button>
            {isAdmin && <button className="btn btn-outline-danger" onClick={() => setDeleting(true)}><i className="bi bi-trash me-1" />Eliminar</button>}
          </>
        }
      />
      <Card title="Datos del cliente">
        <KeyValues
          items={[
            { label: "Nombre comercial", value: client.trade_name || "—" },
            { label: "Contacto", value: client.contact_name || "—" },
            { label: "Correo", value: client.email || "—" },
            { label: "Teléfono", value: client.phone || "—" },
            { label: "Dirección", value: client.address || "—" },
            { label: "Cauciones por recuperar", value: Object.keys(pendingByCurrency).length ? Object.entries(pendingByCurrency).map(([code, amount]) => <div key={code}><Money value={amount} currency={code} /></div>) : "—" },
          ]}
        />
        {client.notes && <p className="mt-3 mb-0 text-secondary">{client.notes}</p>}
      </Card>
      <div className="row g-3">
        <div className="col-12 col-lg-6">
          <Card title="Obras" bodyClass="p-0">
            <DataTable rows={projects.data?.items ?? []} rowKey={(row) => row.id} rowLink={(row) => `/obras/${row.id}`} columns={[{ key: "n", header: "Obra", render: (row) => row.name, primary: true }, { key: "s", header: "Estado", render: (row) => <StatusBadge value={row.status} /> }]} />
          </Card>
        </div>
        <div className="col-12 col-lg-6">
          <Card title="Órdenes de compra" bodyClass="p-0">
            <DataTable rows={orders.data?.items ?? []} rowKey={(row) => row.id} rowLink={(row) => `/ordenes/${row.id}`} columns={[{ key: "n", header: "OC", render: (row) => row.client_po_number, primary: true }, { key: "p", header: "Obra", render: (row) => row.project_name }, { key: "a", header: "Contratado", align: "end", render: (row) => <Money value={row.contracted_amount} currency={row.currency} /> }]} />
          </Card>
        </div>
      </div>
      <Attachments entityType="client" entityId={client.id} />
      {editing && <ClientForm initial={client} onClose={() => setEditing(false)} onSaved={() => { notify("Cliente actualizado."); setEditing(false); reload(); }} />}
      {deleting && (
        <ConfirmDialog
          title="Eliminar cliente"
          danger
          confirmLabel="Eliminar"
          message="Solo se puede eliminar un cliente sin obras, órdenes ni pagos. Si tiene relaciones, el sistema bloquea la operación."
          onCancel={() => setDeleting(false)}
          onConfirm={async () => {
            try {
              await api.delete(`/clients/${client.id}`);
              notify("Cliente eliminado.");
              navigate("/clientes");
            } catch (caught) {
              notify(errorMessage(caught), "danger");
              setDeleting(false);
            }
          }}
        />
      )}
    </>
  );
}

/* ---------- Obras ---------- */

const EMPTY_PROJECT = { client_id: "", name: "", location: "", internal_code: "", start_date: "", estimated_end_date: "", status: "planificacion", internal_owner: "", notes: "" };

export function ClientPicker({ value, onChange, error, required = true, className }: { value: string; onChange: (value: string) => void; error?: string; required?: boolean; className?: string }) {
  const { data } = useApi<Page<Client>>("/clients", { page_size: 200 });
  return <SelectField name="client_id" label="Cliente" required={required} value={value} onChange={onChange} error={error} placeholder="Elegí un cliente" className={className} options={(data?.items ?? []).map((client) => ({ value: client.id, label: client.legal_name }))} />;
}

function ProjectForm({ initial, onClose, onSaved }: { initial?: Project; onClose: () => void; onSaved: (project: Project) => void }) {
  const { meta } = useAuth();
  const [form, setForm] = useState<Record<string, string>>(
    initial ? { ...EMPTY_PROJECT, ...Object.fromEntries(Object.entries(initial).map(([key, value]) => [key, value === null || value === undefined ? "" : String(value)])) } : EMPTY_PROJECT,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (key: string) => (value: string) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async () => {
    const local: Record<string, string> = {};
    if (!initial && !form.client_id) local.client_id = "Elegí el cliente.";
    if (form.name.trim().length < 2) local.name = "Ingresá el nombre de la obra.";
    setErrors(local);
    if (Object.keys(local).length) return;
    setBusy(true);
    setError("");
    const payload: Record<string, unknown> = { ...form, client_id: Number(form.client_id) };
    for (const key of ["start_date", "estimated_end_date"]) if (!payload[key]) payload[key] = null;
    delete payload.actual_end_date;
    try {
      const { data } = initial ? await api.put<Project>(`/projects/${initial.id}`, payload) : await api.post<Project>("/projects", payload);
      onSaved(data);
    } catch (caught) {
      setErrors(fieldErrors(caught));
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={initial ? "Editar obra" : "Nueva obra"} onClose={onClose} size="modal-lg" footer={<><button className="btn btn-outline-secondary" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={busy} onClick={submit}>Guardar</button></>}>
      <FormError message={error} />
      <div className="row g-3">
        {!initial && <ClientPicker value={form.client_id} onChange={set("client_id")} error={errors.client_id} />}
        <Field name="name" label="Nombre de la obra" required value={form.name} onChange={set("name")} error={errors.name} />
        <Field name="internal_code" label="Código interno" value={form.internal_code} onChange={set("internal_code")} />
        <SelectField name="status" label="Estado" value={form.status} onChange={set("status")} options={meta?.project_statuses ?? ["planificacion"]} />
        <Field name="location" label="Dirección o ubicación" value={form.location} onChange={set("location")} />
        <Field name="internal_owner" label="Responsable interno" value={form.internal_owner} onChange={set("internal_owner")} />
        <Field name="start_date" label="Fecha de inicio" type="date" value={form.start_date} onChange={set("start_date")} />
        <Field name="estimated_end_date" label="Fecha estimada de finalización" type="date" value={form.estimated_end_date} onChange={set("estimated_end_date")} hint="Es solo una estimación. No inicia el plazo de las cauciones." />
        <Field name="notes" label="Observaciones" type="textarea" className="col-12" value={form.notes} onChange={set("notes")} />
      </div>
      {initial && <p className="small text-secondary mt-3 mb-0">La fecha real de finalización se registra desde «Registrar finalización», para que quede trazada y recalcule las cauciones.</p>}
    </Modal>
  );
}

export function ProjectsPage() {
  const { meta } = useAuth();
  const [filters, setFilters] = useStoredState("filters.projects", { q: "", status: "", page: 1 });
  const { data, loading, error, reload } = useApi<Page<Project>>("/projects", filters);
  const [creating, setCreating] = useState(false);
  const notify = useToast();
  const navigate = useNavigate();
  const columns: Column<Project>[] = [
    { key: "n", header: "Obra", render: (row) => row.name, primary: true },
    { key: "c", header: "Cliente", render: (row) => row.client_name },
    { key: "code", header: "Código", render: (row) => row.internal_code || "—", hideOnMobile: true },
    { key: "e", header: "Fin estimado", render: (row) => date(row.estimated_end_date) },
    { key: "r", header: "Fin real", render: (row) => date(row.actual_end_date) },
    { key: "s", header: "Estado", render: (row) => <StatusBadge value={row.status} /> },
  ];
  return (
    <>
      <PageHeader title="Obras" actions={<button className="btn btn-primary" onClick={() => setCreating(true)}><i className="bi bi-plus-lg me-1" />Nueva obra</button>} />
      <Card bodyClass="p-0">
        <div className="filters">
          <input className="form-control" placeholder="Buscar obra o código" value={filters.q} onChange={(event) => setFilters({ ...filters, q: event.target.value, page: 1 })} aria-label="Buscar" />
          <select className="form-select" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value, page: 1 })} aria-label="Estado">
            <option value="">Todos los estados</option>
            {(meta?.project_statuses ?? []).map((status) => <option key={status} value={status}>{label(status)}</option>)}
          </select>
        </div>
        {error ? <div className="p-3"><ErrorBox message={error} onRetry={reload} /></div> : loading && !data ? <Loading /> : <DataTable rows={data?.items ?? []} columns={columns} rowKey={(row) => row.id} rowLink={(row) => `/obras/${row.id}`} />}
        {data && <Pagination page={data.page} pageSize={data.page_size} total={data.total} onChange={(page) => setFilters({ ...filters, page })} />}
      </Card>
      {creating && <ProjectForm onClose={() => setCreating(false)} onSaved={(project) => { notify("Obra creada."); navigate(`/obras/${project.id}`); }} />}
    </>
  );
}

export function MilestoneDialog({ projectId, purchaseOrderId, scopes, onClose, onSaved }: { projectId: number; purchaseOrderId?: number; scopes?: { id: number; name: string }[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ scope_type: purchaseOrderId ? "orden" : "obra", effective_date: "", contract_scope_id: "", notes: "", reason: "" });
  const [preview, setPreview] = useState<{ retention_id: number; pending_amount: string; previous_release_date: string | null; new_release_date: string | null }[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const notify = useToast();
  const set = (key: string) => (value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setPreview(null);
  };
  const payload = () => ({
    scope_type: form.scope_type,
    project_id: projectId,
    purchase_order_id: form.scope_type === "obra" ? null : purchaseOrderId ?? null,
    contract_scope_id: form.scope_type === "alcance" ? Number(form.contract_scope_id) || null : null,
    effective_date: form.effective_date,
    notes: form.notes,
    reason: form.reason || form.notes,
  });

  const review = async () => {
    if (!form.effective_date) {
      setError("Indicá la fecha efectiva de finalización.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const { data } = await api.post("/milestones/preview", payload());
      setPreview(data.affected);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (preview && preview.length && !(form.reason || form.notes).trim()) {
      setError("Indicá una observación o motivo: cambia el vencimiento de cauciones.");
      return;
    }
    setBusy(true);
    try {
      await api.post("/milestones", { ...payload(), confirm: true });
      notify("Finalización registrada. Se recalcularon las fechas de liberación.");
      onSaved();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Registrar finalización"
      onClose={onClose}
      size="modal-lg"
      footer={
        <>
          <button className="btn btn-outline-secondary" onClick={onClose}>Cancelar</button>
          {preview === null ? (
            <button className="btn btn-primary" disabled={busy} onClick={review}>Revisar impacto</button>
          ) : (
            <button className="btn btn-primary" disabled={busy} onClick={confirm}>Confirmar finalización</button>
          )}
        </>
      }
    >
      <FormError message={error} />
      <p className="text-secondary small">La fecha real de finalización inicia el plazo de liberación de las cauciones que dependen de este hito. Antes de confirmar se muestran las retenciones afectadas.</p>
      <div className="row g-3">
        <SelectField
          name="scope_type"
          label="Qué terminó"
          value={form.scope_type}
          onChange={set("scope_type")}
          options={[
            { value: "obra", label: "Toda la obra" },
            ...(purchaseOrderId ? [{ value: "orden", label: "Esta orden de compra" }, { value: "contractual", label: "Fecha contractual de esta orden" }] : []),
            ...(purchaseOrderId && scopes?.length ? [{ value: "alcance", label: "Un conjunto de trabajos" }] : []),
          ]}
        />
        {form.scope_type === "alcance" && <SelectField name="contract_scope_id" label="Alcance" value={form.contract_scope_id} onChange={set("contract_scope_id")} placeholder="Elegí el alcance" options={(scopes ?? []).map((scope) => ({ value: scope.id, label: scope.name }))} />}
        <Field name="effective_date" label="Fecha efectiva de finalización" type="date" required value={form.effective_date} onChange={set("effective_date")} />
        <Field name="notes" label="Observaciones / acta" type="textarea" className="col-12" value={form.notes} onChange={set("notes")} placeholder="Ej.: Acta de recepción provisoria firmada" />
      </div>
      {preview !== null && (
        <div className="mt-3">
          <h3 className="fs-6 fw-semibold">Retenciones afectadas ({preview.length})</h3>
          {preview.length === 0 ? (
            <p className="small text-secondary mb-0">Ninguna retención depende de este hito todavía. Se registra igual para futuras retenciones.</p>
          ) : (
            <div className="table-responsive">
              <table className="table table-sm">
                <thead><tr><th>Retención</th><th className="text-end">Pendiente</th><th>Liberación anterior</th><th>Nueva liberación</th></tr></thead>
                <tbody>
                  {preview.map((row) => (
                    <tr key={row.retention_id}><td>#{row.retention_id}</td><td className="text-end"><Money value={row.pending_amount} /></td><td>{row.previous_release_date ? date(row.previous_release_date) : "Pendiente"}</td><td className="fw-semibold">{date(row.new_release_date)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

export function ProjectDetailPage() {
  const { id } = useParams();
  const projectId = Number(id);
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const notify = useToast();
  const { data: project, loading, error, reload } = useApi<Project & { certificate_count: number }>(`/projects/${id}`);
  const certificates = useApi<Page<Certificate>>("/certificates", { project_id: id, page_size: 100 });
  const retentions = useApi<Page<Retention>>("/retentions", { project_id: id, page_size: 100 });
  const adjustments = useApi<Page<Adjustment>>("/adjustments", { page_size: 200 });
  const claims = useApi<Page<Claim>>("/claims", { page_size: 200 });
  const payments = useApi<Page<Payment>>(project ? "/payments" : null, { client_id: project?.client_id, page_size: 100 });
  const history = useApi<{ items: { id: number; created_at: string; action: string; entity_type: string; reason: string }[] }>(isAdmin ? "/audit" : null, { entity_type: "project" });
  const [tab, setTab] = useState("resumen");
  const [editing, setEditing] = useState(false);
  const [milestone, setMilestone] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (loading && !project) return <Loading />;
  if (error || !project) return <ErrorBox message={error ?? "No se encontró la obra."} />;

  const orders = project.purchase_orders ?? [];
  const orderIds = new Set(orders.map((order) => order.id));
  const projectAdjustments = (adjustments.data?.items ?? []).filter((row) => row.project_id === projectId);
  const projectClaims = (claims.data?.items ?? []).filter((row) => row.project_id === projectId);
  const certs = certificates.data?.items ?? [];
  const rets = retentions.data?.items ?? [];

  const sumBy = <T,>(rows: T[], currency: (row: T) => string, amount: (row: T) => string) =>
    rows.reduce<Record<string, number>>((acc, row) => {
      acc[currency(row)] = (acc[currency(row)] ?? 0) + Number(amount(row));
      return acc;
    }, {});
  const active = certs.filter((row) => !["anulado", "borrador"].includes(row.status));
  const contracted = sumBy(orders, (row) => row.currency, (row) => row.contracted_amount);
  const certified = sumBy(active, (row) => row.currency, (row) => row.base_amount);
  const pending = sumBy(active.filter((row) => ["facturado", "parcialmente_pagado", "pagado"].includes(row.status)), (row) => row.currency, (row) => row.pending_amount);
  const retentionPending = sumBy(rets.filter((row) => row.status !== "anulada"), (row) => row.currency, (row) => row.pending_amount);
  const show = (values: Record<string, number>) => (Object.keys(values).length ? Object.entries(values).map(([code, value]) => <div key={code}><Money value={value} currency={code} /></div>) : "—");

  return (
    <>
      <PageHeader
        back={{ to: "/obras", label: "Obras" }}
        title={project.name}
        subtitle={<><Link to={`/clientes/${project.client_id}`}>{project.client_name}</Link> · <StatusBadge value={project.status} /></>}
        actions={
          <>
            <button className="btn btn-primary" onClick={() => setMilestone(true)}><i className="bi bi-flag me-1" />Registrar finalización</button>
            <button className="btn btn-outline-secondary" onClick={() => setEditing(true)}><i className="bi bi-pencil me-1" />Editar</button>
            {isAdmin && <button className="btn btn-outline-danger" onClick={() => setDeleting(true)} aria-label="Eliminar obra"><i className="bi bi-trash" /></button>}
          </>
        }
      />
      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: "resumen", label: "Resumen" },
          { key: "ordenes", label: "Órdenes", count: orders.length },
          { key: "certificados", label: "Certificados", count: certs.length },
          { key: "reajustes", label: "Reajustes", count: projectAdjustments.length },
          { key: "pagos", label: "Pagos" },
          { key: "retenciones", label: "Retenciones", count: rets.length },
          { key: "reclamos", label: "Reclamos", count: projectClaims.length },
          { key: "documentos", label: "Documentación" },
          ...(isAdmin ? [{ key: "historial", label: "Historial" }] : []),
        ]}
      />
      {tab === "resumen" && (
        <>
          <Card title="Resumen financiero">
            <KeyValues
              items={[
                { label: "Contratado", value: show(contracted), hint: "Suma de las órdenes de compra, sin reajustes." },
                { label: "Certificado (base)", value: show(certified) },
                { label: "Pendiente de cobro", value: show(pending) },
                { label: "Cauciones por recuperar", value: show(retentionPending) },
              ]}
            />
          </Card>
          <Card title="Datos de la obra">
            <KeyValues
              items={[
                { label: "Código interno", value: project.internal_code || "—" },
                { label: "Ubicación", value: project.location || "—" },
                { label: "Responsable", value: project.internal_owner || "—" },
                { label: "Inicio", value: date(project.start_date) },
                { label: "Fin estimado", value: date(project.estimated_end_date) },
                { label: "Fin real", value: project.actual_end_date ? date(project.actual_end_date) : <span className="text-warning">Sin registrar</span> },
              ]}
            />
            {project.notes && <p className="mt-3 mb-0 text-secondary">{project.notes}</p>}
          </Card>
        </>
      )}
      {tab === "ordenes" && (
        <Card bodyClass="p-0" actions={<Link className="btn btn-sm btn-primary" to={`/ordenes?nueva=1&project=${project.id}`}>Nueva orden</Link>} title="Órdenes de compra">
          <DataTable rows={orders} rowKey={(row) => row.id} rowLink={(row) => `/ordenes/${row.id}`} columns={[{ key: "n", header: "OC", render: (row) => row.client_po_number, primary: true }, { key: "s", header: "Estado", render: (row) => <StatusBadge value={row.status} /> }, { key: "r", header: "Retención", render: (row) => `${Number(row.retention_percent)}% · ${label(row.retention_base_type)}` }, { key: "a", header: "Contratado", align: "end", render: (row) => <Money value={row.contracted_amount} currency={row.currency} /> }]} />
        </Card>
      )}
      {tab === "certificados" && <Card bodyClass="p-0"><CertificateMiniTable rows={certs} /></Card>}
      {tab === "reajustes" && (
        <Card bodyClass="p-0">
          <DataTable rows={projectAdjustments} rowKey={(row) => row.id} rowLink={(row) => `/reajustes/${row.id}`} columns={[{ key: "i", header: "Reajuste", render: (row) => `#${row.id} · ${label(row.method)}`, primary: true }, { key: "s", header: "Estado", render: (row) => <StatusBadge value={row.status} /> }, { key: "a", header: "Importe", align: "end", render: (row) => <Money value={row.adjustment_amount} /> }]} />
        </Card>
      )}
      {tab === "pagos" && (
        <Card bodyClass="p-0">
          <p className="small text-secondary px-3 pt-3 mb-2">Pagos del cliente. Abrí cada pago para ver a qué certificados se aplicó.</p>
          <DataTable rows={payments.data?.items ?? []} rowKey={(row) => row.id} rowLink={(row) => `/pagos/${row.id}`} columns={[{ key: "d", header: "Fecha", render: (row) => date(row.payment_date), primary: true }, { key: "r", header: "Referencia", render: (row) => row.reference || "—" }, { key: "s", header: "Estado", render: (row) => <StatusBadge value={row.status} /> }, { key: "t", header: "Importe", align: "end", render: (row) => <Money value={row.total_amount} currency={row.currency} /> }]} />
        </Card>
      )}
      {tab === "retenciones" && <Card bodyClass="p-0"><RetentionMiniTable rows={rets} /></Card>}
      {tab === "reclamos" && (
        <Card bodyClass="p-0">
          <DataTable rows={projectClaims} rowKey={(row) => row.id} rowLink={(row) => `/reclamos/${row.id}`} columns={[{ key: "d", header: "Fecha", render: (row) => date(row.claim_date), primary: true }, { key: "c", header: "Canal", render: (row) => label(row.channel) }, { key: "s", header: "Estado", render: (row) => <StatusBadge value={row.status} /> }, { key: "a", header: "Reclamado", align: "end", render: (row) => <Money value={row.amount_claimed} currency={row.currency} /> }]} />
        </Card>
      )}
      {tab === "documentos" && <Attachments entityType="project" entityId={project.id} />}
      {tab === "historial" && (
        <Card bodyClass="p-0">
          <DataTable rows={(history.data?.items ?? []).filter((row) => true)} rowKey={(row) => row.id} columns={[{ key: "d", header: "Fecha", render: (row) => new Date(row.created_at).toLocaleString("es-AR"), primary: true }, { key: "a", header: "Acción", render: (row) => label(row.action) }, { key: "r", header: "Motivo", render: (row) => row.reason || "—" }]} />
        </Card>
      )}
      {editing && <ProjectForm initial={project} onClose={() => setEditing(false)} onSaved={() => { notify("Obra actualizada."); setEditing(false); reload(); }} />}
      {milestone && <MilestoneDialog projectId={project.id} onClose={() => setMilestone(false)} onSaved={() => { setMilestone(false); reload(); retentions.reload(); }} />}
      {deleting && (
        <ConfirmDialog
          title="Eliminar obra"
          danger
          confirmLabel="Eliminar"
          message="Solo se puede eliminar una obra sin órdenes de compra."
          onCancel={() => setDeleting(false)}
          onConfirm={async () => {
            try {
              await api.delete(`/projects/${project.id}`);
              notify("Obra eliminada.");
              navigate("/obras");
            } catch (caught) {
              notify(errorMessage(caught), "danger");
              setDeleting(false);
            }
          }}
        />
      )}
      {orderIds.size === 0 && null}
    </>
  );
}

export function CertificateMiniTable({ rows }: { rows: Certificate[] }) {
  return (
    <DataTable
      rows={rows}
      rowKey={(row) => row.id}
      rowLink={(row) => `/certificados/${row.id}`}
      columns={[
        { key: "n", header: "Certificado", render: (row) => row.client_number, primary: true },
        { key: "d", header: "Emisión", render: (row) => date(row.issue_date) },
        { key: "s", header: "Estado", render: (row) => <StatusBadge value={row.status} /> },
        { key: "b", header: "Base", align: "end", render: (row) => <Money value={row.base_amount} currency={row.currency} /> },
        { key: "net", header: "Neto", align: "end", render: (row) => <Money value={row.net_amount} currency={row.currency} /> },
        { key: "p", header: "Pendiente", align: "end", render: (row) => (row.status === "anulado" ? "—" : <Money value={row.pending_amount} currency={row.currency} />) },
      ]}
    />
  );
}

export function RetentionMiniTable({ rows }: { rows: Retention[] }) {
  return (
    <DataTable
      rows={rows}
      rowKey={(row) => row.id}
      rowLink={(row) => `/retenciones/${row.id}`}
      columns={[
        { key: "c", header: "Certificado", render: (row) => row.certificate_number, primary: true },
        { key: "s", header: "Estado", render: (row) => <StatusBadge value={row.status} /> },
        { key: "r", header: "Retenido", align: "end", render: (row) => <Money value={row.retained_amount} currency={row.currency} /> },
        { key: "p", header: "Pendiente", align: "end", render: (row) => <Money value={row.pending_amount} currency={row.currency} /> },
        { key: "l", header: "Liberación", render: (row) => (row.expected_release_date ? date(row.expected_release_date) : <span className="text-secondary">Pendiente de fecha</span>) },
      ]}
    />
  );
}
