import axios, { AxiosError } from "axios";

const ACCESS_KEY = "conkreto.access";
const REFRESH_KEY = "conkreto.refresh";

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

api.interceptors.request.use((config) => {
  const access = tokens.access;
  if (access) config.headers.Authorization = `Bearer ${access}`;
  return config;
});

let refreshing: Promise<string | null> | null = null;

async function refreshAccess(): Promise<string | null> {
  const refresh = tokens.refresh;
  if (!refresh) return null;
  try {
    const { data } = await axios.post("/api/auth/refresh", { refresh_token: refresh });
    tokens.set(data.access_token, data.refresh_token);
    return data.access_token;
  } catch {
    tokens.clear();
    return null;
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as (typeof error.config & { _retry?: boolean }) | undefined;
    const isAuthCall = original?.url?.startsWith("/auth/login") || original?.url?.startsWith("/auth/refresh");
    if (error.response?.status === 401 && original && !original._retry && !isAuthCall) {
      original._retry = true;
      refreshing = refreshing ?? refreshAccess().finally(() => (refreshing = null));
      const access = await refreshing;
      if (access) {
        original.headers = original.headers ?? {};
        (original.headers as Record<string, string>).Authorization = `Bearer ${access}`;
        return api(original);
      }
      window.dispatchEvent(new Event("conkreto:logout"));
    }
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
