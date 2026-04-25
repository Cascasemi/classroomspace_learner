/**
 * useDraftCache — Generic debounced localStorage cache hook
 *
 * NeuroSpace adaptation: no 'use client' directive (Vite SPA, always client).
 *
 * Reads the initial value synchronously from localStorage on mount, then
 * exposes debounced writes so rapid updates don't overwhelm storage.
 *
 * Usage:
 *   const { cachedValue, updateCache, clearCache } = useDraftCache<Record<string,string[]>>({
 *     key: `quizDraft:${sceneId}`,
 *     debounceMs: 400,
 *   });
 */

import { useState, useRef, useCallback, useEffect } from 'react';

export interface UseDraftCacheOptions {
  key: string;
  /** Write debounce in ms — default 500 */
  debounceMs?: number;
}

export interface UseDraftCacheReturn<T> {
  /** Value read from localStorage on mount (undefined if nothing stored) */
  cachedValue: T | undefined;
  /** Debounced write — will flush within `debounceMs` */
  updateCache: (value: T) => void;
  /** Immediately removes the key from localStorage and cancels pending writes */
  clearCache: () => void;
}

export function useDraftCache<T>({
  key,
  debounceMs = 500,
}: UseDraftCacheOptions): UseDraftCacheReturn<T> {
  // Read initial value synchronously (only on first render)
  const [cachedValue] = useState<T | undefined>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) return JSON.parse(raw) as T;
    } catch {
      /* ignore parse errors */
    }
    return undefined;
  });

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<T | undefined>(undefined);
  // Keep key in a ref so callbacks capture the latest value without re-creating
  const keyRef = useRef(key);
  useEffect(() => {
    keyRef.current = key;
  }, [key]);

  /** Flush any pending debounced write immediately. */
  const flush = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (pendingRef.current !== undefined) {
      try {
        localStorage.setItem(keyRef.current, JSON.stringify(pendingRef.current));
      } catch {
        /* ignore quota errors */
      }
      pendingRef.current = undefined;
    }
  }, []);

  const updateCache = useCallback(
    (value: T) => {
      pendingRef.current = value;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        try {
          localStorage.setItem(keyRef.current, JSON.stringify(value));
        } catch {
          /* ignore quota errors */
        }
        pendingRef.current = undefined;
      }, debounceMs);
    },
    [debounceMs],
  );

  const clearCache = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    pendingRef.current = undefined;
    try {
      localStorage.removeItem(keyRef.current);
    } catch {
      /* ignore */
    }
  }, []);

  // Flush on unmount so pending writes aren't lost
  useEffect(() => {
    return () => {
      flush();
    };
  }, [flush]);

  return { cachedValue, updateCache, clearCache };
}
