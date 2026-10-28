import axios, { AxiosError } from "axios";

const ACCESS_KEY = "conkreto.access";
const REFRESH_KEY = "conkreto.refresh";
const LOGOUT_REASON_KEY = "conkreto.logoutReason";

export const api = axios.create({ baseURL: "/api" });

export const tokens = {
  get access() {
    return localStorage.getItem(ACCESS_KEY);
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY);
  },
  set(access: string, refresh: string) {
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

/** Momento (ms) en que vence el token, leído del propio JWT. */
export function tokenExpiry(token: string | null): number | null {
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function sessionExpired(): boolean {
  const expiry = tokenExpiry(tokens.access);
  return expiry !== null && Date.now() >= expiry;
}

export function expireSession() {
  tokens.clear();
  sessionStorage.setItem(LOGOUT_REASON_KEY, "expired");
  window.dispatchEvent(new Event("conkreto:logout"));
}

export function logoutReason(): string | null {
  return sessionStorage.getItem(LOGOUT_REASON_KEY);
}

export function clearLogoutReason() {
  sessionStorage.removeItem(LOGOUT_REASON_KEY);
}

api.interceptors.request.use((config) => {
  const access = tokens.access;
  if (access) config.headers.Authorization = `Bearer ${access}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const url = error.config?.url ?? "";
    const isAuthCall = url.startsWith("/auth/login") || url.startsWith("/auth/refresh");
    if (error.response?.status === 401 && !isAuthCall && tokens.access) expireSession();
    return Promise.reject(error);
  },
);

export type ApiErrorBody = {
  detail?: string;
  code?: string;
  details?: Record<string, unknown>;
  errors?: { loc: (string | number)[]; msg: string }[];
};

export function errorBody(error: unknown): ApiErrorBody {
  if (axios.isAxiosError(error)) return (error.response?.data as ApiErrorBody) ?? {};
  return {};
}

export function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) return "No hay conexión con el servidor.";
    const body = error.response.data as ApiErrorBody;
    return body?.detail ?? "Ocurrió un error inesperado.";
  }
  return "Ocurrió un error inesperado.";
}

export function fieldErrors(error: unknown): Record<string, string> {
  const body = errorBody(error);
  const result: Record<string, string> = {};
  for (const item of body.errors ?? []) {
    const key = String(item.loc[item.loc.length - 1]);
    result[key] = item.msg.replace(/^Value error, /, "");
  }
  return result;
}

export async function download(path: string, filename: string) {
  const response = await api.get(path, { responseType: "blob" });
  const url = URL.createObjectURL(response.data);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
