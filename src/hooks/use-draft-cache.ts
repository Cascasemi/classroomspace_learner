/**
 * useDraftCache — Debounced localStorage persistence hook
 *
 * Reads a stored value from localStorage on mount and exposes an
 * `updateCache()` function that debounces writes so rapid updates
 * don't hammer the synchronous storage API.
 *
 * Usage:
 *   const { cachedValue, updateCache, clearCache } = useDraftCache<MyType>({
 *     key: 'ns_my_draft',
 *     debounceMs: 500,
 *   });
 */

import { useState, useRef, useCallback, useEffect } from 'react';

interface UseDraftCacheOptions {
  /** localStorage key */
  key: string;
  /** Debounce delay in ms before actually writing (default 500) */
  debounceMs?: number;
}

interface UseDraftCacheReturn<T> {
  /** The value last persisted to localStorage (undefined if nothing stored) */
  cachedValue: T | undefined;
  /** Schedule a debounced write of value to localStorage */
  updateCache: (value: T) => void;
  /** Clear both the in-memory pending value and the localStorage entry */
  clearCache: () => void;
}

export function useDraftCache<T>({
  key,
  debounceMs = 500,
}: UseDraftCacheOptions): UseDraftCacheReturn<T> {
  // Read initial value synchronously from localStorage
  const [cachedValue] = useState<T | undefined>(() => {
    if (typeof window === 'undefined') return undefined;
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) return JSON.parse(raw) as T;
    } catch {
      /* ignore parse errors */
    }
    return undefined;
  });

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingValueRef = useRef<T | undefined>(undefined);
  const keyRef = useRef(key);

  useEffect(() => {
    keyRef.current = key;
  }, [key]);

  /** Flush any pending write immediately (useful on unmount) */
  const flushPending = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (pendingValueRef.current !== undefined) {
      try {
        localStorage.setItem(keyRef.current, JSON.stringify(pendingValueRef.current));
      } catch {
        /* ignore quota errors */
      }
      pendingValueRef.current = undefined;
    }
  }, []);

  // Flush on unmount to avoid losing data
  useEffect(() => () => flushPending(), [flushPending]);

  const updateCache = useCallback(
    (value: T) => {
      pendingValueRef.current = value;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        try {
          localStorage.setItem(keyRef.current, JSON.stringify(value));
        } catch {
          /* ignore quota errors */
        }
        pendingValueRef.current = undefined;
      }, debounceMs);
    },
    [debounceMs],
  );

  const clearCache = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    pendingValueRef.current = undefined;
    try {
      localStorage.removeItem(keyRef.current);
    } catch {
      /* ignore */
    }
  }, []);

  return { cachedValue, updateCache, clearCache };
}
