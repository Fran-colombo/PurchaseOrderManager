import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { useAuth } from "../app/auth";
import { ClientNoticeRow } from "../components/ClientNotice";
import { Card, EmptyState, ErrorBox, Loading, Money, PageHeader, StatCard } from "../components/ui";
import { useApi } from "../hooks/useApi";
import type { Dashboard, Reminder } from "../types";
import { compactMoney, date, money, monthLabel } from "../utils/format";

const ALERT_ICONS: Record<string, string> = {
  caucion_7_dias: "bi-hourglass-split",
  caucion_habilitada: "bi-unlock",
  caucion_vencida: "bi-exclamation-octagon",
  sin_fecha: "bi-question-circle",
  certificado_vencido: "bi-calendar-x",
  pago_parcial: "bi-pie-chart",
  reajuste_pendiente: "bi-graph-up-arrow",
  obra_sin_cierre: "bi-flag",
};

function mergeSeries(...series: { key: string; rows: { month: string; amount: string }[] }[]) {
  const months = new Map<string, Record<string, number | string>>();
  for (const { key, rows } of series) {
    for (const row of rows) {
      const entry = months.get(row.month) ?? { month: row.month };
      entry[key] = Number(row.amount);
      months.set(row.month, entry);
    }
  }
  return [...months.values()].sort((a, b) => String(a.month).localeCompare(String(b.month)));
}

export default function DashboardPage() {
  const { data, loading, error, reload } = useApi<Dashboard>("/dashboard/summary");
  const notices = useApi<Reminder[]>("/reminders/client-notices");
  const { meta } = useAuth();
  const [currency, setCurrency] = useState("ARS");

  useEffect(() => {
    if (data && !data.currencies.includes(currency)) setCurrency(data.currencies[0] ?? "ARS");
  }, [data, currency]);

  if (loading && !data) return <Loading text="Calculando indicadores…" />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return null;

  const totals = data.by_currency[currency] ?? {};
  const charts = data.charts[currency];
  const definitions = data.definitions;
  const counts = data.counts;
  const evolution = charts
    ? mergeSeries(
        { key: "Certificado", rows: charts.monthly_certificates },
        { key: "Cobrado", rows: charts.monthly_collections },
        { key: "Retenido", rows: charts.monthly_retentions },
      )
    : [];

  let accumulated = 0;
  const retentionTrend = (charts?.monthly_retentions ?? []).map((row) => {
    accumulated += Number(row.amount);
    return { month: row.month, Acumulado: accumulated };
  });

  return (
    <>
      <PageHeader
        title="Centro de control"
        subtitle={`Datos al ${date(data.generated_on)}. Los importes se muestran en ${currency} y no se mezclan monedas.`}
        actions={
          <>
            {data.currencies.length > 1 && (
              <div className="btn-group" role="group" aria-label="Moneda">
                {data.currencies.map((code) => (
                  <button key={code} className={`btn btn-sm ${code === currency ? "btn-primary" : "btn-outline-secondary"}`} onClick={() => setCurrency(code)}>
                    {code}
                  </button>
                ))}
              </div>
            )}
            <button className="btn btn-sm btn-outline-secondary" onClick={reload}>
              <i className="bi bi-arrow-clockwise" /> Actualizar
            </button>
          </>
        }
      />

      <div className="stat-grid">
        <StatCard label="Total contratado" value={<Money value={totals.contracted} currency={currency} />} hint={definitions.contracted} to="/ordenes" icon="bi-file-earmark-text" />
        <StatCard label="Total certificado (base)" value={<Money value={totals.certified_base} currency={currency} />} hint={definitions.certified_base} to="/certificados" icon="bi-clipboard-check" tone="primary" />
        <StatCard label="Reajustes CAC aprobados" value={<Money value={totals.cac_approved} currency={currency} />} hint={definitions.cac_approved} to="/reajustes" icon="bi-graph-up-arrow" />
        <StatCard label="Total facturado" value={<Money value={totals.invoiced} currency={currency} />} hint={definitions.invoiced} to="/certificados?status=facturado" icon="bi-receipt" />
        <StatCard label="Cobrado" value={<Money value={totals.collected} currency={currency} />} hint={definitions.collected} to="/pagos" tone="success" icon="bi-cash-coin" />
        <StatCard label="Saldo pendiente de cobro" value={<Money value={totals.pending_collection} currency={currency} />} hint={definitions.pending_collection} to="/reportes?r=saldos_pendientes" tone="warning" icon="bi-hourglass" />
        <StatCard label="Total retenido por caución" value={<Money value={totals.retained} currency={currency} />} hint={definitions.retained} to="/retenciones" icon="bi-safe2" />
        <StatCard label="Cauciones recuperadas" value={<Money value={totals.recovered_retentions} currency={currency} />} hint={definitions.recovered_retentions} to="/retenciones?status=recuperada" tone="success" icon="bi-check2-circle" />
        <StatCard label="Cauciones por recuperar" value={<Money value={totals.pending_retentions} currency={currency} />} hint={definitions.pending_retentions} to="/retenciones" tone="danger" icon="bi-exclamation-diamond" />
        <StatCard label="Habilitadas para reclamar" value={counts.claimable_retentions} to="/retenciones?flag=claimable" tone={counts.claimable_retentions ? "danger" : "neutral"} icon="bi-unlock" />
        <StatCard label="Vencen en 30 días" value={counts.upcoming_30} to="/retenciones?flag=upcoming" tone={counts.upcoming_30 ? "warning" : "neutral"} icon="bi-calendar-event" />
        <StatCard label="Certificados vencidos e impagos" value={counts.overdue_certificates} to="/certificados" tone={counts.overdue_certificates ? "danger" : "neutral"} icon="bi-calendar-x" />
        <StatCard label="Reajustes pendientes" value={counts.pending_adjustments} hint={definitions.cac_pending} to="/reajustes?status=calculado" tone={counts.pending_adjustments ? "warning" : "neutral"} icon="bi-clock-history" />
      </div>

      {notices.data && notices.data.length > 0 && (
        <Card
          title={<><i className="bi bi-send me-2 text-success" />Avisos de cobro para enviar ({notices.data.length})</>}
          bodyClass="p-0"
        >
          <p className="small text-secondary px-3 pt-3 mb-0">
            Certificados y cauciones que vencen en una semana, mañana u hoy.{" "}
            {meta?.email_auto_send
              ? "Los clientes con correo cargado reciben el aviso automáticamente; acá quedan los que no tienen correo o los que todavía no salieron. También podés mandarlos ahora por WhatsApp o correo."
              : "Enviá el recordatorio al cliente por WhatsApp o correo: el mensaje ya viene escrito y el envío queda registrado."}
          </p>
          {notices.data.map((reminder) => (
            <ClientNoticeRow key={reminder.id} reminder={reminder} onDone={notices.reload} />
          ))}
        </Card>
      )}

      <div className="row g-3">
        <div className="col-12 col-xl-5">
          <Card title={`Alertas (${data.alerts.length})`} bodyClass="p-0">
            {data.alerts.length === 0 ? (
              <EmptyState title="Sin alertas" text="No hay vencimientos ni pendientes que requieran atención." />
            ) : (
              <div className="alert-list" style={{ maxHeight: 520, overflowY: "auto" }}>
                {data.alerts.map((alert, index) => (
                  <Link key={`${alert.kind}-${alert.path}-${index}`} to={alert.path} className="alert-row">
                    <span className={`alert-icon ${alert.priority}`}>
                      <i className={`bi ${ALERT_ICONS[alert.kind] ?? "bi-bell"}`} />
                    </span>
                    <span className="min-w-0 flex-grow-1">
                      <span className="d-block fw-medium">{alert.title}</span>
                      <span className="alert-meta">
                        Prioridad {alert.priority} · {alert.date ? date(alert.date) : "Sin fecha"}
                      </span>
                    </span>
                    {alert.amount && <Money value={alert.amount} currency={alert.currency || currency} className="fw-semibold small" />}
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>
        <div className="col-12 col-xl-7">
          <Card title="Evolución mensual">
            {evolution.length === 0 ? (
              <EmptyState title="Todavía no hay movimientos" text="Los gráficos aparecen cuando se cargan certificados y pagos." />
            ) : (
              <div className="chart-box">
                <ResponsiveContainer>
                  <BarChart data={evolution}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="month" tickFormatter={monthLabel} fontSize={12} />
                    <YAxis tickFormatter={(value) => compactMoney(Number(value), currency)} fontSize={11} width={70} />
                    <Tooltip formatter={(value) => money(Number(value), currency)} labelFormatter={(value) => monthLabel(String(value))} />
                    <Legend />
                    <Bar dataKey="Certificado" fill="#2f5d8a" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Cobrado" fill="#1f7a4d" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Retenido" fill="#b7791f" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        </div>
      </div>

      <div className="row g-3">
        <div className="col-12 col-lg-6">
          <Card title="Retenciones acumuladas">
            {retentionTrend.length === 0 ? (
              <EmptyState title="Sin retenciones" />
            ) : (
              <div className="chart-box">
                <ResponsiveContainer>
                  <LineChart data={retentionTrend}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="month" tickFormatter={monthLabel} fontSize={12} />
                    <YAxis tickFormatter={(value) => compactMoney(Number(value), currency)} fontSize={11} width={70} />
                    <Tooltip formatter={(value) => money(Number(value), currency)} labelFormatter={(value) => monthLabel(String(value))} />
                    <Line type="monotone" dataKey="Acumulado" stroke="#b7791f" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        </div>
        <div className="col-12 col-lg-6">
          <Card title="Próximas liberaciones (90 días)" bodyClass="p-0">
            {!charts?.upcoming_releases.length ? (
              <EmptyState title="No hay liberaciones próximas" text="Las retenciones sin fecha de finalización no tienen vencimiento calculado." />
            ) : (
              <div className="alert-list">
                {charts.upcoming_releases.map((row) => (
                  <Link key={row.path} to={row.path} className="alert-row">
                    <span className="alert-icon media">
                      <i className="bi bi-calendar-check" />
                    </span>
                    <span className="flex-grow-1 min-w-0">
                      <span className="d-block fw-medium">Certificado {row.label}</span>
                      <span className="alert-meta">Liberación {date(row.date)}</span>
                    </span>
                    <Money value={row.amount} currency={currency} className="fw-semibold small" />
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      <div className="row g-3">
        {[
          { title: "Saldo pendiente por cliente", rows: charts?.balances_by_client ?? [], base: "/clientes" },
          { title: "Saldo pendiente por obra", rows: charts?.balances_by_project ?? [], base: "/obras" },
        ].map((block) => (
          <div key={block.title} className="col-12 col-lg-6">
            <Card title={block.title}>
              {block.rows.length === 0 ? (
                <EmptyState title="Sin saldos pendientes" />
              ) : (
                <div className="chart-box" style={{ height: Math.max(160, block.rows.length * 44) }}>
                  <ResponsiveContainer>
                    <BarChart data={block.rows.map((row) => ({ name: row.name, Pendiente: Number(row.amount) }))} layout="vertical" margin={{ left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" tickFormatter={(value) => compactMoney(Number(value), currency)} fontSize={11} />
                      <YAxis type="category" dataKey="name" width={110} fontSize={12} />
                      <Tooltip formatter={(value) => money(Number(value), currency)} />
                      <Bar dataKey="Pendiente" fill="#2f5d8a" radius={[0, 3, 3, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
          </div>
        ))}
      </div>
    </>
  );
}
