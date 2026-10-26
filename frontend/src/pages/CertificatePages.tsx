import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../app/auth";
import { useToast } from "../app/toast";
import Attachments from "../components/Attachments";
import { CheckField, Field, FormError, SelectField } from "../components/form";
import { Card, ConfirmDialog, DataTable, ErrorBox, KeyValues, Loading, Modal, Money, PageHeader, Pagination, StatusBadge, type Column } from "../components/ui";
import { useApi, useStoredState } from "../hooks/useApi";
import { api, errorBody, errorMessage } from "../services/api";
import type { CacIndex, Certificate, Page, PurchaseOrder } from "../types";
import { date, label, money, quantity, todayIso } from "../utils/format";

export function CertificatesPage() {
  const { meta } = useAuth();
  const [params] = useSearchParams();
  const [filters, setFilters] = useStoredState("filters.certificates", { q: "", status: params.get("status") ?? "", page: 1 });
  const { data, loading, error, reload } = useApi<Page<Certificate>>("/certificates", filters);
  const columns: Column<Certificate>[] = [
    { key: "n", header: "Certificado", render: (row) => row.client_number, primary: true },
    { key: "oc", header: "Orden", render: (row) => row.purchase_order_number },
    { key: "c", header: "Cliente / obra", render: (row) => <>{row.client_name}<div className="small text-secondary">{row.project_name}</div></>, hideOnMobile: true },
    { key: "d", header: "Emisión", render: (row) => date(row.issue_date) },
    { key: "s", header: "Estado", render: (row) => <StatusBadge value={row.status} /> },
    { key: "g", header: "Bruto", align: "end", render: (row) => <Money value={row.gross_amount} currency={row.currency} />, hideOnMobile: true },
    { key: "net", header: "Neto", align: "end", render: (row) => <Money value={row.net_amount} currency={row.currency} /> },
    { key: "p", header: "Pendiente", align: "end", render: (row) => (row.status === "anulado" || row.status === "borrador" ? "—" : <Money value={row.pending_amount} currency={row.currency} />) },
  ];
  return (
    <>
      <PageHeader title="Certificados de avance" subtitle="Importe certificado, facturado, cobrado y pendiente se muestran por separado." actions={<Link to="/certificados/nuevo" className="btn btn-primary"><i className="bi bi-plus-lg me-1" />Nuevo certificado</Link>} />
      <Card bodyClass="p-0">
        <div className="filters">
          <input className="form-control" placeholder="Buscar número de certificado" value={filters.q} onChange={(event) => setFilters({ ...filters, q: event.target.value, page: 1 })} aria-label="Buscar" />
          <select className="form-select" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value, page: 1 })} aria-label="Estado">
            <option value="">Todos los estados</option>
            {(meta?.certificate_statuses ?? []).map((status) => <option key={status} value={status}>{label(status)}</option>)}
          </select>
        </div>
        {error ? <div className="p-3"><ErrorBox message={error} onRetry={reload} /></div> : loading && !data ? <Loading /> : <DataTable rows={data?.items ?? []} columns={columns} rowKey={(row) => row.id} rowLink={(row) => `/certificados/${row.id}`} />}
        {data && <Pagination page={data.page} pageSize={data.page_size} total={data.total} onChange={(page) => setFilters({ ...filters, page })} />}
      </Card>
    </>
  );
}

interface LineState {
  po_item_id: number;
  quantity: string;
  calculation_method: string;
  cac_base_index_id: string;
  cac_update_index_id: string;
  contractual_amount: string;
  formula_text: string;
  adjustment_status: string;
  allow_overage: boolean;
  overage_reason: string;
}

export function NewCertificatePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const notify = useToast();
  const { meta } = useAuth();
  const [orderId, setOrderId] = useState(params.get("oc") ?? "");
  const orders = useApi<Page<PurchaseOrder>>("/purchase-orders", { page_size: 200, status: "vigente" });
  const order = useApi<PurchaseOrder>(orderId ? `/purchase-orders/${orderId}` : null);
  const indexes = useApi<Page<CacIndex>>("/cac-indexes", { page_size: 200 });
  const [header, setHeader] = useState({ client_number: "", document_type: "avance", status: "presentado", issue_date: todayIso(), period_from: "", period_to: "", received_date: "", approved_date: "", invoiced_date: "", payment_due_date: "", other_additions: "0", other_deductions: "0", notes: "" });
  const [lines, setLines] = useState<LineState[]>([]);
  const [error, setError] = useState("");
  const [overage, setOverage] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (order.data?.items) {
      setLines(
        order.data.items
          .filter((item) => item.status === "activo")
          .map((item) => ({ po_item_id: item.id, quantity: "", calculation_method: "ninguno", cac_base_index_id: "", cac_update_index_id: "", contractual_amount: "", formula_text: "", adjustment_status: "calculado", allow_overage: false, overage_reason: "" })),
      );
    }
  }, [order.data]);

  const setH = (key: string) => (value: string) => setHeader((current) => ({ ...current, [key]: value }));
  const setLine = (index: number, patch: Partial<LineState>) => setLines((current) => current.map((line, position) => (position === index ? { ...line, ...patch } : line)));
  const indexMap = useMemo(() => new Map((indexes.data?.items ?? []).map((row) => [String(row.id), row])), [indexes.data]);
  const po = order.data;
  const currency = po?.currency ?? "ARS";

  const estimate = useMemo(() => {
    let base = 0;
    let cac = 0;
    let cacApproved = 0;
    for (const line of lines) {
      const item = po?.items?.find((row) => row.id === line.po_item_id);
      if (!item) continue;
      const lineBase = Number(line.quantity || 0) * Number(item.unit_price);
      base += lineBase;
      let adjustment = 0;
      if (line.calculation_method === "variacion_simple") {
        const b = Number(indexMap.get(line.cac_base_index_id)?.published_value ?? 0);
        const u = Number(indexMap.get(line.cac_update_index_id)?.published_value ?? 0);
        if (b > 0 && u > 0) adjustment = lineBase * (u / b) - lineBase;
      } else if (line.calculation_method === "contractual") adjustment = Number(line.contractual_amount || 0);
      cac += adjustment;
      if (["aprobado", "facturado", "pagado"].includes(line.adjustment_status)) cacApproved += adjustment;
    }
    const additions = Number(header.other_additions || 0);
    const deductions = Number(header.other_deductions || 0);
    const type = po?.retention_base_type ?? "solo_base";
    const concepts = po?.retention_concepts ?? [];
    let subject = base;
    if (type === "base_mas_cac_aprobado") subject = base + cacApproved;
    if (type === "bruto_total") subject = base + cac + additions;
    if (type === "personalizada") subject = (concepts.includes("base") ? base : 0) + (concepts.includes("cac_aprobado") ? cacApproved : 0) + (concepts.includes("cac") ? cac : 0) + (concepts.includes("otros") ? additions : 0);
    const percent = Number(po?.retention_percent ?? 5);
    const retention = Math.round(subject * percent) / 100;
    const gross = base + cac + additions;
    return { base, cac, additions, subject, retention, gross, net: gross - retention - deductions, percent };
  }, [lines, po, indexMap, header.other_additions, header.other_deductions]);

  const submit = async () => {
    setError("");
    setOverage(null);
    if (!orderId) return setError("Elegí la orden de compra.");
    if (!header.client_number.trim()) return setError("Ingresá el número de certificado del cliente.");
    const used = lines.filter((line) => Number(line.quantity) > 0);
    if (!used.length) return setError("Cargá la cantidad certificada de al menos un rubro.");
    for (const line of used) {
      if (line.calculation_method === "variacion_simple" && (!line.cac_base_index_id || !line.cac_update_index_id)) return setError("Elegí los dos índices CAC para los rubros con variación simple.");
      if (line.calculation_method === "contractual" && line.contractual_amount === "") return setError("Ingresá el importe validado para los rubros con método contractual.");
      if (line.allow_overage && !line.overage_reason.trim()) return setError("Indicá el motivo del excedente autorizado.");
    }
    const payload = {
      ...header,
      purchase_order_id: Number(orderId),
      issue_date: header.issue_date || null,
      period_from: header.period_from || null,
      period_to: header.period_to || null,
      received_date: header.received_date || null,
      approved_date: header.approved_date || null,
      invoiced_date: header.invoiced_date || null,
      payment_due_date: header.payment_due_date || null,
      items: used.map((line) => ({
        po_item_id: line.po_item_id,
        quantity: line.quantity,
        calculation_method: line.calculation_method,
        cac_base_index_id: line.cac_base_index_id ? Number(line.cac_base_index_id) : null,
        cac_update_index_id: line.cac_update_index_id ? Number(line.cac_update_index_id) : null,
        contractual_amount: line.contractual_amount === "" ? null : line.contractual_amount,
        formula_text: line.formula_text,
        adjustment_status: line.adjustment_status,
        allow_overage: line.allow_overage,
        overage_reason: line.overage_reason,
      })),
    };
    setBusy(true);
    try {
      const { data } = await api.post<Certificate>("/certificates", payload);
      notify("Certificado guardado. Se generó su retención de caución.");
      navigate(`/certificados/${data.id}`);
    } catch (caught) {
      const body = errorBody(caught);
      if (body.code === "overage") setOverage(Number((body.details as { po_item_id?: number })?.po_item_id));
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader back={{ to: "/certificados", label: "Certificados" }} title="Nuevo certificado" subtitle="Los importes finales los calcula el servidor. Lo que ves acá es una vista previa." />
      <FormError message={error} />
      <Card title="Datos del certificado">
        <div className="row g-3">
          <SelectField name="order" label="Orden de compra" required value={orderId} onChange={setOrderId} placeholder="Elegí la orden" options={(orders.data?.items ?? []).map((row) => ({ value: row.id, label: `${row.client_po_number} · ${row.client_name} · ${row.project_name}` }))} className="col-12 col-md-6" />
          <Field name="client_number" label="Número de certificado del cliente" required value={header.client_number} onChange={setH("client_number")} className="col-12 col-md-3" />
          <SelectField name="document_type" label="Tipo" value={header.document_type} onChange={setH("document_type")} options={["avance", "nota_credito", "nota_debito"]} className="col-12 col-md-3" />
          <SelectField name="status" label="Estado" value={header.status} onChange={setH("status")} options={(meta?.certificate_statuses ?? []).filter((status) => !["anulado", "parcialmente_pagado", "pagado"].includes(status))} className="col-6 col-md-3" hint="Pagado se determina con los pagos registrados." />
          <Field name="issue_date" label="Fecha de emisión" type="date" value={header.issue_date} onChange={setH("issue_date")} className="col-6 col-md-3" />
          <Field name="period_from" label="Período desde" type="date" value={header.period_from} onChange={setH("period_from")} className="col-6 col-md-3" />
          <Field name="period_to" label="Período hasta" type="date" value={header.period_to} onChange={setH("period_to")} className="col-6 col-md-3" />
          <Field name="received_date" label="Recepción" type="date" value={header.received_date} onChange={setH("received_date")} className="col-6 col-md-3" />
          <Field name="approved_date" label="Aprobación" type="date" value={header.approved_date} onChange={setH("approved_date")} className="col-6 col-md-3" />
          <Field name="invoiced_date" label="Facturación" type="date" value={header.invoiced_date} onChange={setH("invoiced_date")} className="col-6 col-md-3" />
          <Field name="payment_due_date" label="Vencimiento del pago" type="date" value={header.payment_due_date} onChange={setH("payment_due_date")} className="col-6 col-md-3" />
        </div>
      </Card>

      {po && (
        <Card title="Ítems certificados en el período" bodyClass="p-0">
          {!lines.length ? (
            <div className="p-4 text-secondary">La orden no tiene rubros activos. <Link to={`/ordenes/${po.id}`}>Cargá los rubros</Link> primero.</div>
          ) : (
            <div className="list-group list-group-flush">
              {lines.map((line, index) => {
                const item = po.items?.find((row) => row.id === line.po_item_id);
                if (!item) return null;
                const projected = Number(item.certified_quantity) + Number(line.quantity || 0);
                const exceeds = projected > Number(item.contracted_quantity) + 0.0001;
                return (
                  <div key={line.po_item_id} className={`list-group-item p-3 ${overage === item.id ? "border-start border-4 border-danger" : ""}`}>
                    <div className="row g-2 align-items-end">
                      <div className="col-12 col-lg-4">
                        <div className="fw-semibold">{item.description}</div>
                        <div className="small text-secondary">
                          Contratado {quantity(item.contracted_quantity)} {item.unit_name} · certificado {quantity(item.certified_quantity)} · pendiente {quantity(item.pending_quantity)} · {money(item.unit_price, currency)}/u
                        </div>
                      </div>
                      <Field name={`q-${item.id}`} label="Cantidad del período" type="number" step="0.0001" min="0" value={line.quantity} onChange={(value) => setLine(index, { quantity: value })} className="col-6 col-lg-2" />
                      <SelectField name={`m-${item.id}`} label="Reajuste CAC" value={line.calculation_method} onChange={(value) => setLine(index, { calculation_method: value })} options={["ninguno", "variacion_simple", "contractual"]} className="col-6 col-lg-2" />
                      <div className="col-12 col-lg-4 text-lg-end">
                        <div className="small text-secondary">Importe base</div>
                        <div className="fw-semibold money">{money(Number(line.quantity || 0) * Number(item.unit_price), currency)}</div>
                      </div>
                      {line.calculation_method === "variacion_simple" && (
                        <>
                          <SelectField name={`bi-${item.id}`} label="Índice base" value={line.cac_base_index_id} onChange={(value) => setLine(index, { cac_base_index_id: value })} placeholder="Elegí" options={(indexes.data?.items ?? []).map((row) => ({ value: row.id, label: `${row.series_code} ${String(row.period_month).padStart(2, "0")}/${row.period_year} · ${row.published_value}` }))} className="col-12 col-md-4" />
                          <SelectField name={`ui-${item.id}`} label="Índice actualizado" value={line.cac_update_index_id} onChange={(value) => setLine(index, { cac_update_index_id: value })} placeholder="Elegí" options={(indexes.data?.items ?? []).map((row) => ({ value: row.id, label: `${row.series_code} ${String(row.period_month).padStart(2, "0")}/${row.period_year} · ${row.published_value}` }))} className="col-12 col-md-4" />
                        </>
                      )}
                      {line.calculation_method === "contractual" && (
                        <>
                          <Field name={`ca-${item.id}`} label="Reajuste validado" type="number" step="0.01" value={line.contractual_amount} onChange={(value) => setLine(index, { contractual_amount: value })} className="col-12 col-md-4" />
                          <Field name={`cf-${item.id}`} label="Fórmula contractual" value={line.formula_text} onChange={(value) => setLine(index, { formula_text: value })} className="col-12 col-md-4" placeholder="Ej.: polinómica 0,4 MO + 0,6 materiales" />
                        </>
                      )}
                      {line.calculation_method !== "ninguno" && (
                        <SelectField name={`as-${item.id}`} label="Estado del reajuste" value={line.adjustment_status} onChange={(value) => setLine(index, { adjustment_status: value })} options={["calculado", "presentado", "aprobado"]} className="col-12 col-md-4" hint="Un reajuste calculado no se toma como aprobado por el cliente." />
                      )}
                      {exceeds && (
                        <div className="col-12">
                          <div className="alert alert-warning py-2 mb-2 small">
                            Con esta cantidad el acumulado ({quantity(projected)}) supera lo contratado ({quantity(item.contracted_quantity)}). Solo se permite con autorización y motivo.
                          </div>
                          <div className="row g-2">
                            <CheckField name={`ov-${item.id}`} label="Autorizo el excedente" checked={line.allow_overage} onChange={(value) => setLine(index, { allow_overage: value })} className="col-12 col-md-4" />
                            {line.allow_overage && <Field name={`or-${item.id}`} label="Motivo del excedente" required value={line.overage_reason} onChange={(value) => setLine(index, { overage_reason: value })} className="col-12 col-md-8" />}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {po && (
        <div className="row g-3">
          <div className="col-12 col-lg-6">
            <Card title="Otros conceptos">
              <div className="row g-3">
                <Field name="other_additions" label="Otros conceptos a sumar" type="number" step="0.01" value={header.other_additions} onChange={setH("other_additions")} />
                <Field name="other_deductions" label="Otros descuentos o retenciones" type="number" step="0.01" value={header.other_deductions} onChange={setH("other_deductions")} />
                <Field name="notes" label="Observaciones" type="textarea" className="col-12" value={header.notes} onChange={setH("notes")} />
              </div>
            </Card>
          </div>
          <div className="col-12 col-lg-6">
            <Card title="Vista previa del cálculo">
              <div className="formula-box">
                <div className="formula-line"><span>Importe base</span><span className="money">{money(estimate.base, currency)}</span></div>
                <div className="formula-line"><span>Reajuste CAC</span><span className="money">{money(estimate.cac, currency)}</span></div>
                <div className="formula-line"><span>Otros conceptos</span><span className="money">{money(estimate.additions, currency)}</span></div>
                <div className="formula-line total"><span>Importe bruto</span><span className="money">{money(estimate.gross, currency)}</span></div>
                <div className="formula-line"><span>Base sujeta a retención ({label(po.retention_base_type)})</span><span className="money">{money(estimate.subject, currency)}</span></div>
                <div className="formula-line"><span>Retención del {estimate.percent}%</span><span className="money text-danger">− {money(estimate.retention, currency)}</span></div>
                <div className="formula-line"><span>Otros descuentos</span><span className="money text-danger">− {money(header.other_deductions || 0, currency)}</span></div>
                <div className="formula-line total"><span>Neto a cobrar</span><span className="money">{money(estimate.net, currency)}</span></div>
              </div>
              <button className="btn btn-primary w-100 mt-3" disabled={busy} onClick={submit}>
                {busy && <span className="spinner-border spinner-border-sm me-2" />}Guardar certificado
              </button>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}

function EditCertificateModal({ cert, onClose, onSaved }: { cert: Certificate; onClose: () => void; onSaved: () => void }) {
  const { meta } = useAuth();
  const [form, setForm] = useState({
    client_number: cert.client_number,
    status: cert.status,
    issue_date: cert.issue_date ?? "",
    received_date: cert.received_date ?? "",
    approved_date: cert.approved_date ?? "",
    invoiced_date: cert.invoiced_date ?? "",
    payment_due_date: cert.payment_due_date ?? "",
    notes: cert.notes,
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (key: string) => (value: string) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async () => {
    setBusy(true);
    setError("");
    const payload: Record<string, unknown> = { ...form };
    for (const key of ["issue_date", "received_date", "approved_date", "invoiced_date", "payment_due_date"]) if (!payload[key]) delete payload[key];
    try {
      await api.put(`/certificates/${cert.id}`, payload);
      onSaved();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Actualizar certificado" size="modal-lg" onClose={onClose} footer={<><button className="btn btn-outline-secondary" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={busy} onClick={submit}>Guardar</button></>}>
      <FormError message={error} />
      <p className="small text-secondary">Acá se cambian estado y fechas. Para corregir cantidades se anula el certificado y se carga uno nuevo, así queda la historia.</p>
      <div className="row g-3">
        <Field name="client_number" label="Número" value={form.client_number} onChange={set("client_number")} />
        <SelectField name="status" label="Estado" value={form.status} onChange={set("status")} options={(meta?.certificate_statuses ?? []).filter((status) => status !== "anulado")} hint="Pagado o parcialmente pagado se recalcula con los pagos aplicados." />
        <Field name="issue_date" label="Emisión" type="date" value={form.issue_date} onChange={set("issue_date")} />
        <Field name="received_date" label="Recepción" type="date" value={form.received_date} onChange={set("received_date")} />
        <Field name="approved_date" label="Aprobación" type="date" value={form.approved_date} onChange={set("approved_date")} />
        <Field name="invoiced_date" label="Facturación" type="date" value={form.invoiced_date} onChange={set("invoiced_date")} />
        <Field name="payment_due_date" label="Vencimiento del pago" type="date" value={form.payment_due_date} onChange={set("payment_due_date")} />
        <Field name="notes" label="Observaciones" type="textarea" className="col-12" value={form.notes} onChange={set("notes")} />
      </div>
    </Modal>
  );
}

export function CertificateDetailPage() {
  const { id } = useParams();
  const { isAdmin } = useAuth();
  const notify = useToast();
  const { data: cert, loading, error, reload } = useApi<Certificate>(`/certificates/${id}`);
  const [editing, setEditing] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [reactivating, setReactivating] = useState(false);

  if (loading && !cert) return <Loading />;
  if (error || !cert) return <ErrorBox message={error ?? "No se encontró el certificado."} />;
  const c = cert.currency;
  const voided = cert.status === "anulado";

  return (
    <>
      <PageHeader
        back={{ to: "/certificados", label: "Certificados" }}
        title={`Certificado ${cert.client_number}`}
        subtitle={<><Link to={`/ordenes/${cert.purchase_order_id}`}>OC {cert.purchase_order_number}</Link> · <Link to={`/obras/${cert.project_id}`}>{cert.project_name}</Link> · {cert.client_id && <Link to={`/clientes/${cert.client_id}`}>{cert.client_name}</Link>} · <StatusBadge value={cert.status} /></>}
        actions={
          voided ? (
            isAdmin && <button className="btn btn-outline-primary" onClick={() => setReactivating(true)}>Reactivar</button>
          ) : (
            <>
              <Link to={`/pagos?nuevo=1&cert=${cert.id}`} className="btn btn-primary"><i className="bi bi-cash-coin me-1" />Registrar pago</Link>
              <button className="btn btn-outline-secondary" onClick={() => setEditing(true)}><i className="bi bi-pencil me-1" />Estado y fechas</button>
              <button className="btn btn-outline-danger" onClick={() => setVoiding(true)}><i className="bi bi-slash-circle me-1" />Anular</button>
            </>
          )
        }
      />
      {voided && <div className="alert alert-secondary">Certificado anulado. No se computa en los saldos. Motivo: {cert.void_reason || "—"}</div>}

      <div className="row g-3">
        <div className="col-12 col-lg-6">
          <Card title="Cálculo del certificado">
            <div className="formula-box">
              <div className="formula-line"><span>Importe base certificado</span><span className="money">{money(cert.base_amount, c)}</span></div>
              <div className="formula-line"><span>Reajuste CAC registrado</span><span className="money">{money(cert.cac_amount, c)}</span></div>
              <div className="formula-line small text-secondary"><span>de los cuales aprobados por el cliente</span><span className="money">{money(cert.cac_approved_amount, c)}</span></div>
              <div className="formula-line"><span>Otros conceptos</span><span className="money">{money(cert.other_additions, c)}</span></div>
              <div className="formula-line total"><span>Importe bruto</span><span className="money">{money(cert.gross_amount, c)}</span></div>
              <div className="formula-line"><span>Base sujeta a retención</span><span className="money">{money(cert.retention_base_amount, c)}</span></div>
              <div className="formula-line"><span>Retención del {Number(cert.retention_percent_snapshot)}% ({label(cert.retention_base_type_snapshot)})</span><span className="money text-danger">− {money(cert.retention_amount, c)}</span></div>
              <div className="formula-line"><span>Otros descuentos</span><span className="money text-danger">− {money(cert.other_deductions, c)}</span></div>
              <div className="formula-line total"><span>Neto exigible</span><span className="money">{money(cert.net_amount, c)}</span></div>
            </div>
            <p className="small text-secondary mt-2 mb-0"><i className="bi bi-info-circle me-1" />{cert.retention_formula}</p>
          </Card>
        </div>
        <div className="col-12 col-lg-6">
          <Card title="Cobro">
            <div className="stat-grid mb-0" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <div className="stat-card stat-success"><div className="stat-label">Cobrado</div><div className="stat-value"><Money value={cert.collected_amount} currency={c} /></div></div>
              <div className="stat-card stat-warning"><div className="stat-label">Pendiente</div><div className="stat-value"><Money value={voided ? 0 : cert.pending_amount} currency={c} /></div></div>
            </div>
            <KeyValues
              items={[
                { label: "Emisión", value: date(cert.issue_date) },
                { label: "Período", value: cert.period_from ? `${date(cert.period_from)} – ${date(cert.period_to)}` : "—" },
                { label: "Aprobación", value: date(cert.approved_date) },
                { label: "Facturación", value: date(cert.invoiced_date) },
                { label: "Vencimiento del pago", value: date(cert.payment_due_date) },
                { label: "Tipo", value: label(cert.document_type) },
              ]}
            />
          </Card>
          {cert.retention && (
            <Card title="Retención de caución" actions={<Link to={`/retenciones/${cert.retention.id}`} className="btn btn-sm btn-outline-primary">Ver retención</Link>}>
              <KeyValues
                items={[
                  { label: "Retenido", value: <Money value={cert.retention.retained_amount} currency={c} /> },
                  { label: "Pendiente", value: <Money value={cert.retention.pending_amount} currency={c} /> },
                  { label: "Estado", value: <StatusBadge value={cert.retention.status} /> },
                  { label: "Liberación", value: cert.retention.expected_release_date ? date(cert.retention.expected_release_date) : "Pendiente de fecha de finalización" },
                ]}
              />
            </Card>
          )}
        </div>
      </div>

      <Card title="Ítems" bodyClass="p-0">
        <DataTable
          rows={cert.items ?? []}
          rowKey={(row) => row.id}
          columns={[
            { key: "d", header: "Rubro", render: (row) => <>{row.description}{row.overage_authorized && <div className="small text-warning">Excedente autorizado: {row.overage_reason}</div>}</>, primary: true },
            { key: "q", header: "Cantidad", align: "end", render: (row) => quantity(row.quantity) },
            { key: "acc", header: "Acumulado", align: "end", render: (row) => quantity(row.accumulated_quantity) },
            { key: "pu", header: "Precio unit.", align: "end", render: (row) => <Money value={row.unit_price} currency={c} /> },
            { key: "b", header: "Base", align: "end", render: (row) => <Money value={row.base_amount} currency={c} /> },
            { key: "m", header: "Método", render: (row) => label(row.calculation_method) },
            { key: "k", header: "Coef.", align: "end", render: (row) => row.coefficient ?? "—" },
            { key: "a", header: "Reajuste", align: "end", render: (row) => <Money value={row.adjustment_amount} currency={c} /> },
          ]}
        />
      </Card>

      <Card title="Reajustes CAC" bodyClass="p-0">
        <DataTable
          rows={cert.adjustments ?? []}
          rowKey={(row) => row.id}
          rowLink={(row) => `/reajustes/${row.id}`}
          empty={<div className="p-3 text-secondary">Sin reajustes.</div>}
          columns={[
            { key: "i", header: "Reajuste", render: (row) => `#${row.id} · ${label(row.method)}`, primary: true },
            { key: "s", header: "Estado", render: (row) => <StatusBadge value={row.status} /> },
            { key: "o", header: "Oficial", render: (row) => (row.official ? "Aprobado por el cliente" : "Estimado") },
            { key: "a", header: "Importe", align: "end", render: (row) => <Money value={row.adjustment_amount} currency={c} /> },
          ]}
        />
      </Card>

      <Card title="Pagos aplicados" bodyClass="p-0">
        <DataTable
          rows={cert.payments ?? []}
          rowKey={(row) => row.id}
          rowLink={(row) => `/pagos/${row.payment_id}`}
          empty={<div className="p-3 text-secondary">Todavía no se registraron pagos. Aprobado no significa pagado.</div>}
          columns={[
            { key: "d", header: "Fecha", render: (row) => date(row.payment_date), primary: true },
            { key: "r", header: "Referencia", render: (row) => row.reference || "—" },
            { key: "c", header: "Concepto", render: (row) => label(row.concept) },
            { key: "s", header: "Estado del pago", render: (row) => <StatusBadge value={row.payment_status} /> },
            { key: "a", header: "Importe", align: "end", render: (row) => <Money value={row.amount} currency={c} /> },
          ]}
        />
      </Card>

      <Attachments entityType="certificate" entityId={cert.id} />

      {editing && <EditCertificateModal cert={cert} onClose={() => setEditing(false)} onSaved={() => { notify("Certificado actualizado."); setEditing(false); reload(); }} />}
      {voiding && (
        <ConfirmDialog
          title="Anular certificado"
          danger
          requireReason
          confirmLabel="Anular"
          message={
            <>
              El certificado dejará de computarse en los saldos y su retención de <strong>{money(cert.retention_amount, c)}</strong> quedará anulada. Las cantidades certificadas se liberan. El registro sigue visible en el historial.
              {Number(cert.collected_amount) > 0 && <div className="alert alert-warning mt-2 mb-0 py-2">Tiene pagos aplicados: primero hay que anular esos pagos.</div>}
            </>
          }
          onCancel={() => setVoiding(false)}
          onConfirm={async (reason) => {
            try {
              await api.post(`/certificates/${cert.id}/void`, { reason });
              notify("Certificado anulado.");
              reload();
            } catch (caught) {
              notify(errorMessage(caught), "danger");
            }
            setVoiding(false);
          }}
        />
      )}
      {reactivating && (
        <ConfirmDialog
          title="Reactivar certificado"
          requireReason
          message="El certificado vuelve a computarse en los saldos con estado Presentado."
          onCancel={() => setReactivating(false)}
          onConfirm={async (reason) => {
            try {
              await api.post(`/certificates/${cert.id}/reactivate`, { reason });
              notify("Certificado reactivado.");
              reload();
            } catch (caught) {
              notify(errorMessage(caught), "danger");
            }
            setReactivating(false);
          }}
        />
      )}
    </>
  );
}
