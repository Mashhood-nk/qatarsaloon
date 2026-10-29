import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "./api";

/** Loads data from an async function; reload() refetches. Optional polling while the tab is visible. */
export function useData<T>(load: () => Promise<T>, deps: unknown[], opts: { pollMs?: number } = {}) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const loadRef = useRef(load);
  loadRef.current = load;

  const reload = useCallback(async () => {
    try {
      const d = await loadRef.current();
      setData(d);
      setError(null);
      return d;
    } catch (e) {
      setError(errorMessage(e));
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    if (!opts.pollMs) return;
    const tick = () => {
      if (document.visibilityState === "visible") void reload();
    };
    const id = window.setInterval(tick, opts.pollMs);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [opts.pollMs, reload]);

  return { data, setData, error, loading, reload };
}
