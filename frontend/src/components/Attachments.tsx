import { useRef, useState } from "react";
import { useToast } from "../app/toast";
import { useApi } from "../hooks/useApi";
import { api, download, errorMessage } from "../services/api";
import { dateTime } from "../utils/format";
import { Card, ConfirmDialog, EmptyState, Loading } from "./ui";

interface DocumentRow {
  id: number;
  original_name: string;
  size_bytes: number;
  uploaded_at: string;
  download_path: string;
}

export default function Attachments({ entityType, entityId, title = "Documentación" }: { entityType: string; entityId: number; title?: string }) {
  const { data, loading, reload } = useApi<DocumentRow[]>("/documents", { entity_type: entityType, entity_id: entityId });
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<DocumentRow | null>(null);
  const notify = useToast();

  const upload = async (file: File) => {
    const form = new FormData();
    form.append("entity_type", entityType);
    form.append("entity_id", String(entityId));
    form.append("file", file);
    setBusy(true);
    try {
      await api.post("/documents", form);
      notify("Archivo adjuntado.");
      reload();
    } catch (error) {
      notify(errorMessage(error), "danger");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <Card
      title={title}
      actions={
        <>
          <input ref={input} type="file" className="d-none" accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls,.csv,.doc,.docx,.txt" onChange={(event) => event.target.files?.[0] && upload(event.target.files[0])} />
          <button className="btn btn-sm btn-outline-primary" disabled={busy} onClick={() => input.current?.click()}>
            {busy ? <span className="spinner-border spinner-border-sm me-1" /> : <i className="bi bi-upload me-1" />}
            Adjuntar
          </button>
        </>
      }
      bodyClass="p-0"
    >
      {loading ? (
        <Loading />
      ) : !data?.length ? (
        <EmptyState title="Sin archivos" text="PDF, imágenes, Excel o Word de hasta 10 MB." />
      ) : (
        <ul className="list-group list-group-flush">
          {data.map((document) => (
            <li key={document.id} className="list-group-item d-flex align-items-center gap-2 flex-wrap">
              <i className="bi bi-file-earmark text-secondary" />
              <button className="btn btn-link p-0 text-start text-truncate" style={{ maxWidth: "100%" }} onClick={() => download(document.download_path, document.original_name)}>
                {document.original_name}
              </button>
              <span className="small text-secondary ms-auto">
                {(document.size_bytes / 1024).toFixed(0)} KB · {dateTime(document.uploaded_at)}
              </span>
              <button className="btn btn-sm btn-outline-danger" aria-label="Eliminar archivo" onClick={() => setRemoving(document)}>
                <i className="bi bi-trash" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {removing && (
        <ConfirmDialog
          title="Eliminar archivo"
          message={`Se eliminará «${removing.original_name}». La acción queda registrada en la auditoría.`}
          danger
          confirmLabel="Eliminar"
          onCancel={() => setRemoving(null)}
          onConfirm={async () => {
            try {
              await api.delete(`/documents/${removing.id}`);
              notify("Archivo eliminado.");
              reload();
            } catch (error) {
              notify(errorMessage(error), "danger");
            }
            setRemoving(null);
          }}
        />
      )}
    </Card>
  );
}
