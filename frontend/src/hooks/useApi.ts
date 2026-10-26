import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorMessage } from "../services/api";

export function useApi<T>(path: string | null, params?: Record<string, unknown>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [error, setError] = useState<string | null>(null);
  const key = JSON.stringify(params ?? {});
  const requestId = useRef(0);

  const load = useCallback(async () => {
    if (!path) return;
    const current = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const cleaned = Object.fromEntries(Object.entries(JSON.parse(key)).filter(([, value]) => value !== "" && value !== null && value !== undefined));
      const response = await api.get<T>(path, { params: cleaned });
      if (current === requestId.current) setData(response.data);
    } catch (caught) {
      if (current === requestId.current) setError(errorMessage(caught));
    } finally {
      if (current === requestId.current) setLoading(false);
    }
  }, [path, key]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, reload: load, setData };
}

export function useStoredState<T>(storageKey: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      return raw ? { ...initial, ...JSON.parse(raw) } : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    sessionStorage.setItem(storageKey, JSON.stringify(value));
  }, [storageKey, value]);
  return [value, setValue] as const;
}
