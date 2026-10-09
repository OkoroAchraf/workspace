import { useCallback, useEffect, useRef, useState } from 'react';

import { errorMessage } from '@/shared/api';

export interface ApiDataState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
  /** Replace the cached value locally (e.g. after a mutation) without refetching. */
  setData: (next: T | null) => void;
}

/**
 * Loads data from an async backend call, cancels stale responses on unmount / dependency change,
 * and exposes a manual reload. `deps` are the values the loader closes over (plus the global
 * refresh key, so Demo Mode actions re-fetch every visible page).
 */
export function useApiData<T>(loader: () => Promise<T>, deps: unknown[]): ApiDataState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    loaderRef
      .current()
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(errorMessage(err));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  return { data, loading, error, reload, setData };
}
