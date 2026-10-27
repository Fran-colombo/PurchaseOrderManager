import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../app/auth";
import { useToast } from "../app/toast";
import { api, errorMessage } from "../services/api";
import type { Reminder } from "../types";
import { date } from "../utils/format";
import { Modal, Money } from "./ui";

type Channel = "whatsapp" | "email";

export function ClientNoticeButtons({ reminder, onDone, compact = false }: { reminder: Reminder; onDone: () => void; compact?: boolean }) {
  const notify = useToast();
  const { meta } = useAuth();
  const [preview, setPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const contact = reminder.contact;
  if (!contact) return null;
  const serverEmail = Boolean(meta?.email_enabled && contact.email);

  const send = async (channel: Channel) => {
    if (channel === "email" && serverEmail) {
      setSending(true);
      try {
        await api.post(`/reminders/${reminder.id}/send-email`);
        notify(`Correo enviado a ${contact.email}. El aviso quedó registrado.`);
        onDone();
      } catch (caught) {
        notify(errorMessage(caught), "danger");
      } finally {
        setSending(false);
      }
      return;
    }
    window.open(channel === "whatsapp" ? contact.whatsapp_url : contact.mailto_url, "_blank", "noopener");
    try {
      await api.post(`/reminders/${reminder.id}/contacted`, { channel });
      notify(channel === "whatsapp" ? "Se abrió WhatsApp con el mensaje. El aviso quedó registrado." : "Se abrió el correo con el mensaje. El aviso quedó registrado.");
      onDone();
    } catch (caught) {
      notify(errorMessage(caught), "danger");
    }
  };

  return (
    <>
      <div className={`d-flex flex-wrap gap-1 ${compact ? "" : "mt-2"}`}>
        <button type="button" className="btn btn-sm btn-success" onClick={() => send("whatsapp")} title={contact.phone ? `Enviar a ${contact.phone}` : "Sin teléfono: elegís el contacto en WhatsApp"}>
          <i className="bi bi-whatsapp me-1" />WhatsApp
        </button>
        <button type="button" className="btn btn-sm btn-outline-primary" disabled={sending} onClick={() => send("email")} title={contact.email ? (serverEmail ? `Enviar ahora desde el sistema a ${contact.email}` : `Enviar a ${contact.email}`) : "Sin correo cargado"}>
          {sending ? <span className="spinner-border spinner-border-sm me-1" /> : <i className="bi bi-envelope me-1" />}
          {serverEmail ? "Enviar correo" : "Correo"}
        </button>
        <button type="button" className="btn btn-sm btn-link px-1" onClick={() => setPreview(true)}>
          Ver mensaje
        </button>
      </div>
      {preview && (
        <Modal
          title="Mensaje para el cliente"
          onClose={() => setPreview(false)}
          footer={
            <>
              <button
                className="btn btn-outline-secondary"
                onClick={() => {
                  navigator.clipboard?.writeText(contact.message);
                  notify("Mensaje copiado.");
                }}
              >
                <i className="bi bi-clipboard me-1" />Copiar
              </button>
              <button className="btn btn-outline-primary" onClick={() => { setPreview(false); send("email"); }}>
                <i className="bi bi-envelope me-1" />Correo
              </button>
              <button className="btn btn-success" onClick={() => { setPreview(false); send("whatsapp"); }}>
                <i className="bi bi-whatsapp me-1" />WhatsApp
              </button>
            </>
          }
        >
          <dl className="kv-grid mb-3">
            <div className="kv-item"><dt>Cliente</dt><dd>{contact.client_name || "—"}</dd></div>
            <div className="kv-item"><dt>Contacto</dt><dd>{contact.contact_name || "—"}</dd></div>
            <div className="kv-item"><dt>Teléfono</dt><dd>{contact.phone || <span className="text-warning">Sin cargar</span>}</dd></div>
            <div className="kv-item"><dt>Correo</dt><dd>{contact.email || <span className="text-warning">Sin cargar</span>}</dd></div>
          </dl>
          <div className="small text-secondary mb-1">Asunto: {contact.subject}</div>
          <div className="formula-box" style={{ whiteSpace: "pre-wrap" }}>{contact.message}</div>
          {(!contact.phone || !contact.email) && contact.client_id && (
            <p className="small text-secondary mt-2 mb-0">
              Completá los datos en la <Link to={`/clientes/${contact.client_id}`} onClick={() => setPreview(false)}>ficha del cliente</Link>. El teléfono conviene cargarlo con código de país y área, sin 0 ni 15 (ej.: 5491123456789).
            </p>
          )}
        </Modal>
      )}
    </>
  );
}

export function ClientNoticeRow({ reminder, onDone }: { reminder: Reminder; onDone: () => void }) {
  const contact = reminder.contact;
  return (
    <div className="notice-row">
      <div className="min-w-0 flex-grow-1">
        <Link to={reminder.link_path} className="fw-medium text-decoration-none d-block">{reminder.title}</Link>
        <div className="small text-secondary">
          {contact?.client_name} · vence {date(reminder.due_date)} · <Money value={reminder.amount} currency={reminder.currency} />
        </div>
      </div>
      <ClientNoticeButtons reminder={reminder} onDone={onDone} compact />
    </div>
  );
}
