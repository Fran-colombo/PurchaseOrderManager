import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../app/auth";
import { useToast } from "../app/toast";
import Attachments from "../components/Attachments";
import { CheckField, Field, FormError, SelectField } from "../components/form";
import { Card, ConfirmDialog, DataTable, ErrorBox, KeyValues, Loading, Modal, Money, PageHeader, Pagination, StatusBadge, type Column } from "../components/ui";
import { useApi, useStoredState } from "../hooks/useApi";
import { api, errorMessage } from "../services/api";
import type { Certificate, Claim, Client, Page, Payment, Retention } from "../types";
import { date, label, money, todayIso } from "../utils/format";
import { ClientPicker } from "./ContractPages";

/* ---------- Pagos ---------- */

interface AppLine {
  concept: string;
  target: string;
  amount: string;
  authorized_overage: boolean;
  overage_reason: string;
}

function useTargets(clientId: string) {
  const certificates = useApi<Page<Certificate>>(clientId ? "/certificates" : null, { client_id: clientId, page_size: 200 });
  const retentions = useApi<Page<Retention>>(clientId ? "/retentions" : null, { client_id: clientId, page_size: 200 });
  const certs = (certificates.data?.items ?? []).filter((row) => !["anulado", "borrador"].includes(row.status) && Number(row.pending_amount) > 0.009);
  const rets = (retentions.data?.items ?? []).filter((row) => Number(row.pending_amount) > 0.009 && row.status !== "anulada");
  return { certs, rets };
}

function ApplicationRows({ lines, setLines, certs, rets, currency }: { lines: AppLine[]; setLines: (lines: AppLine[]) => void; certs: Certificate[]; rets: Retention[]; currency: string }) {
  const { meta } = useAuth();
  const update = (index: number, patch: Partial<AppLine>) => setLines(lines.map((line, position) => (position === index ? { ...line, ...patch } : line)));
  return (
    <>
      {lines.map((line, index) => {
        const options =
          line.concept === "neto_certificado"
            ? certs.filter((row) => row.currency === currency).map((row) => ({ value: row.id, label: `Cert. ${row.client_number} · ${row.purchase_order_number} · pendiente ${money(row.pending_amount, row.currency)}` }))
            : line.concept === "devolucion_caucion"
              ? rets.filter((row) => row.currency === currency).map((row) => ({ value: row.id, label: `Caución cert. ${row.certificate_number} · pendiente ${money(row.pending_amount, row.currency)}` }))
              : [];
        return (
          <div key={index} className="row g-2 align-items-end border-bottom pb-2 mb-2">
            <SelectField name={`c-${index}`} label="Concepto" value={line.concept} onChange={(value) => update(index, { concept: value, target: "" })} options={meta?.payment_concepts ?? []} className="col-12 col-md-3" />
            {line.concept !== "otro" ? (
              <SelectField name={`t-${index}`} label={line.concept === "neto_certificado" ? "Certificado" : "Retención"} value={line.target} onChange={(value) => update(index, { target: value })} placeholder={options.length ? "Elegí" : "No hay saldos pendientes en esta moneda"} options={options} className="col-12 col-md-5" />
            ) : (
              <div className="col-12 col-md-5 small text-secondary">Importe no asociado a un certificado ni a una caución.</div>
            )}
            <Field name={`a-${index}`} label="Importe" type="number" step="0.01" value={line.amount} onChange={(value) => update(index, { amount: value })} className="col-8 col-md-3" />
            <div className="col-4 col-md-1 text-end">
              <button className="btn btn-outline-danger" aria-label="Quitar aplicación" onClick={() => setLines(lines.filter((_, position) => position !== index))}><i className="bi bi-x-lg" /></button>
            </div>
            <CheckField name={`o-${index}`} label="Ajuste autorizado: permitir superar el saldo" checked={line.authorized_overage} onChange={(value) => update(index, { authorized_overage: value })} className="col-12 col-md-5" />
            {line.authorized_overage && <Field name={`r-${index}`} label="Motivo del ajuste" required value={line.overage_reason} onChange={(value) => update(index, { overage_reason: value })} className="col-12 col-md-7" />}
          </div>
        );
      })}
      <button className="btn btn-sm btn-outline-primary" onClick={() => setLines([...lines, { concept: "neto_certificado", target: "", amount: "", authorized_overage: false, overage_reason: "" }])}>
        <i className="bi bi-plus-lg me-1" />Agregar aplicación
      </button>
    </>
  );
}

function linePayload(line: AppLine) {
  return {
    concept: line.concept,
    amount: line.amount,
    certificate_id: line.concept === "neto_certificado" ? Number(line.target) : null,
    retention_id: line.concept === "devolucion_caucion" ? Number(line.target) : null,
    authorized_overage: line.authorized_overage,
    overage_reason: line.overage_reason,
  };
}

function NewPaymentModal({ certificateId, retentionId, onClose, onSaved }: { certificateId?: string; retentionId?: string; onClose: () => void; onSaved: (payment: Payment) => void }) {
  const { meta } = useAuth();
  const [form, setForm] = useState({ client_id: "", payment_date: todayIso(), total_amount: "", currency: "ARS", method: "Transferencia", reference: "", notes: "" });
  const [lines, setLines] = useState<AppLine[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { certs, rets } = useTargets(form.client_id);
  const preset = useApi<Certificate>(certificateId ? `/certificates/${certificateId}` : null);
  const presetRetention = useApi<Retention>(retentionId ? `/retentions/${retentionId}` : null);
  const set = (key: string) => (value: string) => setForm((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    if (preset.data && !form.client_id) {
      setForm((current) => ({ ...current, client_id: String(preset.data!.client_id), currency: preset.data!.currency, total_amount: preset.data!.pending_amount }));
      setLines([{ concept: "neto_certificado", target: String(preset.data.id), amount: preset.data.pending_amount, authorized_overage: false, overage_reason: "" }]);
    }
  }, [preset.data, form.client_id]);

  useEffect(() => {
    if (presetRetention.data && !form.client_id) {
      const row = presetRetention.data;
      setForm((current) => ({ ...current, client_id: String(row.client_id), currency: row.currency, total_amount: row.pending_amount, method: "Transferencia" }));
      setLines([{ concept: "devolucion_caucion", target: String(row.id), amount: row.pending_amount, authorized_overage: false, overage_reason: "" }]);
    }
  }, [presetRetention.data, form.client_id]);

  const applied = lines.reduce((acc, line) => acc + Number(line.amount || 0), 0);
  const remaining = Number(form.total_amount || 0) - applied;

  const submit = async () => {
    setError("");
    if (!form.client_id) return setError("Elegí el cliente.");
    if (!(Number(form.total_amount) > 0)) return setError("El importe del pago debe ser mayor a cero.");
    if (remaining < -0.009 && !lines.some((line) => line.authorized_overage)) return setError("La suma aplicada supera el importe del pago.");
    for (const line of lines) {
      if (line.concept !== "otro" && !line.target) return setError("Elegí a qué certificado o caución se aplica cada importe.");
      if (!(Number(line.amount) > 0)) return setError("Cada aplicación debe tener un importe mayor a cero.");
      if (line.authorized_overage && !line.overage_reason.trim()) return setError("Indicá el motivo del ajuste autorizado.");
    }
    setBusy(true);
    try {
      const { data } = await api.post<Payment>("/payments", { ...form, client_id: Number(form.client_id), applications: lines.map(linePayload) });
      onSaved(data);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Registrar pago" size="modal-xl" onClose={onClose} footer={<><button className="btn btn-outline-secondary" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={busy} onClick={submit}>Registrar pago</button></>}>
      <FormError message={error} />
      <div className="row g-3">
        <ClientPicker value={form.client_id} onChange={(value) => { set("client_id")(value); setLines([]); }} className="col-12 col-md-6" />
        <Field name="payment_date" label="Fecha" type="date" required value={form.payment_date} onChange={set("payment_date")} className="col-6 col-md-3" />
        <SelectField name="currency" label="Moneda" value={form.currency} onChange={set("currency")} options={(meta?.currencies ?? ["ARS"]).map((code) => ({ value: code, label: code }))} className="col-6 col-md-3" />
        <Field name="total_amount" label="Importe total recibido" required type="number" step="0.01" value={form.total_amount} onChange={set("total_amount")} className="col-12 col-md-4" />
        <Field name="method" label="Medio de pago" value={form.method} onChange={set("method")} className="col-6 col-md-4" />
        <Field name="reference" label="N.º de transferencia o referencia" value={form.reference} onChange={set("reference")} className="col-6 col-md-4" />
        <Field name="notes" label="Observaciones" type="textarea" className="col-12" value={form.notes} onChange={set("notes")} />
      </div>
      <h3 className="fs-6 fw-semibold mt-4">Cómo se distribuye el pago</h3>
      <p className="small text-secondary">Un pago puede cubrir varios certificados o devolver cauciones. Un pago parcial deja el certificado como parcialmente pagado.</p>
      {form.client_id ? <ApplicationRows lines={lines} setLines={setLines} certs={certs} rets={rets} currency={form.currency} /> : <p className="text-secondary small">Elegí el cliente para ver sus saldos pendientes.</p>}
      <div className="formula-box mt-3">
        <div className="formula-line"><span>Importe del pago</span><span className="money">{money(form.total_amount || 0, form.currency)}</span></div>
        <div className="formula-line"><span>Aplicado</span><span className="money">{money(applied, form.currency)}</span></div>
        <div className={`formula-line total ${remaining < -0.009 ? "text-danger" : ""}`}><span>Sin aplicar</span><span className="money">{money(remaining, form.currency)}</span></div>
      </div>
    </Modal>
  );
}

export function PaymentsPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const notify = useToast();
  const [filters, setFilters] = useStoredState("filters.payments", { q: "", page: 1 });
  const { data, loading, error, reload } = useApi<Page<Payment>>("/payments", filters);
  const clients = useApi<Page<Client>>("/clients", { page_size: 200 });
  const clientName = (id: number) => clients.data?.items.find((row) => row.id === id)?.legal_name ?? "—";
  const creating = params.get("nuevo") === "1";
  const columns: Column<Payment>[] = [
    { key: "d", header: "Fecha", render: (row) => date(row.payment_date), primary: true },
    { key: "c", header: "Cliente", render: (row) => clientName(row.client_id) },
    { key: "r", header: "Referencia", render: (row) => row.reference || "—" },
    { key: "m", header: "Medio", render: (row) => row.method || "—", hideOnMobile: true },
    { key: "s", header: "Estado", render: (row) => <StatusBadge value={row.status} /> },
    { key: "u", header: "Sin aplicar", align: "end", render: (row) => <Money value={row.unapplied_amount} currency={row.currency} /> },
    { key: "t", header: "Importe", align: "end", render: (row) => <Money value={row.total_amount} currency={row.currency} /> },
  ];
  return (
    <>
      <PageHeader title="Pagos" subtitle="Dinero efectivamente recibido y su aplicación a certificados o cauciones." actions={<button className="btn btn-primary" onClick={() => setParams({ nuevo: "1" })}><i className="bi bi-plus-lg me-1" />Registrar pago</button>} />
      <Card bodyClass="p-0">
        <div className="filters">
          <input className="form-control" placeholder="Buscar por referencia" value={filters.q} onChange={(event) => setFilters({ ...filters, q: event.target.value, page: 1 })} aria-label="Buscar" />
        </div>
        {error ? <div className="p-3"><ErrorBox message={error} onRetry={reload} /></div> : loading && !data ? <Loading /> : <DataTable rows={data?.items ?? []} columns={columns} rowKey={(row) => row.id} rowLink={(row) => `/pagos/${row.id}`} />}
        {data && <Pagination page={data.page} pageSize={data.page_size} total={data.total} onChange={(page) => setFilters({ ...filters, page })} />}
      </Card>
      {creating && (
        <NewPaymentModal
          certificateId={params.get("cert") ?? undefined}
          retentionId={params.get("retencion") ?? undefined}
          onClose={() => setParams({})}
          onSaved={(payment) => {
            notify("Pago registrado.");
            navigate(`/pagos/${payment.id}`);
          }}
        />
      )}
    </>
  );
}

export function PaymentDetailPage() {
  const { id } = useParams();
  const notify = useToast();
  const { data: payment, loading, error, reload } = useApi<Payment>(`/payments/${id}`);
  const client = useApi<Client>(payment ? `/clients/${payment.client_id}` : null);
  const { certs, rets } = useTargets(payment ? String(payment.client_id) : "");
  const [adding, setAdding] = useState(false);
  const [lines, setLines] = useState<AppLine[]>([]);
  const [voiding, setVoiding] = useState(false);

  if (loading && !payment) return <Loading />;
  if (error || !payment) return <ErrorBox message={error ?? "No se encontró el pago."} />;
  const voided = payment.status === "anulado";

  return (
    <>
      <PageHeader
        back={{ to: "/pagos", label: "Pagos" }}
        title={`Pago ${payment.reference || `#${payment.id}`}`}
        subtitle={<>{client.data && <Link to={`/clientes/${client.data.id}`}>{client.data.legal_name}</Link>} · {date(payment.payment_date)} · <StatusBadge value={payment.status} /></>}
        actions={
          !voided && (
            <>
              <button className="btn btn-primary" disabled={Number(payment.unapplied_amount) <= 0} onClick={() => { setLines([{ concept: "neto_certificado", target: "", amount: payment.unapplied_amount, authorized_overage: false, overage_reason: "" }]); setAdding(true); }}>
                <i className="bi bi-diagram-3 me-1" />Aplicar saldo
              </button>
              <button className="btn btn-outline-danger" onClick={() => setVoiding(true)}><i className="bi bi-slash-circle me-1" />Anular</button>
            </>
          )
        }
      />
      {voided && <div className="alert alert-secondary">Pago anulado: sus aplicaciones ya no cuentan como cobradas. Motivo: {payment.void_reason}</div>}
      <div className="stat-grid">
        <div className="stat-card"><div className="stat-label">Importe recibido</div><div className="stat-value"><Money value={payment.total_amount} currency={payment.currency} /></div></div>
        <div className="stat-card stat-success"><div className="stat-label">Aplicado</div><div className="stat-value"><Money value={payment.applied_amount} currency={payment.currency} /></div></div>
        <div className="stat-card stat-warning"><div className="stat-label">Sin aplicar</div><div className="stat-value"><Money value={payment.unapplied_amount} currency={payment.currency} /></div></div>
      </div>
      <Card title="Aplicaciones" bodyClass="p-0">
        <DataTable
          rows={payment.applications ?? []}
          rowKey={(row) => row.id}
          empty={<div className="p-3 text-secondary">El pago todavía no se aplicó a ningún certificado o caución.</div>}
          columns={[
            { key: "c", header: "Concepto", render: (row) => label(row.concept), primary: true },
            {
              key: "t",
              header: "Destino",
              render: (row) => (row.certificate_id ? <Link to={`/certificados/${row.certificate_id}`}>Certificado #{row.certificate_id}</Link> : row.retention_id ? <Link to={`/retenciones/${row.retention_id}`}>Retención #{row.retention_id}</Link> : "—"),
            },
            { key: "a", header: "Importe", align: "end", render: (row) => <Money value={row.amount} currency={payment.currency} /> },
          ]}
        />
      </Card>
      <Card title="Datos del pago">
        <KeyValues items={[{ label: "Medio", value: payment.method || "—" }, { label: "Referencia", value: payment.reference || "—" }, { label: "Moneda", value: payment.currency }, { label: "Observaciones", value: payment.notes || "—" }]} />
      </Card>
      <Attachments entityType="payment" entityId={payment.id} title="Comprobantes" />

      {adding && (
        <Modal
          title="Aplicar saldo del pago"
          size="modal-xl"
          onClose={() => setAdding(false)}
          footer={
            <>
              <button className="btn btn-outline-secondary" onClick={() => setAdding(false)}>Cancelar</button>
              <button
                className="btn btn-primary"
                onClick={async () => {
                  try {
                    for (const line of lines) await api.post(`/payments/${payment.id}/applications`, linePayload(line));
                    notify("Aplicación registrada.");
                    setAdding(false);
                    reload();
                  } catch (caught) {
                    notify(errorMessage(caught), "danger");
                    reload();
                  }
                }}
              >
                Aplicar
              </button>
            </>
          }
        >
          <ApplicationRows lines={lines} setLines={setLines} certs={certs} rets={rets} currency={payment.currency} />
        </Modal>
      )}
      {voiding && (
        <ConfirmDialog
          title="Anular pago"
          danger
          requireReason
          confirmLabel="Anular pago"
          message={<>Se anulará el pago de <strong>{money(payment.total_amount, payment.currency)}</strong>. Los certificados y cauciones a los que se aplicó vuelven a mostrar saldo pendiente. El pago queda visible en el historial.</>}
          onCancel={() => setVoiding(false)}
          onConfirm={async (reason) => {
            try {
              await api.post(`/payments/${payment.id}/void`, { reason });
              notify("Pago anulado.");
              reload();
            } catch (caught) {
              notify(errorMessage(caught), "danger");
            }
            setVoiding(false);
          }}
        />
      )}
    </>
  );
}

/* ---------- Retenciones ---------- */

export function RetentionsPage() {
  const [params] = useSearchParams();
  const [filters, setFilters] = useStoredState("filters.retentions", { status: params.get("status") ?? "", flag: params.get("flag") ?? "", page: 1 });
  const { data, loading, error, reload } = useApi<Page<Retention>>("/retentions", { status: filters.status, page: filters.flag ? 1 : filters.page, page_size: filters.flag ? 200 : 20 });
  const rows = useMemo(() => {
    const items = data?.items ?? [];
    if (filters.flag === "claimable") return items.filter((row) => row.is_claimable);
    if (filters.flag === "upcoming") return items.filter((row) => row.is_upcoming_30);
    if (filters.flag === "overdue") return items.filter((row) => row.is_overdue);
    if (filters.flag === "missing") return items.filter((row) => row.missing_release_date);
    if (filters.flag === "pending") return items.filter((row) => Number(row.pending_amount) > 0.009 && row.status !== "anulada");
    return items;
  }, [data, filters.flag]);
  const columns: Column<Retention>[] = [
    { key: "c", header: "Certificado", render: (row) => row.certificate_number, primary: true },
    { key: "cl", header: "Cliente / obra", render: (row) => <>{row.client_name}<div className="small text-secondary">{row.project_name} · OC {row.purchase_order_number}</div></>, hideOnMobile: true },
    { key: "s", header: "Estado", render: (row) => <StatusBadge value={row.status} /> },
    { key: "r", header: "Retenido", align: "end", render: (row) => <Money value={row.retained_amount} currency={row.currency} /> },
    { key: "rec", header: "Recuperado", align: "end", render: (row) => <Money value={row.recovered_amount} currency={row.currency} />, hideOnMobile: true },
    { key: "p", header: "Pendiente", align: "end", render: (row) => <Money value={row.pending_amount} currency={row.currency} className={Number(row.pending_amount) > 0 ? "fw-semibold" : ""} /> },
    { key: "l", header: "Liberación", render: (row) => (row.expected_release_date ? <span className={row.is_overdue ? "text-danger fw-semibold" : row.is_upcoming_30 ? "text-warning fw-semibold" : ""}>{date(row.expected_release_date)}</span> : <span className="text-secondary">Pendiente de fecha</span>) },
  ];
  return (
    <>
      <PageHeader title="Retenciones de caución" subtitle="Una caución sigue pendiente hasta que se registra su devolución, aunque ya se haya reclamado." />
      <Card bodyClass="p-0">
        <div className="filters">
          <select className="form-select" value={filters.flag} onChange={(event) => setFilters({ ...filters, flag: event.target.value, page: 1 })} aria-label="Situación">
            <option value="">Todas</option>
            <option value="pending">Con saldo por recuperar</option>
            <option value="claimable">Habilitadas para reclamar</option>
            <option value="upcoming">Vencen en 30 días</option>
            <option value="overdue">Vencidas sin recuperar</option>
            <option value="missing">Sin fecha de finalización</option>
          </select>
          <select className="form-select" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value, page: 1 })} aria-label="Estado">
            <option value="">Todos los estados</option>
            {["pendiente_fecha_finalizacion", "en_plazo", "proxima", "habilitada_para_reclamar", "reclamada", "parcialmente_recuperada", "recuperada", "en_disputa", "vencida_impaga", "anulada"].map((status) => <option key={status} value={status}>{label(status)}</option>)}
          </select>
        </div>
        {error ? <div className="p-3"><ErrorBox message={error} onRetry={reload} /></div> : loading && !data ? <Loading /> : <DataTable rows={rows} columns={columns} rowKey={(row) => row.id} rowLink={(row) => `/retenciones/${row.id}`} />}
        {data && !filters.flag && <Pagination page={data.page} pageSize={data.page_size} total={data.total} onChange={(page) => setFilters({ ...filters, page })} />}
      </Card>
    </>
  );
}

export function RetentionDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const notify = useToast();
  const { data: row, loading, error, reload } = useApi<Retention>(`/retentions/${id}`);
  const [voiding, setVoiding] = useState(false);
  const [notes, setNotes] = useState<string | null>(null);

  if (loading && !row) return <Loading />;
  if (error || !row) return <ErrorBox message={error ?? "No se encontró la retención."} />;
  const c = row.currency;
  const pending = Number(row.pending_amount) > 0.009 && row.status !== "anulada";

  return (
    <>
      <PageHeader
        back={{ to: "/retenciones", label: "Retenciones" }}
        title={`Caución del certificado ${row.certificate_number}`}
        subtitle={<><Link to={`/clientes/${row.client_id}`}>{row.client_name}</Link> · <Link to={`/obras/${row.project_id}`}>{row.project_name}</Link> · <Link to={`/ordenes/${row.purchase_order_id}`}>OC {row.purchase_order_number}</Link> · <StatusBadge value={row.status} /></>}
        actions={
          pending && (
            <>
              <Link to={`/reclamos?nuevo=1&retencion=${row.id}`} className="btn btn-outline-primary"><i className="bi bi-megaphone me-1" />Registrar reclamo</Link>
              <button className="btn btn-primary" onClick={() => navigate(`/pagos?nuevo=1&retencion=${row.id}`)}><i className="bi bi-cash-coin me-1" />Registrar devolución</button>
              <button
                className="btn btn-outline-secondary"
                onClick={async () => {
                  try {
                    await api.put(`/retentions/${row.id}`, { disputed: !row.disputed });
                    notify(row.disputed ? "Se quitó la marca de disputa." : "Marcada como en disputa.");
                    reload();
                  } catch (caught) {
                    notify(errorMessage(caught), "danger");
                  }
                }}
              >
                {row.disputed ? "Quitar disputa" : "Marcar en disputa"}
              </button>
              {isAdmin && <button className="btn btn-outline-danger" onClick={() => setVoiding(true)} aria-label="Anular retención"><i className="bi bi-slash-circle" /></button>}
            </>
          )
        }
      />
      {row.missing_release_date && (
        <div className="alert alert-warning d-flex gap-2">
          <i className="bi bi-exclamation-triangle mt-1" />
          <div>
            <strong>Pendiente de fecha de finalización.</strong> Esta caución depende de «{label(row.release_trigger)}» y todavía no se registró esa fecha. No se calcula un vencimiento hasta tenerla. <Link to={`/ordenes/${row.purchase_order_id}`}>Registrar finalización</Link>
          </div>
        </div>
      )}
      {row.is_overdue && pending && <div className="alert alert-danger">La fecha de liberación ya pasó y la caución sigue sin recuperarse.</div>}

      <div className="stat-grid">
        <div className="stat-card"><div className="stat-label">Retenido</div><div className="stat-value"><Money value={row.retained_amount} currency={c} /></div></div>
        <div className="stat-card stat-success"><div className="stat-label">Recuperado</div><div className="stat-value"><Money value={row.recovered_amount} currency={c} /></div></div>
        <div className="stat-card stat-danger"><div className="stat-label">Pendiente de recuperar</div><div className="stat-value"><Money value={row.pending_amount} currency={c} /></div></div>
      </div>

      <div className="row g-3">
        <div className="col-12 col-lg-6">
          <Card title="Cómo se calculó">
            <div className="formula-box">
              {Object.entries(row.base_breakdown ?? {}).map(([key, value]) => (
                <div key={key} className="formula-line"><span>{key === "base" ? "Importe base" : key === "cac_aprobado" ? "CAC aprobado" : key === "cac" ? "CAC registrado" : "Otros conceptos"}</span><span className="money">{money(value, c)}</span></div>
              ))}
              <div className="formula-line total"><span>Base sujeta a retención</span><span className="money">{money(row.calculation_base, c)}</span></div>
              <div className="formula-line"><span>Porcentaje</span><span>{Number(row.percent)}%</span></div>
              <div className="formula-line total"><span>Retención</span><span className="money">{money(row.retained_amount, c)}</span></div>
            </div>
          </Card>
        </div>
        <div className="col-12 col-lg-6">
          <Card title="Plazo de liberación">
            <KeyValues
              items={[
                { label: "Criterio", value: label(row.release_trigger) },
                { label: "Plazo", value: `${row.release_days} días corridos` },
                { label: "Fecha que inicia el plazo", value: row.completion_date ? date(row.completion_date) : row.contractual_start_date ? date(row.contractual_start_date) : "Sin registrar" },
                { label: "Fecha pactada de liberación", value: date(row.explicit_release_date) },
                { label: "Liberación calculada", value: row.expected_release_date ? <strong>{date(row.expected_release_date)}</strong> : "Pendiente de determinar" },
                { label: "Habilitada para reclamar desde", value: date(row.claim_enabled_date) },
                { label: "Último reclamo", value: date(row.last_claim_date) },
                { label: "Próximo seguimiento", value: date(row.next_followup_date) },
              ]}
            />
          </Card>
        </div>
      </div>

      <Card title="Historial de reclamos" bodyClass="p-0">
        <DataTable
          rows={row.claims ?? []}
          rowKey={(claim: Claim) => claim.id}
          rowLink={(claim: Claim) => `/reclamos/${claim.id}`}
          empty={<div className="p-3 text-secondary">Todavía no se registraron reclamos para esta caución.</div>}
          columns={[
            { key: "d", header: "Fecha", render: (claim: Claim) => date(claim.claim_date), primary: true },
            { key: "c", header: "Canal", render: (claim: Claim) => label(claim.channel) },
            { key: "s", header: "Estado", render: (claim: Claim) => <StatusBadge value={claim.status} /> },
            { key: "p", header: "Pago prometido", render: (claim: Claim) => date(claim.promised_payment_date) },
            { key: "a", header: "Reclamado", align: "end", render: (claim: Claim) => <Money value={claim.amount_claimed} currency={claim.currency} /> },
          ]}
        />
      </Card>

      <Card title="Observaciones" actions={notes === null ? <button className="btn btn-sm btn-outline-secondary" onClick={() => setNotes(row.notes)}>Editar</button> : undefined}>
        {notes === null ? (
          <p className="mb-0 text-secondary">{row.notes || "Sin observaciones."}</p>
        ) : (
          <>
            <textarea className="form-control mb-2" rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} aria-label="Observaciones" />
            <button className="btn btn-sm btn-primary me-2" onClick={async () => { await api.put(`/retentions/${row.id}`, { notes }); setNotes(null); reload(); }}>Guardar</button>
            <button className="btn btn-sm btn-outline-secondary" onClick={() => setNotes(null)}>Cancelar</button>
          </>
        )}
      </Card>
      <Attachments entityType="retention" entityId={row.id} />

      {voiding && (
        <ConfirmDialog
          title="Anular retención"
          danger
          requireReason
          message="La retención dejará de computarse como pendiente. Usalo solo para corregir un error de carga; si el cliente la devolvió, registrá la devolución como pago."
          onCancel={() => setVoiding(false)}
          onConfirm={async (reason) => {
            try {
              await api.post(`/retentions/${row.id}/void`, { reason });
              notify("Retención anulada.");
              reload();
            } catch (caught) {
              notify(errorMessage(caught), "danger");
            }
            setVoiding(false);
          }}
        />
      )}
    </>
  );
}

/* ---------- Reclamos ---------- */

function NewClaimModal({ retentionId, onClose, onSaved }: { retentionId?: string; onClose: () => void; onSaved: (claim: Claim) => void }) {
  const { meta } = useAuth();
  const [form, setForm] = useState({ client_id: "", claim_date: todayIso(), channel: "correo", recipient: "", internal_owner: "", response: "", promised_payment_date: "", next_followup_date: "", status: "reclamo_enviado", currency: "ARS", notes: "" });
  const [selected, setSelected] = useState<string[]>(retentionId ? [retentionId] : []);
  const retentions = useApi<Page<Retention>>(form.client_id ? "/retentions" : null, { client_id: form.client_id, page_size: 200 });
  const preset = useApi<Retention>(retentionId ? `/retentions/${retentionId}` : null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (key: string) => (value: string) => setForm((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    if (preset.data && !form.client_id) setForm((current) => ({ ...current, client_id: String(preset.data!.client_id), currency: preset.data!.currency }));
  }, [preset.data, form.client_id]);

  const options = (retentions.data?.items ?? []).filter((row) => Number(row.pending_amount) > 0.009 && row.status !== "anulada");
  const chosen = options.filter((row) => selected.includes(String(row.id)));
  const total = chosen.reduce((acc, row) => acc + Number(row.pending_amount), 0);

  const submit = async () => {
    setError("");
    if (!form.client_id) return setError("Elegí el cliente.");
    setBusy(true);
    const first = chosen[0];
    try {
      const { data } = await api.post<Claim>("/claims", {
        ...form,
        client_id: Number(form.client_id),
        project_id: first?.project_id ?? null,
        purchase_order_id: first?.purchase_order_id ?? null,
        promised_payment_date: form.promised_payment_date || null,
        next_followup_date: form.next_followup_date || null,
        amount_claimed: total.toFixed(2),
        retentions: chosen.map((row) => ({ retention_id: row.id, amount: row.pending_amount })),
      });
      onSaved(data);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Registrar reclamo" size="modal-lg" onClose={onClose} footer={<><button className="btn btn-outline-secondary" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={busy} onClick={submit}>Registrar</button></>}>
      <FormError message={error} />
      <div className="row g-3">
        <ClientPicker value={form.client_id} onChange={(value) => { set("client_id")(value); setSelected([]); }} />
        <Field name="claim_date" label="Fecha del reclamo" type="date" required value={form.claim_date} onChange={set("claim_date")} />
        <div className="col-12">
          <label className="form-label">Cauciones reclamadas</label>
          {!form.client_id ? (
            <p className="small text-secondary mb-0">Elegí el cliente para ver sus cauciones pendientes.</p>
          ) : options.length === 0 ? (
            <p className="small text-secondary mb-0">Este cliente no tiene cauciones con saldo pendiente.</p>
          ) : (
            <div className="list-group">
              {options.map((row) => (
                <label key={row.id} className="list-group-item d-flex gap-2 align-items-center">
                  <input type="checkbox" className="form-check-input m-0" checked={selected.includes(String(row.id))} onChange={(event) => setSelected(event.target.checked ? [...selected, String(row.id)] : selected.filter((value) => value !== String(row.id)))} />
                  <span className="flex-grow-1">Cert. {row.certificate_number} · {row.project_name} <StatusBadge value={row.status} /></span>
                  <Money value={row.pending_amount} currency={row.currency} />
                </label>
              ))}
            </div>
          )}
          <div className="small mt-2">Importe reclamado: <strong>{money(total, form.currency)}</strong></div>
        </div>
        <SelectField name="channel" label="Canal" value={form.channel} onChange={set("channel")} options={meta?.channels ?? []} />
        <SelectField name="status" label="Estado" value={form.status} onChange={set("status")} options={(meta?.claim_statuses ?? []).filter((value) => value !== "anulado")} />
        <Field name="recipient" label="Contacto destinatario" value={form.recipient} onChange={set("recipient")} />
        <Field name="internal_owner" label="Responsable interno" value={form.internal_owner} onChange={set("internal_owner")} />
        <Field name="promised_payment_date" label="Fecha prometida de pago" type="date" value={form.promised_payment_date} onChange={set("promised_payment_date")} />
        <Field name="next_followup_date" label="Próximo seguimiento" type="date" value={form.next_followup_date} onChange={set("next_followup_date")} />
        <Field name="response" label="Respuesta recibida" type="textarea" className="col-12" value={form.response} onChange={set("response")} />
        <Field name="notes" label="Observaciones" type="textarea" className="col-12" value={form.notes} onChange={set("notes")} />
      </div>
      <p className="small text-secondary mt-3 mb-0">Registrar un reclamo no marca la caución como recuperada.</p>
    </Modal>
  );
}

export function ClaimsPage() {
  const { meta } = useAuth();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const notify = useToast();
  const [filters, setFilters] = useStoredState("filters.claims", { status: "", page: 1 });
  const { data, loading, error, reload } = useApi<Page<Claim>>("/claims", filters);
  const clients = useApi<Page<Client>>("/clients", { page_size: 200 });
  const clientName = (id: number) => clients.data?.items.find((row) => row.id === id)?.legal_name ?? "—";
  const columns: Column<Claim>[] = [
    { key: "d", header: "Fecha", render: (row) => date(row.claim_date), primary: true },
    { key: "c", header: "Cliente", render: (row) => clientName(row.client_id) },
    { key: "ch", header: "Canal", render: (row) => label(row.channel) },
    { key: "s", header: "Estado", render: (row) => <StatusBadge value={row.status} /> },
    { key: "f", header: "Próximo seguimiento", render: (row) => date(row.next_followup_date) },
    { key: "a", header: "Reclamado", align: "end", render: (row) => <Money value={row.amount_claimed} currency={row.currency} /> },
  ];
  return (
    <>
      <PageHeader title="Reclamos y seguimiento" actions={<button className="btn btn-primary" onClick={() => setParams({ nuevo: "1" })}><i className="bi bi-plus-lg me-1" />Registrar reclamo</button>} />
      <Card bodyClass="p-0">
        <div className="filters">
          <select className="form-select" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value, page: 1 })} aria-label="Estado">
            <option value="">Todos los estados</option>
            {(meta?.claim_statuses ?? []).map((status) => <option key={status} value={status}>{label(status)}</option>)}
          </select>
        </div>
        {error ? <div className="p-3"><ErrorBox message={error} onRetry={reload} /></div> : loading && !data ? <Loading /> : <DataTable rows={data?.items ?? []} columns={columns} rowKey={(row) => row.id} rowLink={(row) => `/reclamos/${row.id}`} />}
        {data && <Pagination page={data.page} pageSize={data.page_size} total={data.total} onChange={(page) => setFilters({ ...filters, page })} />}
      </Card>
      {params.get("nuevo") === "1" && <NewClaimModal retentionId={params.get("retencion") ?? undefined} onClose={() => setParams({})} onSaved={(claim) => { notify("Reclamo registrado. La caución sigue pendiente hasta su devolución."); navigate(`/reclamos/${claim.id}`); }} />}
    </>
  );
}

export function ClaimDetailPage() {
  const { id } = useParams();
  const { meta } = useAuth();
  const notify = useToast();
  const { data: claim, loading, error, reload } = useApi<Claim>(`/claims/${id}`);
  const client = useApi<Client>(claim ? `/clients/${claim.client_id}` : null);
  const [event, setEvent] = useState({ description: "", status: "", response: "", promised_payment_date: "", next_followup_date: "" });
  const [voiding, setVoiding] = useState(false);
  const [busy, setBusy] = useState(false);

  if (loading && !claim) return <Loading />;
  if (error || !claim) return <ErrorBox message={error ?? "No se encontró el reclamo."} />;

  const addEvent = async () => {
    if (!event.description.trim()) {
      notify("Describí la gestión o la respuesta.", "warning");
      return;
    }
    setBusy(true);
    const payload: Record<string, unknown> = { description: event.description };
    if (event.status) payload.status = event.status;
    if (event.response) payload.response = event.response;
    if (event.promised_payment_date) payload.promised_payment_date = event.promised_payment_date;
    if (event.next_followup_date) payload.next_followup_date = event.next_followup_date;
    try {
      await api.post(`/claims/${claim.id}/events`, payload);
      notify("Gestión registrada.");
      setEvent({ description: "", status: "", response: "", promised_payment_date: "", next_followup_date: "" });
      reload();
    } catch (caught) {
      notify(errorMessage(caught), "danger");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        back={{ to: "/reclamos", label: "Reclamos" }}
        title={`Reclamo del ${date(claim.claim_date)}`}
        subtitle={<>{client.data && <Link to={`/clientes/${client.data.id}`}>{client.data.legal_name}</Link>} · <StatusBadge value={claim.status} /></>}
        actions={claim.status !== "anulado" && <button className="btn btn-outline-danger" onClick={() => setVoiding(true)}><i className="bi bi-slash-circle me-1" />Anular</button>}
      />
      <div className="row g-3">
        <div className="col-12 col-lg-5">
          <Card title="Datos del reclamo">
            <KeyValues
              items={[
                { label: "Importe reclamado", value: <Money value={claim.amount_claimed} currency={claim.currency} /> },
                { label: "Canal", value: label(claim.channel) },
                { label: "Destinatario", value: claim.recipient || "—" },
                { label: "Responsable", value: claim.internal_owner || "—" },
                { label: "Pago prometido", value: date(claim.promised_payment_date) },
                { label: "Próximo seguimiento", value: date(claim.next_followup_date) },
                ...(claim.project_id ? [{ label: "Obra", value: <Link to={`/obras/${claim.project_id}`}>Ver obra</Link> }] : []),
                ...(claim.purchase_order_id ? [{ label: "Orden", value: <Link to={`/ordenes/${claim.purchase_order_id}`}>Ver orden</Link> }] : []),
              ]}
            />
            <div className="mt-3">
              <div className="small fw-semibold mb-1">Cauciones incluidas</div>
              {claim.retention_ids.length ? claim.retention_ids.map((retentionId) => <Link key={retentionId} to={`/retenciones/${retentionId}`} className="badge text-bg-light me-1 text-decoration-none">Retención #{retentionId}</Link>) : <span className="small text-secondary">Ninguna</span>}
            </div>
            {claim.response && <p className="small mt-3 mb-0"><strong>Última respuesta:</strong> {claim.response}</p>}
          </Card>
          {claim.status !== "anulado" && (
            <Card title="Registrar gestión">
              <div className="row g-2">
                <Field name="description" label="Qué se hizo o respondió" type="textarea" required className="col-12" value={event.description} onChange={(value) => setEvent({ ...event, description: value })} />
                <SelectField name="status" label="Nuevo estado" value={event.status} onChange={(value) => setEvent({ ...event, status: value })} placeholder="Sin cambios" options={(meta?.claim_statuses ?? []).filter((value) => value !== "anulado")} className="col-12" />
                <Field name="promised_payment_date" label="Fecha prometida" type="date" value={event.promised_payment_date} onChange={(value) => setEvent({ ...event, promised_payment_date: value })} className="col-6" />
                <Field name="next_followup_date" label="Próximo seguimiento" type="date" value={event.next_followup_date} onChange={(value) => setEvent({ ...event, next_followup_date: value })} className="col-6" />
                <div className="col-12"><button className="btn btn-primary w-100" disabled={busy} onClick={addEvent}>Guardar gestión</button></div>
              </div>
            </Card>
          )}
        </div>
        <div className="col-12 col-lg-7">
          <Card title="Historial cronológico">
            {!claim.events?.length ? (
              <p className="text-secondary mb-0">Sin gestiones registradas.</p>
            ) : (
              <ul className="timeline">
                {claim.events.map((item) => (
                  <li key={item.id}>
                    <div className="small text-secondary">{new Date(item.event_date).toLocaleString("es-AR")} · {label(item.event_type)}</div>
                    <div>{item.description}</div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Attachments entityType="claim" entityId={claim.id} title="Comprobantes del reclamo" />
        </div>
      </div>
      {voiding && (
        <ConfirmDialog
          title="Anular reclamo"
          danger
          requireReason
          message="El reclamo queda visible en el historial como anulado."
          onCancel={() => setVoiding(false)}
          onConfirm={async (reason) => {
            try {
              await api.post(`/claims/${claim.id}/void`, { reason });
              notify("Reclamo anulado.");
              reload();
            } catch (caught) {
              notify(errorMessage(caught), "danger");
            }
            setVoiding(false);
          }}
        />
      )}
    </>
  );
}
