import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api';

// Module-level GET cache for dashboard cards. Dragging a card across columns
// (or into the DragOverlay) remounts it; without a cache every remount flashed
// a skeleton and refired the fetch, collapsing the ghost slot to skeleton
// height. Stale-while-revalidate: a remounted card seeds synchronously from
// the cache and a background refresh keeps the data fresh.
const cache = new Map<string, { data: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

/** Fetch with in-flight dedupe; `force` bypasses dedupe (post-mutation refresh). */
function fetchAndCache(path: string, force = false): Promise<unknown> {
  if (!force) {
    const pending = inflight.get(path);
    if (pending) return pending;
  }
  const p = apiFetch<unknown>(path)
    .then((data) => {
      cache.set(path, { data });
      return data;
    })
    .finally(() => {
      if (inflight.get(path) === p) inflight.delete(path);
    });
  inflight.set(path, p);
  return p;
}

/**
 * Cached GET for dashboard cards. Pass `null` to skip fetching (conditional
 * requests). `data` is null while an uncached path loads; `error` reports the
 * most recent fetch failure (a card with cached data may keep rendering it);
 * `refresh` refires the request, bypassing dedupe.
 */
export function useCachedApi<T>(path: string | null): { data: T | null; error: boolean; refresh: () => void } {
  const readCache = (p: string | null) => (p != null && cache.has(p) ? (cache.get(p)!.data as T) : null);

  // Seed synchronously from the cache so remounts never show a skeleton.
  const [data, setData] = useState<T | null>(() => readCache(path));
  const [error, setError] = useState(false);
  const [nonce, setNonce] = useState(0);

  // Key change (e.g. NetWorth range): reconcile during render — a cached key
  // seeds instantly, an uncached key clears stale data/error so the skeleton
  // shows while loading and errors report against the new key.
  const [prevPath, setPrevPath] = useState(path);
  if (path !== prevPath) {
    setPrevPath(path);
    setData(readCache(path));
    setError(false);
  }

  useEffect(() => {
    if (path == null) return;
    let live = true;
    fetchAndCache(path, nonce > 0)
      .then((d) => { if (live) { setData(d as T); setError(false); } })
      .catch(() => { if (live) setError(true); });
    return () => { live = false; };
  }, [path, nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  return { data, error, refresh };
}
