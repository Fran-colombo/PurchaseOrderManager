import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../app/auth";
import { useToast } from "../app/toast";
import { Field, FormError, SelectField } from "../components/form";
import { Card, ConfirmDialog, DataTable, ErrorBox, KeyValues, Loading, Modal, Money, PageHeader, Pagination, StatusBadge, type Column } from "../components/ui";
import { useApi, useStoredState } from "../hooks/useApi";
import { api, errorMessage, fieldErrors } from "../services/api";
import type { Adjustment, CacIndex, Certificate, Page, PurchaseOrder } from "../types";
import { date, label, money } from "../utils/format";

const period = (year: number | null, month: number | null) => (year && month ? `${String(month).padStart(2, "0")}/${year}` : "—");

function IndexModal({ initial, onClose, onSaved }: { initial?: CacIndex; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    period_year: String(initial?.period_year ?? new Date().getFullYear()),
    period_month: String(initial?.period_month ?? new Date().getMonth() + 1),
    series_code: initial?.series_code ?? "",
    series_name: initial?.series_name ?? "",
    published_value: initial?.published_value ?? "",
    publication_date: initial?.publication_date ?? "",
    source: initial?.source ?? "",
    source_url: initial?.source_url ?? "",
    notes: initial?.notes ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (key: string) => (value: string) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async () => {
    const local: Record<string, string> = {};
    if (!form.series_code.trim()) local.series_code = "Indicá la serie (por ejemplo, el código del índice que usa el contrato).";
    if (!(Number(form.published_value) > 0)) local.published_value = "El valor debe ser mayor a cero.";
    setErrors(local);
    if (Object.keys(local).length) return;
    setBusy(true);
    setError("");
    const payload = { ...form, period_year: Number(form.period_year), period_month: Number(form.period_month), publication_date: form.publication_date || null };
    try {
      if (initial) await api.put(`/cac-indexes/${initial.id}`, payload);
      else await api.post("/cac-indexes", payload);
      onSaved();
    } catch (caught) {
      setErrors(fieldErrors(caught));
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={initial ? "Editar índice CAC" : "Cargar índice CAC"} onClose={onClose} size="modal-lg" footer={<><button className="btn btn-outline-secondary" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={busy} onClick={submit}>Guardar</button></>}>
      <FormError message={error} />
      <p className="small text-secondary">Cargá el valor tal como lo publica la Cámara Argentina de la Construcción para la serie que usa el contrato. El sistema no inventa ni descarga índices.</p>
      <div className="row g-3">
        <Field name="period_month" label="Mes" type="number" min="1" value={form.period_month} onChange={set("period_month")} className="col-6 col-md-3" required />
        <Field name="period_year" label="Año" type="number" value={form.period_year} onChange={set("period_year")} className="col-6 col-md-3" required />
        <Field name="series_code" label="Serie" required value={form.series_code} onChange={set("series_code")} error={errors.series_code} className="col-12 col-md-6" placeholder="Ej.: CAC-GENERAL" />
        <Field name="series_name" label="Descripción de la serie" value={form.series_name} onChange={set("series_name")} className="col-12" />
        <Field name="published_value" label="Valor publicado" required type="number" step="0.0001" value={form.published_value} onChange={set("published_value")} error={errors.published_value} />
        <Field name="publication_date" label="Fecha de publicación" type="date" value={form.publication_date} onChange={set("publication_date")} />
        <Field name="source" label="Fuente" value={form.source} onChange={set("source")} />
        <Field name="source_url" label="Enlace de respaldo" value={form.source_url} onChange={set("source_url")} />
        <Field name="notes" label="Observaciones" type="textarea" className="col-12" value={form.notes} onChange={set("notes")} />
      </div>
    </Modal>
  );
}

export function IndexesPage() {
  const { isAdmin } = useAuth();
  const notify = useToast();
  const [filters, setFilters] = useStoredState("filters.indexes", { series_code: "", page: 1 });
  const { data, loading, error, reload } = useApi<Page<CacIndex>>("/cac-indexes", filters);
  const [editing, setEditing] = useState<CacIndex | "new" | null>(null);
  const [removing, setRemoving] = useState<CacIndex | null>(null);
  const columns: Column<CacIndex>[] = [
    { key: "p", header: "Período", render: (row) => period(row.period_year, row.period_month), primary: true },
    { key: "s", header: "Serie", render: (row) => <>{row.series_code}{row.series_name && <div className="small text-secondary">{row.series_name}</div>}</> },
    { key: "v", header: "Valor", align: "end", render: (row) => Number(row.published_value).toLocaleString("es-AR", { maximumFractionDigits: 4 }) },
    { key: "d", header: "Publicación", render: (row) => date(row.publication_date) },
    { key: "f", header: "Fuente", render: (row) => (row.source_url ? <a href={row.source_url} target="_blank" rel="noreferrer">{row.source || "Enlace"}</a> : row.source || "—"), hideOnMobile: true },
    ...(isAdmin
      ? [{
          key: "x",
          header: "",
          align: "end" as const,
          render: (row: CacIndex) => (
            <div className="d-flex gap-1 justify-content-end">
              <button className="btn btn-sm btn-outline-secondary" aria-label="Editar índice" onClick={() => setEditing(row)}><i className="bi bi-pencil" /></button>
              <button className="btn btn-sm btn-outline-danger" aria-label="Eliminar índice" onClick={() => setRemoving(row)}><i className="bi bi-trash" /></button>
            </div>
          ),
        }]
      : []),
  ];
  return (
    <>
      <PageHeader title="Índices CAC" subtitle="Carga manual. La importación automática desde una fuente oficial no está configurada." actions={<button className="btn btn-primary" onClick={() => setEditing("new")}><i className="bi bi-plus-lg me-1" />Cargar índice</button>} />
      <Card bodyClass="p-0">
        <div className="filters">
          <input className="form-control" placeholder="Filtrar por serie exacta" value={filters.series_code} onChange={(event) => setFilters({ ...filters, series_code: event.target.value, page: 1 })} aria-label="Serie" />
        </div>
        {error ? <div className="p-3"><ErrorBox message={error} onRetry={reload} /></div> : loading && !data ? <Loading /> : <DataTable rows={data?.items ?? []} columns={columns} rowKey={(row) => row.id} />}
        {data && <Pagination page={data.page} pageSize={data.page_size} total={data.total} onChange={(page) => setFilters({ ...filters, page })} />}
      </Card>
      {editing && <IndexModal initial={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} onSaved={() => { notify("Índice guardado."); setEditing(null); reload(); }} />}
      {removing && (
        <ConfirmDialog
          title="Eliminar índice"
          danger
          confirmLabel="Eliminar"
          message="Si el índice ya se usó en un reajuste, el sistema no permite borrarlo."
          onCancel={() => setRemoving(null)}
          onConfirm={async () => {
            try {
              await api.delete(`/cac-indexes/${removing.id}`);
              notify("Índice eliminado.");
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

function NewAdjustmentModal({ onClose, onSaved }: { onClose: () => void; onSaved: (row: Adjustment) => void }) {
  const orders = useApi<Page<PurchaseOrder>>("/purchase-orders", { page_size: 200 });
  const indexes = useApi<Page<CacIndex>>("/cac-indexes", { page_size: 200 });
  const [form, setForm] = useState({ purchase_order_id: "", certificate_id: "", kind: "posterior", method: "variacion_simple", adjustable_base: "", base_index_id: "", update_index_id: "", validated_amount: "", formula_text: "", status: "calculado", notes: "", already_includes_update: false, allow_readjust: false, readjust_reason: "" });
  const certificates = useApi<Page<Certificate>>(form.purchase_order_id ? "/certificates" : null, { purchase_order_id: form.purchase_order_id, page_size: 200 });
  const [preview, setPreview] = useState<{ coefficient: string; updated_amount: string; adjustment_amount: string } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (key: string) => (value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setPreview(null);
  };
  const indexOptions = (indexes.data?.items ?? []).map((row) => ({ value: row.id, label: `${row.series_code} ${period(row.period_year, row.period_month)} · ${row.published_value}` }));
  const findIndex = (id: string) => indexes.data?.items.find((row) => String(row.id) === id);

  const calculate = async () => {
    setError("");
    const base = findIndex(form.base_index_id);
    const updated = findIndex(form.update_index_id);
    if (!form.adjustable_base || !base || !updated) return setError("Completá la base reajustable y los dos índices.");
    try {
      const { data } = await api.post("/adjustments/preview", { adjustable_base: form.adjustable_base, index_base: base.published_value, index_updated: updated.published_value });
      setPreview(data);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  };

  const submit = async () => {
    setError("");
    if (!form.purchase_order_id) return setError("Elegí la orden de compra.");
    if (!form.adjustable_base) return setError("Ingresá la base reajustable.");
    setBusy(true);
    try {
      const { data } = await api.post<Adjustment>("/adjustments", {
        ...form,
        purchase_order_id: Number(form.purchase_order_id),
        certificate_id: form.certificate_id ? Number(form.certificate_id) : null,
        base_index_id: form.base_index_id ? Number(form.base_index_id) : null,
        update_index_id: form.update_index_id ? Number(form.update_index_id) : null,
        validated_amount: form.validated_amount === "" ? null : form.validated_amount,
      });
      onSaved(data);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Registrar reajuste CAC" size="modal-lg" onClose={onClose} footer={<><button className="btn btn-outline-secondary" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={busy} onClick={submit}>Registrar</button></>}>
      <FormError message={error} />
      <div className="row g-3">
        <SelectField name="po" label="Orden de compra" required value={form.purchase_order_id} onChange={set("purchase_order_id")} placeholder="Elegí la orden" options={(orders.data?.items ?? []).map((row) => ({ value: row.id, label: `${row.client_po_number} · ${row.project_name}` }))} />
        <SelectField name="cert" label="Certificado relacionado (opcional)" value={form.certificate_id} onChange={set("certificate_id")} placeholder="Sin certificado" options={(certificates.data?.items ?? []).filter((row) => row.status !== "anulado").map((row) => ({ value: row.id, label: row.client_number }))} />
        <SelectField name="kind" label="Tipo de registro" value={form.kind} onChange={set("kind")} options={["complementario", "posterior", "nota_credito", "nota_debito", "correccion"]} />
        <SelectField name="method" label="Método de cálculo" value={form.method} onChange={set("method")} options={["variacion_simple", "contractual"]} />
        <Field name="adjustable_base" label="Importe base reajustable" required type="number" step="0.01" value={form.adjustable_base} onChange={set("adjustable_base")} />
        <SelectField name="status" label="Estado" value={form.status} onChange={set("status")} options={["calculado", "presentado", "aprobado"]} hint="Elegí Aprobado solo si el cliente ya lo aprobó." />
        {form.method === "variacion_simple" ? (
          <>
            <SelectField name="bi" label="Índice CAC base" value={form.base_index_id} onChange={set("base_index_id")} placeholder="Elegí" options={indexOptions} />
            <SelectField name="ui" label="Índice CAC actualizado" value={form.update_index_id} onChange={set("update_index_id")} placeholder="Elegí" options={indexOptions} />
            <div className="col-12">
              <button type="button" className="btn btn-sm btn-outline-primary" onClick={calculate}>Calcular vista previa</button>
              {preview && (
                <div className="formula-box mt-2">
                  <div className="small text-secondary mb-1">Coeficiente = índice actualizado / índice base. Estimación, no aprobada por el cliente.</div>
                  <div className="formula-line"><span>Coeficiente</span><span>{preview.coefficient}</span></div>
                  <div className="formula-line"><span>Importe actualizado</span><span className="money">{money(preview.updated_amount)}</span></div>
                  <div className="formula-line total"><span>Reajuste</span><span className="money">{money(preview.adjustment_amount)}</span></div>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <Field name="validated_amount" label="Importe del reajuste validado" required type="number" step="0.01" value={form.validated_amount} onChange={set("validated_amount")} />
            <Field name="formula_text" label="Fórmula y parámetros" value={form.formula_text} onChange={set("formula_text")} placeholder="Ej.: polinómica con ponderaciones del pliego" />
          </>
        )}
        <div className="col-12">
          <div className="form-check">
            <input id="aiu" type="checkbox" className="form-check-input" checked={form.already_includes_update} onChange={(event) => setForm((current) => ({ ...current, already_includes_update: event.target.checked }))} />
            <label htmlFor="aiu" className="form-check-label">La base ya incluye una actualización anterior</label>
          </div>
          {form.already_includes_update && (
            <div className="mt-2 row g-2">
              <div className="col-12">
                <div className="form-check">
                  <input id="ar" type="checkbox" className="form-check-input" checked={form.allow_readjust} onChange={(event) => setForm((current) => ({ ...current, allow_readjust: event.target.checked }))} />
                  <label htmlFor="ar" className="form-check-label">El contrato permite volver a reajustarla (autorización explícita)</label>
                </div>
              </div>
              {form.allow_readjust && <Field name="readjust_reason" label="Motivo" required className="col-12" value={form.readjust_reason} onChange={set("readjust_reason")} />}
            </div>
          )}
        </div>
        <Field name="notes" label="Observaciones" type="textarea" className="col-12" value={form.notes} onChange={set("notes")} />
      </div>
    </Modal>
  );
}

export function AdjustmentsPage() {
  const { meta } = useAuth();
  const [params] = useSearchParams();
  const notify = useToast();
  const [filters, setFilters] = useStoredState("filters.adjustments", { status: params.get("status") ?? "", page: 1 });
  const { data, loading, error, reload } = useApi<Page<Adjustment>>("/adjustments", filters);
  const [creating, setCreating] = useState(false);
  const columns: Column<Adjustment>[] = [
    { key: "i", header: "Reajuste", render: (row) => `#${row.id} · ${label(row.kind)}`, primary: true },
    { key: "m", header: "Método", render: (row) => label(row.method) },
    { key: "p", header: "Períodos", render: (row) => `${period(row.base_period_year, row.base_period_month)} → ${period(row.update_period_year, row.update_period_month)}`, hideOnMobile: true },
    { key: "k", header: "Coef.", align: "end", render: (row) => row.coefficient ?? "—" },
    { key: "s", header: "Estado", render: (row) => <StatusBadge value={row.status} /> },
    { key: "a", header: "Calculado", align: "end", render: (row) => <Money value={row.adjustment_amount} /> },
    { key: "ap", header: "Aprobado", align: "end", render: (row) => (row.official ? <Money value={row.approved_amount} /> : <span className="text-secondary">—</span>) },
  ];
  return (
    <>
      <PageHeader title="Reajustes CAC" subtitle="Calculado, presentado, aprobado, facturado y pagado son estados distintos." actions={<button className="btn btn-primary" onClick={() => setCreating(true)}><i className="bi bi-plus-lg me-1" />Registrar reajuste</button>} />
      <Card bodyClass="p-0">
        <div className="filters">
          <select className="form-select" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value, page: 1 })} aria-label="Estado">
            <option value="">Todos los estados</option>
            {(meta?.adjustment_statuses ?? []).map((status) => <option key={status} value={status}>{label(status)}</option>)}
          </select>
        </div>
        {error ? <div className="p-3"><ErrorBox message={error} onRetry={reload} /></div> : loading && !data ? <Loading /> : <DataTable rows={data?.items ?? []} columns={columns} rowKey={(row) => row.id} rowLink={(row) => `/reajustes/${row.id}`} />}
        {data && <Pagination page={data.page} pageSize={data.page_size} total={data.total} onChange={(page) => setFilters({ ...filters, page })} />}
      </Card>
      {creating && <NewAdjustmentModal onClose={() => setCreating(false)} onSaved={() => { notify("Reajuste registrado como cálculo. No se toma como aprobado hasta que cambies su estado."); setCreating(false); reload(); }} />}
    </>
  );
}

export function AdjustmentDetailPage() {
  const { id } = useParams();
  const notify = useToast();
  const { meta } = useAuth();
  const { data: row, loading, error, reload } = useApi<Adjustment>(`/adjustments/${id}`);
  const [status, setStatus] = useState<string | null>(null);

  if (loading && !row) return <Loading />;
  if (error || !row) return <ErrorBox message={error ?? "No se encontró el reajuste."} />;

  const transitions = (meta?.adjustment_statuses ?? []).filter((value) => value !== row.status && value !== "reemplazado");

  return (
    <>
      <PageHeader
        back={{ to: "/reajustes", label: "Reajustes CAC" }}
        title={`Reajuste #${row.id}`}
        subtitle={<><StatusBadge value={row.status} /> · {row.official ? "Aprobado por el cliente" : "Estimación: todavía no es un importe oficial"}</>}
        actions={
          <div className="dropdown-like d-flex gap-2 flex-wrap">
            {transitions.slice(0, 6).map((value) => (
              <button key={value} className={`btn btn-sm ${value === "anulado" || value === "rechazado" ? "btn-outline-danger" : "btn-outline-primary"}`} onClick={() => setStatus(value)}>
                Marcar {label(value).toLowerCase()}
              </button>
            ))}
          </div>
        }
      />
      <div className="row g-3">
        <div className="col-12 col-lg-6">
          <Card title="Cálculo">
            <div className="formula-box">
              <div className="formula-line"><span>Base reajustable</span><span className="money">{money(row.adjustable_base)}</span></div>
              <div className="formula-line"><span>Coeficiente</span><span>{row.coefficient ?? "Contractual"}</span></div>
              <div className="formula-line"><span>Importe actualizado</span><span className="money">{money(row.updated_amount)}</span></div>
              <div className="formula-line total"><span>Reajuste calculado</span><span className="money">{money(row.adjustment_amount)}</span></div>
            </div>
            <p className="small text-secondary mt-2 mb-0">{row.formula_text}</p>
          </Card>
        </div>
        <div className="col-12 col-lg-6">
          <Card title="Seguimiento">
            <KeyValues
              items={[
                { label: "Tipo", value: label(row.kind) },
                { label: "Método", value: label(row.method) },
                { label: "Período base", value: period(row.base_period_year, row.base_period_month) },
                { label: "Período actualizado", value: period(row.update_period_year, row.update_period_month) },
                { label: "Presentado", value: row.presented_amount ? money(row.presented_amount) : "—" },
                { label: "Aprobado", value: row.approved_amount ? money(row.approved_amount) : "—" },
                { label: "Orden", value: <Link to={`/ordenes/${row.purchase_order_id}`}>Ver orden</Link> },
                { label: "Certificado", value: row.certificate_id ? <Link to={`/certificados/${row.certificate_id}`}>Ver certificado</Link> : "—" },
              ]}
            />
            {row.void_reason && <p className="small text-danger mt-3 mb-0">Motivo de anulación: {row.void_reason}</p>}
            {row.notes && <p className="small text-secondary mt-3 mb-0">{row.notes}</p>}
          </Card>
        </div>
      </div>
      {status && (
        <ConfirmDialog
          title={`Cambiar estado a «${label(status)}»`}
          requireReason={status === "anulado"}
          danger={status === "anulado" || status === "rechazado"}
          message={status === "aprobado" ? "Confirmá solo si el cliente aprobó el reajuste. Puede cambiar la retención del certificado si la base incluye CAC aprobado." : "El cambio queda registrado en la auditoría y se recalcula el certificado relacionado."}
          onCancel={() => setStatus(null)}
          onConfirm={async (reason) => {
            try {
              await api.post(`/adjustments/${row.id}/status`, { status, reason });
              notify("Estado actualizado.");
              reload();
            } catch (caught) {
              notify(errorMessage(caught), "danger");
            }
            setStatus(null);
          }}
        />
      )}
    </>
  );
}
