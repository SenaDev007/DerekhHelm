"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/** Petit hook maison : fetch JSON + rafraîchissement périodique + rechargement manuel */
export function useApi<T>(url: string | null, opts?: { intervalMs?: number }) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const urlRef = useRef(url);
  useEffect(() => {
    urlRef.current = url;
  }, [url]);

  const reload = useCallback(async (silent = false) => {
    const u = urlRef.current;
    if (!u) return;
    if (!silent) setLoading(true);
    try {
      const r = await fetch(u);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `Erreur ${r.status}`);
      setData(d);
      setError(null);
      setUpdatedAt(Date.now());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch asynchrone, le setState réel a lieu après await
    reload();
    const t = opts?.intervalMs ? setInterval(() => reload(true), opts.intervalMs) : null;
    return () => {
      if (t) clearInterval(t);
    };
  }, [url, reload]);

  return { data, error, loading, reload, updatedAt };
}
