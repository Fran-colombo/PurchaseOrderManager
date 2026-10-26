import type { ReactNode } from "react";
import { label } from "../utils/format";

interface BaseProps {
  name: string;
  label: string;
  required?: boolean;
  error?: string;
  hint?: ReactNode;
  className?: string;
}

export function Field({
  name,
  label: text,
  required,
  error,
  hint,
  className = "col-12 col-md-6",
  type = "text",
  value,
  onChange,
  placeholder,
  step,
  min,
  disabled,
}: BaseProps & {
  type?: string;
  value: string | number | null | undefined;
  onChange: (value: string) => void;
  placeholder?: string;
  step?: string;
  min?: string;
  disabled?: boolean;
}) {
  const id = `field-${name}`;
  return (
    <div className={className}>
      <label className="form-label" htmlFor={id}>
        {text} {required && <span className="text-danger">*</span>}
      </label>
      {type === "textarea" ? (
        <textarea id={id} className={`form-control ${error ? "is-invalid" : ""}`} rows={3} value={value ?? ""} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} disabled={disabled} />
      ) : (
        <input
          id={id}
          type={type}
          inputMode={type === "number" ? "decimal" : undefined}
          className={`form-control ${error ? "is-invalid" : ""}`}
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          required={required}
          step={step}
          min={min}
          disabled={disabled}
        />
      )}
      {error && <div className="invalid-feedback d-block">{error}</div>}
      {hint && !error && <div className="form-text">{hint}</div>}
    </div>
  );
}

export function SelectField({
  name,
  label: text,
  required,
  error,
  hint,
  className = "col-12 col-md-6",
  value,
  onChange,
  options,
  placeholder,
  disabled,
}: BaseProps & {
  value: string | number | null | undefined;
  onChange: (value: string) => void;
  options: { value: string | number; label: string }[] | string[];
  placeholder?: string;
  disabled?: boolean;
}) {
  const id = `field-${name}`;
  const normalized = options.map((option) => (typeof option === "string" ? { value: option, label: label(option) } : option));
  return (
    <div className={className}>
      <label className="form-label" htmlFor={id}>
        {text} {required && <span className="text-danger">*</span>}
      </label>
      <select id={id} className={`form-select ${error ? "is-invalid" : ""}`} value={value ?? ""} onChange={(event) => onChange(event.target.value)} disabled={disabled}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {normalized.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && <div className="invalid-feedback d-block">{error}</div>}
      {hint && !error && <div className="form-text">{hint}</div>}
    </div>
  );
}

export function CheckField({ name, label: text, checked, onChange, className = "col-12", hint }: { name: string; label: string; checked: boolean; onChange: (value: boolean) => void; className?: string; hint?: ReactNode }) {
  const id = `field-${name}`;
  return (
    <div className={className}>
      <div className="form-check">
        <input id={id} type="checkbox" className="form-check-input" checked={checked} onChange={(event) => onChange(event.target.checked)} />
        <label className="form-check-label" htmlFor={id}>
          {text}
        </label>
      </div>
      {hint && <div className="form-text">{hint}</div>}
    </div>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div className="alert alert-danger py-2 d-flex gap-2 align-items-start">
      <i className="bi bi-exclamation-circle mt-1" />
      <span>{message}</span>
    </div>
  );
}
