import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type Tone = "success" | "danger" | "warning" | "info";
interface Toast {
  id: number;
  message: string;
  tone: Tone;
}

const ToastContext = createContext<(message: string, tone?: Tone) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const notify = useCallback((message: string, tone: Tone = "success") => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, message, tone }]);
    setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 5000);
  }, []);
  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`app-toast app-toast-${toast.tone}`}>
            <i
              className={`bi ${
                toast.tone === "success"
                  ? "bi-check-circle"
                  : toast.tone === "danger"
                    ? "bi-exclamation-octagon"
                    : toast.tone === "warning"
                      ? "bi-exclamation-triangle"
                      : "bi-info-circle"
              }`}
            />
            <span>{toast.message}</span>
            <button
              type="button"
              className="btn-close btn-close-sm ms-auto"
              aria-label="Cerrar"
              onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}
            />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
