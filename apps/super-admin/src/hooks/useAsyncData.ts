import { useCallback, useEffect, useRef, useState } from "react";
import { getApiError } from "@barbaari/shared";

export function useAsyncData<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);
  const reload = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true); setError("");
    try {
      const result = await loader();
      if (mountedRef.current && requestId === requestIdRef.current) setData(result);
    } catch (err) {
      if (mountedRef.current && requestId === requestIdRef.current) setError(getApiError(err).message);
    } finally {
      if (mountedRef.current && requestId === requestIdRef.current) setLoading(false);
    }
  }, deps);
  useEffect(() => {
    mountedRef.current = true;
    void reload();
    return () => { mountedRef.current = false; };
  }, [reload]);
  return { data, loading, error, reload };
}
