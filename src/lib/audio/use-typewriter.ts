/**
 * Streaming Text Hook
 *
 * Uses requestAnimationFrame for smooth character-by-character text reveal.
 * Provides skip() and reset() controls.
 *
 * Backward-compatible: still exports useTypewriter for existing usage.
 *
 * Usage (primary):
 *   const { displayedText, isStreaming, skip } = useStreamingText({ text, speed: 52 });
 * Usage (legacy):
 *   const { revealed, done, skip } = useTypewriter(text, 52);
 */

import { useState, useEffect, useCallback, useRef } from 'react';

// ─── useStreamingText (primary) ────────────────────────────────────────────────

export interface StreamingTextOptions {
  text: string;
  /** Characters per second, default 52 */
  speed?: number;
  onComplete?: () => void;
  /** When false, display all text immediately (no animation). Default true. */
  enabled?: boolean;
}

export interface StreamingTextResult {
  displayedText: string;
  isStreaming: boolean;
  /** Skip animation and show full text immediately */
  skip: () => void;
  /** Reset to empty string */
  reset: () => void;
}

export function useStreamingText(options: StreamingTextOptions): StreamingTextResult {
  const { text, speed = 52, onComplete, enabled = true } = options;

  const [displayedText, setDisplayedText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);

  const frameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const lastIndexRef = useRef(0);

  const skip = useCallback(() => {
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    setDisplayedText(text);
    setIsStreaming(false);
    startTimeRef.current = null;
    lastIndexRef.current = text.length;
    onComplete?.();
  }, [text, onComplete]);

  const reset = useCallback(() => {
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    setDisplayedText('');
    setIsStreaming(false);
    startTimeRef.current = null;
    lastIndexRef.current = 0;
  }, []);

  useEffect(() => {
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    startTimeRef.current = null;
    lastIndexRef.current = 0;

    if (!enabled || !text) {
      setDisplayedText(text ?? '');
      setIsStreaming(false);
      return;
    }

    // Very long text — skip animation for performance
    if (text.length > 500) {
      setDisplayedText(text);
      setIsStreaming(false);
      onComplete?.();
      return;
    }

    setIsStreaming(true);
    setDisplayedText('');

    const animate = (timestamp: number) => {
      if (!startTimeRef.current) startTimeRef.current = timestamp;

      const elapsed = timestamp - startTimeRef.current;
      const targetIndex = Math.min(Math.floor((elapsed / 1000) * speed), text.length);

      if (targetIndex > lastIndexRef.current) {
        lastIndexRef.current = targetIndex;
        setDisplayedText(text.slice(0, targetIndex));
      }

      if (targetIndex < text.length) {
        frameRef.current = requestAnimationFrame(animate);
      } else {
        setIsStreaming(false);
        frameRef.current = null;
        onComplete?.();
      }
    };

    frameRef.current = requestAnimationFrame(animate);

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, speed, enabled]);

  return { displayedText, isStreaming, skip, reset };
}

// ─── useTypewriter (legacy alias) ────────────────────────────────────────────

export interface TypewriterResult {
  /** The currently visible substring of text. */
  revealed: string;
  /** True when the full text has been revealed. */
  done: boolean;
  /** Skip animation and show full text immediately. */
  skip: () => void;
}

/**
 * @param text  The full text to reveal (or null for no text).
 * @param cps   Characters per second to reveal (default 52).
 */
export function useTypewriter(text: string | null, cps = 52): TypewriterResult {
  const { displayedText, isStreaming, skip } = useStreamingText({
    text: text ?? '',
    speed: cps,
    enabled: text !== null && text.length > 0,
  });

  return {
    revealed: displayedText,
    done: !isStreaming && displayedText.length >= (text?.length ?? 0),
    skip,
  };
}
