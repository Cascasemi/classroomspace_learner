/**
 * useStreamingText — rAF-based character-by-character text reveal
 *
 * Uses requestAnimationFrame so timing is governed by the screen refresh
 * rate, not setTimeout drift.
 *
 * Usage:
 *   const { displayedText, isStreaming, skip, reset } = useStreamingText({
 *     text: agent.speech,
 *     speed: 35,
 *     onComplete: () => console.log('done'),
 *   });
 */

import { useState, useEffect, useCallback, useRef } from 'react';

export interface StreamingTextOptions {
  /** Full text to stream in */
  text: string;
  /** Characters per second (default 30) */
  speed?: number;
  /** Called once the full text has been revealed */
  onComplete?: () => void;
  /** Set false to skip animation and show text immediately (default true) */
  enabled?: boolean;
  /** Text length above which streaming is bypassed (default 500) */
  maxStreamLength?: number;
}

export interface StreamingTextResult {
  /** Currently visible portion of text */
  displayedText: string;
  /** Whether the animation is still running */
  isStreaming: boolean;
  /** Skip animation — immediately show full text */
  skip: () => void;
  /** Reset to empty (useful when text prop changes) */
  reset: () => void;
}

export function useStreamingText({
  text,
  speed = 30,
  onComplete,
  enabled = true,
  maxStreamLength = 500,
}: StreamingTextOptions): StreamingTextResult {
  const [displayedText, setDisplayedText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);

  const frameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const lastIndexRef = useRef(0);
  // Keep callback in a ref to avoid restarting the animation on every parent re-render
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const cancelFrame = () => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  };

  const skip = useCallback(() => {
    cancelFrame();
    setDisplayedText(text);
    setIsStreaming(false);
    startTimeRef.current = null;
    lastIndexRef.current = text.length;
    onCompleteRef.current?.();
  }, [text]);

  const reset = useCallback(() => {
    cancelFrame();
    setDisplayedText('');
    setIsStreaming(false);
    startTimeRef.current = null;
    lastIndexRef.current = 0;
  }, []);

  useEffect(() => {
    cancelFrame();

    // No text or streaming disabled — show full text immediately
    if (!enabled || !text) {
      setDisplayedText((prev) => (prev !== text ? text : prev));
      setIsStreaming((prev) => (prev ? false : prev));
      return;
    }

    // Long text — skip animation to avoid janky reveal
    if (text.length > maxStreamLength) {
      setDisplayedText(text);
      setIsStreaming(false);
      onCompleteRef.current?.();
      return;
    }

    // Start fresh animation
    setIsStreaming(true);
    lastIndexRef.current = 0;
    startTimeRef.current = null;

    const animate = (timestamp: number) => {
      if (startTimeRef.current === null) startTimeRef.current = timestamp;
      const elapsed = timestamp - startTimeRef.current;
      const targetIndex = Math.min(Math.floor((elapsed / 1000) * speed), text.length);

      if (targetIndex > lastIndexRef.current) {
        lastIndexRef.current = targetIndex;
        setDisplayedText(text.slice(0, targetIndex));
      }

      if (targetIndex >= text.length) {
        setIsStreaming(false);
        frameRef.current = null;
        onCompleteRef.current?.();
      } else {
        frameRef.current = requestAnimationFrame(animate);
      }
    };

    frameRef.current = requestAnimationFrame(animate);

    return () => cancelFrame();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, speed, enabled, maxStreamLength]);

  return { displayedText, isStreaming, skip, reset };
}
