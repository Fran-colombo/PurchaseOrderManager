import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { label, money, tone } from "../utils/format";

export function StatusBadge({ value }: { value?: string | null }) {
  const color = tone(value);
  return <span className={`badge status-badge text-bg-${color}`}>{label(value)}</span>;
}

export function Money({ value, currency = "ARS", className = "" }: { value?: string | number | null; currency?: string; className?: string }) {
  return <span className={`money ${className}`}>{money(value, currency)}</span>;
}

export function Loading({ text = "Cargando…" }: { text?: string }) {
  return (
    <div className="state-box">
      <div className="spinner-border spinner-border-sm text-secondary" role="status" />
      <span>{text}</span>
    </div>
  );
}

export function EmptyState({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="state-box empty">
      <i className="bi bi-inbox fs-3 text-secondary" />
      <div>
        <div className="fw-semibold">{title}</div>
        {text && <div className="text-secondary small">{text}</div>}
      </div>
      {action}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="alert alert-danger d-flex align-items-center gap-2 flex-wrap">
      <i className="bi bi-exclamation-octagon" />
      <span className="me-auto">{message}</span>
      {onRetry && (
        <button className="btn btn-sm btn-outline-danger" onClick={onRetry}>
          Reintentar
        </button>
      )}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, back }: { title: string; subtitle?: ReactNode; actions?: ReactNode; back?: { to: string; label: string } }) {
  return (
    <div className="page-header">
      <div className="min-w-0">
        {back && (
          <Link to={back.to} className="back-link">
            <i className="bi bi-arrow-left" /> {back.label}
          </Link>
        )}
        <h1 className="page-title">{title}</h1>
        {subtitle && <div className="page-subtitle">{subtitle}</div>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className = "", bodyClass = "" }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClass?: string }) {
  return (
    <section className={`panel ${className}`}>
      {(title || actions) && (
        <header className="panel-header">
          <h2 className="panel-title">{title}</h2>
          {actions && <div className="d-flex gap-2 flex-wrap">{actions}</div>}
        </header>
      )}
      <div className={`panel-body ${bodyClass}`}>{children}</div>
    </section>
  );
}

export function KeyValues({ items }: { items: { label: string; value: ReactNode; hint?: string }[] }) {
  return (
    <dl className="kv-grid">
      {items.map((item) => (
        <div key={item.label} className="kv-item">
          <dt title={item.hint}>{item.label}</dt>
          <dd>{item.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Modal({
  title,
  onClose,
  children,
  footer,
  size = "",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: "" | "modal-lg" | "modal-xl";
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.classList.add("modal-open");
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.classList.remove("modal-open");
    };
  }, [onClose]);
  return (
    <>
      <div className="modal d-block" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
        <div className={`modal-dialog modal-dialog-scrollable modal-fullscreen-sm-down ${size}`}>
          <div className="modal-content">
            <div className="modal-header">
              <h2 className="modal-title fs-5">{title}</h2>
              <button type="button" className="btn-close" aria-label="Cerrar" onClick={onClose} />
            </div>
            <div className="modal-body">{children}</div>
            {footer && <div className="modal-footer">{footer}</div>}
          </div>
        </div>
      </div>
      <div className="modal-backdrop show" />
    </>
  );
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirmar",
  danger = false,
  requireReason = false,
  details,
  busy = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  requireReason?: boolean;
  details?: ReactNode;
  busy?: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState("");
  const blocked = requireReason && !reason.trim();
  return (
    <Modal
      title={title}
      onClose={onCancel}
      footer={
        <>
          <button className="btn btn-outline-secondary" onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
          <button className={`btn ${danger ? "btn-danger" : "btn-primary"}`} disabled={blocked || busy} onClick={() => onConfirm(reason.trim())}>
            {busy && <span className="spinner-border spinner-border-sm me-2" />}
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="mb-3">{message}</div>
      {details}
      {requireReason && (
        <div className="mt-3">
          <label className="form-label" htmlFor="confirm-reason">
            Motivo <span className="text-danger">*</span>
          </label>
          <textarea id="confirm-reason" className="form-control" rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Queda registrado en la auditoría" />
        </div>
      )}
    </Modal>
  );
}

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  align?: "end" | "start";
  primary?: boolean;
  hideOnMobile?: boolean;
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  onRowClick,
  rowLink,
  empty,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string | number;
  onRowClick?: (row: T) => void;
  rowLink?: (row: T) => string;
  empty?: ReactNode;
}) {
  if (!rows.length) return <>{empty ?? <EmptyState title="No hay registros" text="Probá con otros filtros o cargá uno nuevo." />}</>;
  const primary = columns.find((column) => column.primary) ?? columns[0];
  return (
    <>
      <div className="table-responsive d-none d-md-block">
        <table className="table table-hover align-middle data-table mb-0">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key} className={column.align === "end" ? "text-end" : ""}>
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)} className={onRowClick || rowLink ? "clickable" : ""} onClick={() => onRowClick?.(row)}>
                {columns.map((column) => (
                  <td key={column.key} className={column.align === "end" ? "text-end text-nowrap" : ""}>
                    {rowLink && column === primary ? (
                      <Link to={rowLink(row)} className="fw-semibold text-decoration-none">
                        {column.render(row)}
                      </Link>
                    ) : (
                      column.render(row)
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="d-md-none mobile-cards">
        {rows.map((row) => {
          const content = (
            <>
              <div className="mobile-card-title">{primary.render(row)}</div>
              <dl className="mobile-card-grid">
                {columns
                  .filter((column) => column !== primary && !column.hideOnMobile)
                  .map((column) => (
                    <div key={column.key}>
                      <dt>{column.header}</dt>
                      <dd>{column.render(row)}</dd>
                    </div>
                  ))}
              </dl>
            </>
          );
          return rowLink ? (
            <Link key={rowKey(row)} to={rowLink(row)} className="mobile-card">
              {content}
            </Link>
          ) : (
            <div key={rowKey(row)} className={`mobile-card ${onRowClick ? "clickable" : ""}`} onClick={() => onRowClick?.(row)}>
              {content}
            </div>
          );
        })}
      </div>
    </>
  );
}

export function Pagination({ page, pageSize, total, onChange }: { page: number; pageSize: number; total: number; onChange: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  return (
    <div className="pagination-bar">
      <span className="text-secondary small">
        {total} {total === 1 ? "registro" : "registros"} · página {page} de {pages}
      </span>
      <div className="btn-group">
        <button className="btn btn-sm btn-outline-secondary" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Página anterior">
          <i className="bi bi-chevron-left" />
        </button>
        <button className="btn btn-sm btn-outline-secondary" disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="Página siguiente">
          <i className="bi bi-chevron-right" />
        </button>
      </div>
    </div>
  );
}

export function Tabs({ tabs, active, onChange }: { tabs: { key: string; label: string; count?: number }[]; active: string; onChange: (key: string) => void }) {
  return (
    <div className="tabs-scroll" role="tablist">
      {tabs.map((tab) => (
        <button key={tab.key} role="tab" aria-selected={active === tab.key} className={`tab-btn ${active === tab.key ? "active" : ""}`} onClick={() => onChange(tab.key)}>
          {tab.label}
          {tab.count !== undefined && <span className="tab-count">{tab.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function StatCard({
  label: title,
  value,
  hint,
  to,
  tone: color = "neutral",
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  to?: string;
  tone?: "neutral" | "success" | "warning" | "danger" | "primary";
  icon?: string;
}) {
  const body = (
    <>
      <div className="stat-label">
        {icon && <i className={`bi ${icon}`} />}
        <span>{title}</span>
        {hint && <i className="bi bi-info-circle stat-hint" title={hint} aria-label={hint} />}
      </div>
      <div className="stat-value">{value}</div>
    </>
  );
  return to ? (
    <Link to={to} className={`stat-card stat-${color}`}>
      {body}
    </Link>
  ) : (
    <div className={`stat-card stat-${color}`}>{body}</div>
  );
}
