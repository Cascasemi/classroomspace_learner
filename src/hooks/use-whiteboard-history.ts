/**
 * useWhiteboardHistory — Snapshot-based undo/redo for the whiteboard.
 *
 * Keeps an in-memory stack of whiteboard element snapshots (session-only, not persisted).
 *
 * Usage:
 *   const { push, pop, peek, clear, length } = useWhiteboardHistory();
 *
 * Push a snapshot BEFORE any destructive operation (clear, bulk-replace).
 * Call pop() to restore the previous state.
 */

import { useCallback, useRef, useState } from 'react';
import type { WBElement } from '@/lib/whiteboard/types';

// ==================== Types ====================

export interface WhiteboardSnapshot {
  /** Deep copy of whiteboard elements at capture time */
  elements: WBElement[];
  /** Unix timestamp (ms) */
  timestamp: number;
  /** Quick dedup fingerprint */
  fingerprint: string;
}

const MAX_SNAPSHOTS = 20;

// ==================== Fingerprint ====================

function fingerprint(elements: WBElement[]): string {
  return JSON.stringify(elements);
}

// ==================== Hook ====================

export function useWhiteboardHistory() {
  const [snapshots, setSnapshots] = useState<WhiteboardSnapshot[]>([]);
  // Use ref for synchronous access without re-render
  const snapshotsRef = useRef<WhiteboardSnapshot[]>([]);

  /**
   * Push a snapshot of the current whiteboard elements.
   * Skips empty or duplicate states.
   */
  const push = useCallback((elements: WBElement[]) => {
    if (!elements || elements.length === 0) return;

    const fp = fingerprint(elements);
    const latest = snapshotsRef.current[snapshotsRef.current.length - 1];
    if (latest?.fingerprint === fp) return;

    const snapshot: WhiteboardSnapshot = {
      elements: JSON.parse(JSON.stringify(elements)) as WBElement[], // deep copy
      timestamp: Date.now(),
      fingerprint: fp,
    };

    setSnapshots((prev) => {
      const next = [...prev, snapshot];
      snapshotsRef.current = next.length > MAX_SNAPSHOTS
        ? next.slice(-MAX_SNAPSHOTS)
        : next;
      return snapshotsRef.current;
    });
  }, []);

  /**
   * Pop and return the most recent snapshot (removes it from the stack).
   * Returns null if the history is empty.
   */
  const pop = useCallback((): WhiteboardSnapshot | null => {
    if (snapshotsRef.current.length === 0) return null;

    let popped: WhiteboardSnapshot | null = null;
    setSnapshots((prev) => {
      if (prev.length === 0) return prev;
      popped = prev[prev.length - 1];
      const next = prev.slice(0, -1);
      snapshotsRef.current = next;
      return next;
    });
    return popped;
  }, []);

  /**
   * Read the most recent snapshot without removing it.
   */
  const peek = useCallback((): WhiteboardSnapshot | null => {
    const list = snapshotsRef.current;
    return list.length > 0 ? list[list.length - 1] : null;
  }, []);

  /**
   * Get a snapshot by index (0 = oldest, length-1 = newest).
   */
  const getAt = useCallback((index: number): WhiteboardSnapshot | null => {
    return snapshotsRef.current[index] ?? null;
  }, []);

  /**
   * Clear all history.
   */
  const clear = useCallback(() => {
    snapshotsRef.current = [];
    setSnapshots([]);
  }, []);

  return {
    snapshots,
    length: snapshots.length,
    push,
    pop,
    peek,
    getAt,
    clear,
    canUndo: snapshots.length > 0,
  };
}
