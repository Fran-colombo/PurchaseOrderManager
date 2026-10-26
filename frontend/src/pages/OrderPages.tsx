import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useAuth } from "../app/auth";
import { useToast } from "../app/toast";
import Attachments from "../components/Attachments";
import { CheckField, Field, FormError, SelectField } from "../components/form";
import { Card, ConfirmDialog, DataTable, ErrorBox, KeyValues, Loading, Modal, Money, PageHeader, Pagination, StatusBadge, type Column } from "../components/ui";
import { useApi, useStoredState } from "../hooks/useApi";
import { api, errorBody, errorMessage, fieldErrors } from "../services/api";
import type { Certificate, Page, PoItem, Project, PurchaseOrder, Retention } from "../types";
import { compactMoney, date, label, money, quantity } from "../utils/format";
import { CertificateMiniTable, ClientPicker, MilestoneDialog, RetentionMiniTable } from "./ContractPages";

const EMPTY_ORDER = {
  client_po_number: "",
  client_id: "",
  project_id: "",
  issue_date: "",
  acceptance_date: "",
  currency: "ARS",
  payment_terms: "",
  payment_term_days: "",
  retention_percent: "5",
  retention_base_type: "solo_base",
  retention_concepts: [] as string[],
  release_trigger: "finalizacion_orden",
  release_days: "180",
  contractual_start_date: "",
  explicit_release_date: "",
  release_scope_id: "",
  status: "vigente",
  notes: "",
};

type OrderForm = typeof EMPTY_ORDER;

function RetentionSettings({ form, set, setConcepts, scopes }: { form: OrderForm; set: (key: keyof OrderForm) => (value: string) => void; setConcepts: (values: string[]) => void; scopes?: { id: number; name: string }[] }) {
  const { meta } = useAuth();
  const percent = Number(form.retention_percent || 0);
  const example = (() => {
    const base = 1000000;
    const cac = 200000;
    let subject = base;
    if (form.retention_base_type === "base_mas_cac_aprobado" || form.retention_base_type === "bruto_total") subject = base + cac;
    if (form.retention_base_type === "personalizada") subject = (form.retention_concepts.includes("base") ? base : 0) + (form.retention_concepts.some((concept) => concept.startsWith("cac")) ? cac : 0);
    return { base, cac, subject, retained: (subject * percent) / 100 };
  })();
  return (
    <>
      <div className="col-12">
        <h3 className="fs-6 fw-semibold mt-2 mb-0">Retención de caución</h3>
        <div className="form-text">Cada orden define su propia base. El porcentaje no se aplica al CAC salvo que el contrato lo incluya.</div>
      </div>
      <Field name="retention_percent" label="Porcentaje retenido" type="number" step="0.01" min="0" value={form.retention_percent} onChange={set("retention_percent")} className="col-6 col-md-3" />
      <SelectField name="retention_base_type" label="Base de la retención" value={form.retention_base_type} onChange={set("retention_base_type")} options={meta?.retention_bases ?? []} className="col-12 col-md-9" />
      {form.retention_base_type === "personalizada" && (
        <div className="col-12">
          <div className="d-flex flex-wrap gap-3">
            {(meta?.retention_concepts ?? []).map((concept) => (
              <CheckField
                key={concept.value}
                name={`concept-${concept.value}`}
                label={concept.label}
                className=""
                checked={form.retention_concepts.includes(concept.value)}
                onChange={(checked) => setConcepts(checked ? [...form.retention_concepts, concept.value] : form.retention_concepts.filter((value) => value !== concept.value))}
              />
            ))}
          </div>
        </div>
      )}
      <div className="col-12">
        <div className="formula-box small">
          <div className="fw-semibold mb-1">Ejemplo con esta configuración</div>
          <div className="formula-line"><span>Importe base</span><span className="money">{money(example.base)}</span></div>
          <div className="formula-line"><span>Reajuste CAC aprobado</span><span className="money">{money(example.cac)}</span></div>
          <div className="formula-line"><span>Base sujeta a retención</span><span className="money">{money(example.subject)}</span></div>
          <div className="formula-line total"><span>Retención del {percent}%</span><span className="money">{money(example.retained)}</span></div>
        </div>
      </div>
      <div className="col-12">
        <h3 className="fs-6 fw-semibold mt-2 mb-0">Liberación de la caución</h3>
        <div className="form-text">El plazo no se cuenta desde la fecha de cada certificado, salvo que el contrato lo diga.</div>
      </div>
      <SelectField name="release_trigger" label="Evento que inicia el plazo" value={form.release_trigger} onChange={set("release_trigger")} options={meta?.release_triggers ?? []} className="col-12 col-md-8" />
      <Field name="release_days" label="Plazo (días corridos)" type="number" min="0" value={form.release_days} onChange={set("release_days")} className="col-6 col-md-4" />
      {form.release_trigger === "fecha_contractual" && <Field name="contractual_start_date" label="Fecha contractual de inicio del plazo" type="date" value={form.contractual_start_date} onChange={set("contractual_start_date")} />}
      {form.release_trigger === "finalizacion_alcance" && (
        <SelectField name="release_scope_id" label="Alcance que debe terminar" value={form.release_scope_id} onChange={set("release_scope_id")} placeholder={scopes?.length ? "Elegí el alcance" : "Primero cargá un alcance en la orden"} options={(scopes ?? []).map((scope) => ({ value: scope.id, label: scope.name }))} />
      )}
      <Field name="explicit_release_date" label="Fecha de liberación pactada (opcional)" type="date" value={form.explicit_release_date} onChange={set("explicit_release_date")} hint="Si el contrato fija una fecha exacta, reemplaza al cálculo." />
    </>
  );
}

function orderPayload(form: OrderForm) {
  const payload: Record<string, unknown> = { ...form };
  for (const key of ["issue_date", "acceptance_date", "contractual_start_date", "explicit_release_date"]) if (!payload[key]) payload[key] = null;
  payload.payment_term_days = form.payment_term_days ? Number(form.payment_term_days) : null;
  payload.release_days = Number(form.release_days || 180);
  payload.release_scope_id = form.release_scope_id ? Number(form.release_scope_id) : null;
  payload.client_id = Number(form.client_id);
  payload.project_id = Number(form.project_id);
  return payload;
}

function NewOrderModal({ projectId, onClose, onSaved }: { projectId?: string; onClose: () => void; onSaved: (order: PurchaseOrder) => void }) {
  const { meta } = useAuth();
  const [form, setForm] = useState<OrderForm>({ ...EMPTY_ORDER, project_id: projectId ?? "" });
  const projects = useApi<Page<Project>>("/projects", { client_id: form.client_id || undefined, page_size: 200 });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (key: keyof OrderForm) => (value: string) => setForm((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    if (projectId && projects.data && !form.client_id) {
      const project = projects.data.items.find((row) => String(row.id) === projectId);
      if (project) setForm((current) => ({ ...current, client_id: String(project.client_id) }));
    }
  }, [projectId, projects.data, form.client_id]);

  const submit = async () => {
    const local: Record<string, string> = {};
    if (!form.client_po_number.trim()) local.client_po_number = "Ingresá el número de OC del cliente.";
    if (!form.client_id) local.client_id = "Elegí el cliente.";
    if (!form.project_id) local.project_id = "Elegí la obra.";
    setErrors(local);
    if (Object.keys(local).length) return;
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post<PurchaseOrder>("/purchase-orders", orderPayload(form));
      onSaved(data);
    } catch (caught) {
      setErrors(fieldErrors(caught));
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Nueva orden de compra" size="modal-xl" onClose={onClose} footer={<><button className="btn btn-outline-secondary" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={busy} onClick={submit}>Crear orden</button></>}>
      <FormError message={error} />
      <div className="row g-3">
        <Field name="client_po_number" label="Número de OC del cliente" required value={form.client_po_number} onChange={set("client_po_number")} error={errors.client_po_number} />
        <SelectField name="currency" label="Moneda" value={form.currency} onChange={set("currency")} options={(meta?.currencies ?? ["ARS"]).map((code) => ({ value: code, label: code }))} />
        <ClientPicker value={form.client_id} onChange={(value) => setForm((current) => ({ ...current, client_id: value, project_id: "" }))} error={errors.client_id} />
        <SelectField name="project_id" label="Obra" required value={form.project_id} onChange={set("project_id")} error={errors.project_id} placeholder={form.client_id ? "Elegí la obra" : "Primero elegí el cliente"} options={(projects.data?.items ?? []).map((project) => ({ value: project.id, label: project.name }))} />
        <Field name="issue_date" label="Fecha de emisión" type="date" value={form.issue_date} onChange={set("issue_date")} />
        <Field name="acceptance_date" label="Fecha de aceptación" type="date" value={form.acceptance_date} onChange={set("acceptance_date")} />
        <Field name="payment_terms" label="Condiciones de pago" value={form.payment_terms} onChange={set("payment_terms")} />
        <Field name="payment_term_days" label="Plazo de pago (días)" type="number" min="0" value={form.payment_term_days} onChange={set("payment_term_days")} />
        <RetentionSettings form={form} set={set} setConcepts={(values) => setForm((current) => ({ ...current, retention_concepts: values }))} />
        <Field name="notes" label="Observaciones" type="textarea" className="col-12" value={form.notes} onChange={set("notes")} />
      </div>
      <p className="small text-secondary mt-3 mb-0">Después de crearla vas a poder cargar los rubros, cantidades y precios.</p>
    </Modal>
  );
}

export function OrdersPage() {
  const [params, setParams] = useSearchParams();
  const [filters, setFilters] = useStoredState("filters.orders", { q: "", status: "", page: 1 });
  const { data, loading, error, reload } = useApi<Page<PurchaseOrder>>("/purchase-orders", filters);
  const navigate = useNavigate();
  const notify = useToast();
  const creating = params.get("nueva") === "1";
  const columns: Column<PurchaseOrder>[] = [
    { key: "n", header: "Orden", render: (row) => row.client_po_number, primary: true },
    { key: "c", header: "Cliente", render: (row) => row.client_name },
    { key: "p", header: "Obra", render: (row) => row.project_name },
    { key: "r", header: "Retención", render: (row) => `${Number(row.retention_percent)}% · ${label(row.retention_base_type)}`, hideOnMobile: true },
    { key: "s", header: "Estado", render: (row) => <StatusBadge value={row.status} /> },
    { key: "a", header: "Contratado", align: "end", render: (row) => <Money value={row.contracted_amount} currency={row.currency} /> },
  ];
  return (
    <>
      <PageHeader title="Órdenes de compra" actions={<button className="btn btn-primary" onClick={() => setParams({ nueva: "1" })}><i className="bi bi-plus-lg me-1" />Nueva orden</button>} />
      <Card bodyClass="p-0">
        <div className="filters">
          <input className="form-control" placeholder="Buscar número de OC" value={filters.q} onChange={(event) => setFilters({ ...filters, q: event.target.value, page: 1 })} aria-label="Buscar" />
          <select className="form-select" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value, page: 1 })} aria-label="Estado">
            <option value="">Todos los estados</option>
            {["borrador", "vigente", "finalizada", "cancelada"].map((status) => <option key={status} value={status}>{label(status)}</option>)}
          </select>
        </div>
        {error ? <div className="p-3"><ErrorBox message={error} onRetry={reload} /></div> : loading && !data ? <Loading /> : <DataTable rows={data?.items ?? []} columns={columns} rowKey={(row) => row.id} rowLink={(row) => `/ordenes/${row.id}`} />}
        {data && <Pagination page={data.page} pageSize={data.page_size} total={data.total} onChange={(page) => setFilters({ ...filters, page })} />}
      </Card>
      {creating && <NewOrderModal projectId={params.get("project") ?? undefined} onClose={() => setParams({})} onSaved={(order) => { notify("Orden creada. Cargá ahora sus rubros."); navigate(`/ordenes/${order.id}`); }} />}
    </>
  );
}

function ItemModal({ orderId, item, onClose, onSaved }: { orderId: number; item?: PoItem; onClose: () => void; onSaved: () => void }) {
  const units = useApi<{ id: number; code: string; name: string }[]>("/units");
  const [form, setForm] = useState({
    description: item?.description ?? "",
    sector: item?.sector ?? "",
    unit_id: item?.unit_id ? String(item.unit_id) : "",
    contracted_quantity: item ? String(Number(item.contracted_quantity)) : "",
    unit_price: item ? String(Number(item.unit_price)) : "",
    status: item?.status ?? "activo",
    allow_overage: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (key: string) => (value: string) => setForm((current) => ({ ...current, [key]: value }));
  const total = Number(form.contracted_quantity || 0) * Number(form.unit_price || 0);

  const submit = async () => {
    const local: Record<string, string> = {};
    if (!form.description.trim()) local.description = "Describí el trabajo.";
    if (!(Number(form.contracted_quantity) > 0)) local.contracted_quantity = "La cantidad debe ser mayor a cero.";
    if (!(Number(form.unit_price) >= 0) || form.unit_price === "") local.unit_price = "Ingresá el precio unitario.";
    setErrors(local);
    if (Object.keys(local).length) return;
    setBusy(true);
    setError("");
    const payload = { ...form, unit_id: form.unit_id ? Number(form.unit_id) : null };
    try {
      if (item) await api.put(`/purchase-orders/${orderId}/items/${item.id}`, payload);
      else await api.post(`/purchase-orders/${orderId}/items`, payload);
      onSaved();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={item ? "Editar rubro" : "Agregar rubro"} onClose={onClose} footer={<><button className="btn btn-outline-secondary" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={busy} onClick={submit}>Guardar</button></>}>
      <FormError message={error} />
      <div className="row g-3">
        <Field name="description" label="Descripción del trabajo" required className="col-12" value={form.description} onChange={set("description")} error={errors.description} />
        <Field name="sector" label="Sector o ubicación" value={form.sector} onChange={set("sector")} />
        <SelectField name="unit_id" label="Unidad de medida" value={form.unit_id} onChange={set("unit_id")} placeholder="Elegí la unidad" options={(units.data ?? []).map((unit) => ({ value: unit.id, label: unit.name }))} />
        <Field name="contracted_quantity" label="Cantidad contratada" required type="number" step="0.0001" min="0" value={form.contracted_quantity} onChange={set("contracted_quantity")} error={errors.contracted_quantity} />
        <Field name="unit_price" label="Precio unitario original" required type="number" step="0.01" min="0" value={form.unit_price} onChange={set("unit_price")} error={errors.unit_price} />
        <div className="col-12">
          <div className="formula-box d-flex justify-content-between"><span>Importe original</span><strong className="money">{money(total)}</strong></div>
        </div>
        {item && <CheckField name="allow_overage" label="Autorizo bajar la cantidad por debajo de lo ya certificado" checked={form.allow_overage} onChange={(value) => setForm((current) => ({ ...current, allow_overage: value }))} />}
      </div>
    </Modal>
  );
}

export function OrderDetailPage() {
  const { id } = useParams();
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const notify = useToast();
  const { data: order, loading, error, reload } = useApi<PurchaseOrder>(`/purchase-orders/${id}`);
  const certificates = useApi<Page<Certificate>>("/certificates", { purchase_order_id: id, page_size: 200 });
  const retentions = useApi<Page<Retention>>("/retentions", { purchase_order_id: id, page_size: 200 });
  const [itemModal, setItemModal] = useState<PoItem | "new" | null>(null);
  const [removeItem, setRemoveItem] = useState<PoItem | null>(null);
  const [editing, setEditing] = useState(false);
  const [milestone, setMilestone] = useState(false);
  const [scopeName, setScopeName] = useState("");
  const [deleting, setDeleting] = useState(false);

  if (loading && !order) return <Loading />;
  if (error || !order) return <ErrorBox message={error ?? "No se encontró la orden."} />;

  const certs = certificates.data?.items ?? [];
  const active = certs.filter((row) => !["anulado", "borrador"].includes(row.status));
  const sum = (rows: Certificate[], key: keyof Certificate) => rows.reduce((acc, row) => acc + Number(row[key] ?? 0), 0);
  const invoiced = active.filter((row) => ["facturado", "parcialmente_pagado", "pagado"].includes(row.status));
  const rets = retentions.data?.items ?? [];
  const retentionPending = rets.filter((row) => row.status !== "anulada").reduce((acc, row) => acc + Number(row.pending_amount), 0);
  const evolution = [...active]
    .sort((a, b) => String(a.issue_date).localeCompare(String(b.issue_date)))
    .map((row) => ({ name: row.client_number, Base: Number(row.base_amount), CAC: Number(row.cac_amount) }));
  const certifiedBase = sum(active, "base_amount");
  const contracted = Number(order.contracted_amount);

  return (
    <>
      <PageHeader
        back={{ to: "/ordenes", label: "Órdenes de compra" }}
        title={`OC ${order.client_po_number}`}
        subtitle={<><Link to={`/clientes/${order.client_id}`}>{order.client_name}</Link> · <Link to={`/obras/${order.project_id}`}>{order.project_name}</Link> · <StatusBadge value={order.status} /></>}
        actions={
          <>
            <Link to={`/certificados/nuevo?oc=${order.id}`} className="btn btn-primary"><i className="bi bi-plus-lg me-1" />Nuevo certificado</Link>
            <button className="btn btn-outline-secondary" onClick={() => setMilestone(true)}><i className="bi bi-flag me-1" />Finalización</button>
            <button className="btn btn-outline-secondary" onClick={() => setEditing(true)}><i className="bi bi-pencil me-1" />Editar</button>
            {isAdmin && <button className="btn btn-outline-danger" onClick={() => setDeleting(true)} aria-label="Eliminar orden"><i className="bi bi-trash" /></button>}
          </>
        }
      />

      <div className="stat-grid">
        <div className="stat-card"><div className="stat-label">Contratado (sin CAC)</div><div className="stat-value"><Money value={contracted} currency={order.currency} /></div></div>
        <div className="stat-card stat-primary"><div className="stat-label">Certificado base</div><div className="stat-value"><Money value={certifiedBase} currency={order.currency} /></div><div className="small text-secondary">{contracted ? `${((certifiedBase / contracted) * 100).toFixed(1)}% de lo contratado` : ""}</div></div>
        <div className="stat-card"><div className="stat-label">Reajustes CAC</div><div className="stat-value"><Money value={sum(active, "cac_amount")} currency={order.currency} /></div></div>
        <div className="stat-card stat-success"><div className="stat-label">Cobrado</div><div className="stat-value"><Money value={sum(active, "collected_amount")} currency={order.currency} /></div></div>
        <div className="stat-card stat-warning"><div className="stat-label">Pendiente de cobro</div><div className="stat-value"><Money value={sum(invoiced, "pending_amount")} currency={order.currency} /></div><div className="small text-secondary">Certificados facturados</div></div>
        <div className="stat-card stat-danger"><div className="stat-label">Caución por recuperar</div><div className="stat-value"><Money value={retentionPending} currency={order.currency} /></div></div>
      </div>

      <Card title="Rubros y cantidades" bodyClass="p-0" actions={<button className="btn btn-sm btn-primary" onClick={() => setItemModal("new")}><i className="bi bi-plus-lg me-1" />Agregar rubro</button>}>
        <DataTable
          rows={order.items ?? []}
          rowKey={(row) => row.id}
          empty={<div className="p-4 text-center text-secondary">La orden todavía no tiene rubros. Agregá el primero para poder certificar.</div>}
          columns={[
            { key: "d", header: "Rubro", render: (row) => <>{row.description}{row.sector && <div className="small text-secondary">{row.sector}</div>}</>, primary: true },
            { key: "u", header: "Unidad", render: (row) => row.unit_name || "—" },
            { key: "q", header: "Contratado", align: "end", render: (row) => quantity(row.contracted_quantity) },
            { key: "c", header: "Certificado", align: "end", render: (row) => quantity(row.certified_quantity) },
            { key: "p", header: "Pendiente", align: "end", render: (row) => <span className={Number(row.pending_quantity) < 0 ? "text-danger fw-semibold" : ""}>{quantity(row.pending_quantity)}</span> },
            { key: "pu", header: "Precio unit.", align: "end", render: (row) => <Money value={row.unit_price} currency={order.currency} /> },
            { key: "a", header: "Importe", align: "end", render: (row) => <Money value={row.original_amount} currency={order.currency} /> },
            {
              key: "x",
              header: "",
              align: "end",
              render: (row) => (
                <div className="d-flex gap-1 justify-content-end">
                  <button className="btn btn-sm btn-outline-secondary" aria-label="Editar rubro" onClick={(event) => { event.stopPropagation(); setItemModal(row); }}><i className="bi bi-pencil" /></button>
                  {isAdmin && <button className="btn btn-sm btn-outline-danger" aria-label="Eliminar rubro" onClick={(event) => { event.stopPropagation(); setRemoveItem(row); }}><i className="bi bi-trash" /></button>}
                </div>
              ),
            },
          ]}
        />
      </Card>

      <div className="row g-3">
        <div className="col-12 col-lg-7">
          <Card title="Evolución de certificados">
            {evolution.length === 0 ? (
              <p className="text-secondary mb-0">Sin certificados emitidos.</p>
            ) : (
              <div className="chart-box">
                <ResponsiveContainer>
                  <BarChart data={evolution}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" fontSize={12} />
                    <YAxis tickFormatter={(value) => compactMoney(Number(value), order.currency)} fontSize={11} width={70} />
                    <Tooltip formatter={(value) => money(Number(value), order.currency)} />
                    <Bar dataKey="Base" stackId="a" fill="#2f5d8a" />
                    <Bar dataKey="CAC" stackId="a" fill="#7aa0c4" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        </div>
        <div className="col-12 col-lg-5">
          <Card title="Condiciones contractuales">
            <KeyValues
              items={[
                { label: "Moneda", value: order.currency },
                { label: "Emisión", value: date(order.issue_date) },
                { label: "Condiciones de pago", value: order.payment_terms || "—" },
                { label: "Plazo de pago", value: order.payment_term_days ? `${order.payment_term_days} días` : "—" },
                { label: "Retención", value: `${Number(order.retention_percent)}%` },
                { label: "Base de retención", value: label(order.retention_base_type) + (order.retention_base_type === "personalizada" ? ` (${order.retention_concepts.map(label).join(", ")})` : "") },
                { label: "Inicio del plazo", value: label(order.release_trigger) },
                { label: "Plazo de liberación", value: `${order.release_days} días corridos` },
                ...(order.explicit_release_date ? [{ label: "Liberación pactada", value: date(order.explicit_release_date) }] : []),
              ]}
            />
            <div className="mt-3">
              <div className="small fw-semibold mb-1">Alcances (conjuntos de trabajos)</div>
              {(order.scopes ?? []).map((scope) => <span key={scope.id} className="badge text-bg-light me-1">{scope.name}</span>)}
              <div className="input-group input-group-sm mt-2">
                <input className="form-control" placeholder="Nuevo alcance, ej.: Torre A" value={scopeName} onChange={(event) => setScopeName(event.target.value)} aria-label="Nuevo alcance" />
                <button
                  className="btn btn-outline-secondary"
                  disabled={!scopeName.trim()}
                  onClick={async () => {
                    try {
                      await api.post(`/purchase-orders/${order.id}/scopes`, { name: scopeName.trim() });
                      setScopeName("");
                      reload();
                    } catch (caught) {
                      notify(errorMessage(caught), "danger");
                    }
                  }}
                >
                  Agregar
                </button>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <Card title="Certificados" bodyClass="p-0"><CertificateMiniTable rows={certs} /></Card>
      <Card title="Retenciones" bodyClass="p-0"><RetentionMiniTable rows={rets} /></Card>
      <Attachments entityType="purchase_order" entityId={order.id} />

      {itemModal && <ItemModal orderId={order.id} item={itemModal === "new" ? undefined : itemModal} onClose={() => setItemModal(null)} onSaved={() => { notify("Rubro guardado."); setItemModal(null); reload(); }} />}
      {removeItem && (
        <ConfirmDialog
          title="Eliminar rubro"
          danger
          confirmLabel="Eliminar"
          message={`Se eliminará «${removeItem.description}». Si ya fue certificado, el sistema no lo permite.`}
          onCancel={() => setRemoveItem(null)}
          onConfirm={async () => {
            try {
              await api.delete(`/purchase-orders/${order.id}/items/${removeItem.id}`);
              notify("Rubro eliminado.");
              reload();
            } catch (caught) {
              notify(errorMessage(caught), "danger");
            }
            setRemoveItem(null);
          }}
        />
      )}
      {editing && <EditOrderModal order={order} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); reload(); certificates.reload(); retentions.reload(); }} />}
      {milestone && <MilestoneDialog projectId={order.project_id} purchaseOrderId={order.id} scopes={order.scopes} onClose={() => setMilestone(false)} onSaved={() => { setMilestone(false); retentions.reload(); }} />}
      {deleting && (
        <ConfirmDialog
          title="Eliminar orden"
          danger
          confirmLabel="Eliminar"
          message="Solo se puede eliminar una orden sin certificados."
          onCancel={() => setDeleting(false)}
          onConfirm={async () => {
            try {
              await api.delete(`/purchase-orders/${order.id}`);
              notify("Orden eliminada.");
              navigate("/ordenes");
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

function EditOrderModal({ order, onClose, onSaved }: { order: PurchaseOrder; onClose: () => void; onSaved: () => void }) {
  const { meta } = useAuth();
  const notify = useToast();
  const [form, setForm] = useState<OrderForm>({
    ...EMPTY_ORDER,
    ...Object.fromEntries(Object.entries(order).filter(([key]) => key in EMPTY_ORDER).map(([key, value]) => [key, Array.isArray(value) ? value : value === null || value === undefined ? "" : String(value)])),
  } as OrderForm);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<{ id: number; number: string; retention: string }[] | null>(null);
  const set = (key: keyof OrderForm) => (value: string) => setForm((current) => ({ ...current, [key]: value }));

  const changedPolicy = () => {
    const keys: (keyof OrderForm)[] = ["retention_percent", "retention_base_type", "release_trigger", "release_days", "contractual_start_date", "explicit_release_date", "release_scope_id"];
    const original = order as unknown as Record<string, unknown>;
    return keys.some((key) => String(form[key] ?? "") !== String(original[key] ?? "")) || JSON.stringify(form.retention_concepts) !== JSON.stringify(order.retention_concepts);
  };

  const save = async (confirmed?: string) => {
    setBusy(true);
    setError("");
    const payload = orderPayload(form);
    delete payload.client_id;
    delete payload.project_id;
    if (!changedPolicy()) {
      for (const key of ["retention_percent", "retention_base_type", "retention_concepts", "release_trigger", "release_days", "contractual_start_date", "explicit_release_date", "release_scope_id"]) delete payload[key];
    }
    if (confirmed !== undefined) {
      payload.confirm_recalculation = true;
      payload.reason = confirmed;
    }
    try {
      await api.put(`/purchase-orders/${order.id}`, payload);
      notify(confirmed !== undefined ? "Orden actualizada y certificados recalculados. Quedó registrado en la auditoría." : "Orden actualizada.");
      onSaved();
    } catch (caught) {
      const body = errorBody(caught);
      if (body.code === "confirm_required") {
        setConfirm((body.details?.certificates as { id: number; number: string; retention: string }[]) ?? []);
      } else setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Modal title="Editar orden de compra" size="modal-xl" onClose={onClose} footer={<><button className="btn btn-outline-secondary" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={busy} onClick={() => save()}>Guardar</button></>}>
        <FormError message={error} />
        <div className="row g-3">
          <Field name="client_po_number" label="Número de OC" required value={form.client_po_number} onChange={set("client_po_number")} />
          <SelectField name="status" label="Estado" value={form.status} onChange={set("status")} options={["borrador", "vigente", "finalizada", "cancelada"]} />
          <SelectField name="currency" label="Moneda" value={form.currency} onChange={set("currency")} options={(meta?.currencies ?? ["ARS"]).map((code) => ({ value: code, label: code }))} />
          <Field name="issue_date" label="Fecha de emisión" type="date" value={form.issue_date} onChange={set("issue_date")} />
          <Field name="acceptance_date" label="Fecha de aceptación" type="date" value={form.acceptance_date} onChange={set("acceptance_date")} />
          <Field name="payment_terms" label="Condiciones de pago" value={form.payment_terms} onChange={set("payment_terms")} />
          <Field name="payment_term_days" label="Plazo de pago (días)" type="number" value={form.payment_term_days} onChange={set("payment_term_days")} />
          <RetentionSettings form={form} set={set} setConcepts={(values) => setForm((current) => ({ ...current, retention_concepts: values }))} scopes={order.scopes} />
          <Field name="notes" label="Observaciones" type="textarea" className="col-12" value={form.notes} onChange={set("notes")} />
        </div>
      </Modal>
      {confirm && (
        <ConfirmDialog
          title="Recalcular certificados emitidos"
          requireReason
          confirmLabel="Recalcular y guardar"
          message="Cambiaste la retención o el plazo de liberación. Estos certificados ya emitidos se recalcularán con la nueva configuración. El cálculo anterior queda en la auditoría."
          details={
            <ul className="small mb-0">
              {confirm.map((row) => <li key={row.id}>Certificado {row.number}: retención actual {money(row.retention, order.currency)}</li>)}
            </ul>
          }
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={(reason) => {
            setConfirm(null);
            save(reason);
          }}
        />
      )}
    </>
  );
}
