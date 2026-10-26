const LABELS: Record<string, string> = {
  borrador: "Borrador",
  presentado: "Presentado",
  aprobado: "Aprobado",
  facturado: "Facturado",
  parcialmente_pagado: "Parcialmente pagado",
  pagado: "Pagado",
  observado: "Observado",
  anulado: "Anulado",
  anulada: "Anulada",
  calculado: "Calculado",
  rechazado: "Rechazado",
  reemplazado: "Reemplazado",
  registrado: "Registrado",
  planificacion: "Planificación",
  en_ejecucion: "En ejecución",
  finalizada: "Finalizada",
  suspendida: "Suspendida",
  cancelada: "Cancelada",
  vigente: "Vigente",
  activo: "Activo",
  inactivo: "Inactivo",
  pendiente_fecha_finalizacion: "Pendiente de fecha de finalización",
  en_plazo: "En plazo",
  proxima: "Próxima a vencer",
  habilitada_para_reclamar: "Habilitada para reclamar",
  reclamada: "Reclamada",
  parcialmente_recuperada: "Parcialmente recuperada",
  recuperada: "Recuperada",
  en_disputa: "En disputa",
  vencida_impaga: "Vencida sin recuperar",
  pendiente_de_reclamar: "Pendiente de reclamar",
  reclamo_enviado: "Reclamo enviado",
  en_seguimiento: "En seguimiento",
  fecha_de_pago_prometida: "Fecha de pago prometida",
  parcialmente_recuperado: "Parcialmente recuperado",
  recuperado: "Recuperado",
  solo_base: "Solo importe base",
  base_mas_cac_aprobado: "Base + CAC aprobado",
  bruto_total: "Bruto total",
  personalizada: "Personalizada",
  finalizacion_obra: "Finalización de la obra",
  finalizacion_orden: "Finalización de la orden",
  finalizacion_alcance: "Finalización de un alcance",
  fecha_contractual: "Fecha contractual",
  fecha_certificado: "Fecha del certificado",
  variacion_simple: "Variación simple",
  contractual: "Contractual",
  ninguno: "Sin reajuste",
  neto_certificado: "Neto de certificado",
  devolucion_caucion: "Devolución de caución",
  otro: "Otro",
  correo: "Correo",
  whatsapp: "WhatsApp",
  telefono: "Teléfono",
  nota_formal: "Nota formal",
  normal: "Normal",
  sysadmin: "Administrador",
  avance: "Avance",
  nota_credito: "Nota de crédito",
  nota_debito: "Nota de débito",
  incluido: "Incluido en certificado",
  complementario: "Certificado complementario",
  posterior: "Ajuste posterior",
  correccion: "Corrección",
  pendiente: "Pendiente",
  visto: "Visto",
  gestionado: "Gestionado",
  alta: "Alta",
  media: "Media",
  baja: "Baja",
  obra: "Obra",
  orden: "Orden de compra",
  alcance: "Alcance",
};

export function label(value?: string | null): string {
  if (!value) return "—";
  return LABELS[value] ?? value.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function money(value?: string | number | null, currency = "ARS"): string {
  if (value === null || value === undefined || value === "") return "—";
  const number = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(number)) return "—";
  const formatted = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(number);
  const symbol = currency === "USD" ? "US$" : "$";
  return `${symbol} ${formatted}`;
}

export function compactMoney(value: number, currency = "ARS"): string {
  const symbol = currency === "USD" ? "US$" : "$";
  return `${symbol} ${new Intl.NumberFormat("es-AR", { notation: "compact", maximumFractionDigits: 1 }).format(value)}`;
}

export function quantity(value?: string | number | null): string {
  if (value === null || value === undefined || value === "") return "—";
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 4 }).format(Number(value));
}

export function date(value?: string | null): string {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

export function dateTime(value?: string | null): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
}

export function todayIso(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

export function monthLabel(value: string): string {
  const [year, month] = value.split("-");
  const names = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${names[Number(month) - 1] ?? month} ${year?.slice(2)}`;
}

const TONES: Record<string, string> = {
  pagado: "success",
  recuperada: "success",
  recuperado: "success",
  aprobado: "primary",
  facturado: "info",
  parcialmente_pagado: "warning",
  parcialmente_recuperada: "warning",
  parcialmente_recuperado: "warning",
  proxima: "warning",
  habilitada_para_reclamar: "danger",
  vencida_impaga: "danger",
  en_disputa: "danger",
  observado: "warning",
  reclamada: "info",
  reclamo_enviado: "info",
  en_seguimiento: "info",
  fecha_de_pago_prometida: "primary",
  anulado: "secondary",
  anulada: "secondary",
  reemplazado: "secondary",
  rechazado: "secondary",
  borrador: "light",
  pendiente_fecha_finalizacion: "light",
  calculado: "light",
  presentado: "info",
  en_plazo: "light",
  vigente: "success",
  activo: "success",
  inactivo: "secondary",
  en_ejecucion: "primary",
  finalizada: "success",
};

export function tone(value?: string | null): string {
  return (value && TONES[value]) || "light";
}
