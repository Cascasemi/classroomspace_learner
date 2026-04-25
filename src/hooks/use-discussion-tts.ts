/**
 * useDiscussionTTS — Queued multi-agent TTS for live discussion mode
 *
 * Features:
 * – Serialised queue: speaks one segment at a time regardless of how fast
 *   `enqueue()` is called.
 * – Per-agent voice hints: each AgentConfig carries voiceHint{ lang, rate, pitch }.
 * – Pause / resume: stops mid-speech and continues from the next queue item.
 * – Cancel: drains the queue and stops any in-flight speech.
 * – `onSpeakingAgent` callback lets the UI highlight the active agent avatar.
 *
 * Usage:
 *   const tts = useDiscussionTTS({ agents: classroom.agentConfigs });
 *
 *   // When a new agent response arrives:
 *   tts.enqueue({ agentId: resp.agentId, text: resp.speech });
 *
 *   // When leaving discussion:
 *   tts.cancel();
 */

import { useCallback, useRef } from 'react';
import { speakText, stopTTS, isLessonTTSActive } from '@/lib/audio/tts';
import type { TTSVoiceHint } from '@/lib/audio/tts';

export interface DiscussionAgentMeta {
  id: string;
  role?: string;
  voiceHint?: TTSVoiceHint;
}

export interface TTSQueueItem {
  agentId: string;
  text: string;
}

export interface UseDiscussionTTSOptions {
  /** Agent configs used for per-agent voice resolution */
  agents?: DiscussionAgentMeta[];
  /** Speed multiplier applied on top of each agent's base rate */
  speedMultiplier?: number;
  /** Called with the agentId of whoever is currently speaking (null = idle) */
  onSpeakingAgent?: (agentId: string | null) => void;
  /** Called when the queue drains completely */
  onQueueEmpty?: () => void;
}

export interface UseDiscussionTTSResult {
  /** Add a text segment to the end of the TTS queue */
  enqueue: (item: TTSQueueItem) => void;
  /** Pause after the current segment finishes */
  pause: () => void;
  /** Resume processing the queue */
  resume: () => void;
  /** Immediately stop speech and drain the queue */
  cancel: () => void;
  /**
   * Returns a Promise that resolves when the queue is fully drained.
   * Resolves immediately if the queue is already empty and nothing is playing.
   * Add a max-wait timeout to prevent hanging if TTS fails silently.
   */
  waitForEmpty: (timeoutMs?: number) => Promise<void>;
  /** Whether a segment is currently being spoken */
  isSpeaking: boolean;
  /** Whether the queue is paused */
  isPaused: boolean;
}

export function useDiscussionTTS({
  agents = [],
  speedMultiplier = 1,
  onSpeakingAgent,
  onQueueEmpty,
}: UseDiscussionTTSOptions = {}): UseDiscussionTTSResult {
  const queueRef = useRef<TTSQueueItem[]>([]);
  const isPlayingRef = useRef(false);
  const isPausedRef = useRef(false);
  const isSpeakingRef = useRef(false);
  const agentsRef = useRef(agents);
  agentsRef.current = agents;
  const speedRef = useRef(speedMultiplier);
  speedRef.current = speedMultiplier;
  const onSpeakingAgentRef = useRef(onSpeakingAgent);
  onSpeakingAgentRef.current = onSpeakingAgent;
  const onQueueEmptyRef = useRef(onQueueEmpty);
  onQueueEmptyRef.current = onQueueEmpty;
  /**
   * Set of resolve callbacks registered by waitForEmpty() calls.
   * Using a Set instead of a single ref allows multiple simultaneous callers
   * (e.g. the teacher-answer loop and the proactive-agent loop) to each get
   * their own Promise resolved when the queue genuinely empties.
   * This is an event-driven signal — it fires only after the last queued
   * utterance's final chunk onend has fired (guaranteed by the BUG A fix).
   */
  const drainListenersRef = useRef<Set<() => void>>(new Set());

  /** Notify all waiting callers that the queue has fully drained. */
  const notifyDrained = (): void => {
    const listeners = drainListenersRef.current;
    drainListenersRef.current = new Set();
    listeners.forEach((fn) => fn());
  };

  const processQueueRef = useRef<() => Promise<void>>(async () => {});

  processQueueRef.current = async () => {
    if (isPlayingRef.current || isPausedRef.current) return;
    const item = queueRef.current.shift();
    if (!item) {
      isSpeakingRef.current = false;
      onSpeakingAgentRef.current?.(null);
      onQueueEmptyRef.current?.();
      // Signal all callers waiting on waitForEmpty() — fires after the last
      // speakText() Promise resolved (= after the last chunk's onend event).
      notifyDrained();
      return;
    }

    isPlayingRef.current = true;
    isSpeakingRef.current = true;
    onSpeakingAgentRef.current?.(item.agentId);

    // Resolve voice hint for this agent
    const agent = agentsRef.current.find((a) => a.id === item.agentId);
    const baseHint: TTSVoiceHint = {
      lang: agent?.voiceHint?.lang ?? 'en-US',
      voiceName: agent?.voiceHint?.voiceName,
      rate: (agent?.voiceHint?.rate ?? 1.0) * speedRef.current,
      pitch: agent?.voiceHint?.pitch ?? 1.0,
    };

    // Role-based voice adjustments when no explicit voice is configured
    if (!agent?.voiceHint?.voiceName) {
      if (agent?.role === 'assistant') {
        baseHint.pitch = (baseHint.pitch ?? 1.0) + 0.1;
      } else if (agent?.role === 'student') {
        baseHint.rate = (baseHint.rate ?? 1.0) + 0.1;
        baseHint.pitch = (baseHint.pitch ?? 1.0) + 0.25;
      }
    }

    try {
      // If the lesson engine currently owns the TTS channel, delay this
      // utterance rather than cancelling lesson audio. Re-queue the item at
      // the front and reschedule; the lesson's finally block will have cleared
      // the flag before the next event-loop turn runs.
      if (isLessonTTSActive()) {
        queueRef.current.unshift(item);
        isPlayingRef.current = false;
        setTimeout(() => {
          if (!isPlayingRef.current && !isPausedRef.current) {
            processQueueRef.current();
          }
        }, 200);
        return;
      }
      await speakText(item.text, baseHint);
    } catch {
      /* speech error — continue queue */
    } finally {
      isPlayingRef.current = false;
    }

    // Advance queue
    if (!isPausedRef.current) {
      processQueueRef.current();
    }
  };

  const enqueue = useCallback((item: TTSQueueItem) => {
    queueRef.current.push(item);
    // Kick off processing only if nothing is running
    if (!isPlayingRef.current && !isPausedRef.current) {
      processQueueRef.current();
    }
  }, []);

  const pause = useCallback(() => {
    isPausedRef.current = true;
    stopTTS();
    isPlayingRef.current = false;
  }, []);

  const resume = useCallback(() => {
    isPausedRef.current = false;
    processQueueRef.current();
  }, []);

  const cancel = useCallback(() => {
    queueRef.current = [];
    isPausedRef.current = false;
    isPlayingRef.current = false;
    isSpeakingRef.current = false;
    stopTTS();
    onSpeakingAgentRef.current?.(null);
    // Resolve all pending waitForEmpty() callers so they don't hang after cancel
    notifyDrained();
  }, []);

  /**
   * Returns a Promise that resolves when the discussion queue is genuinely
   * empty and the last agent's final TTS chunk has finished playing.
   *
   * This is event-driven — it resolves on the actual drain signal, not a
   * polling interval. The `timeoutMs` parameter is a hard safety cap (default
   * 30 s) that only fires when TTS fails silently and onend never arrives.
   *
   * Multiple simultaneous callers are fully supported — each gets its own
   * Promise resolved independently by the same drain event.
   */
  const waitForEmpty = useCallback((timeoutMs = 30_000): Promise<void> => {
    // Already idle with nothing queued — resolve immediately
    if (!isPlayingRef.current && !isSpeakingRef.current && queueRef.current.length === 0) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      drainListenersRef.current.add(resolve);
      // Hard safety cap — if TTS fails silently and onend never fires, unblock
      // the engine after at most timeoutMs so the lesson can continue.
      setTimeout(() => {
        if (drainListenersRef.current.has(resolve)) {
          drainListenersRef.current.delete(resolve);
          resolve();
        }
      }, timeoutMs);
    });
  }, []);

  return {
    enqueue,
    pause,
    resume,
    cancel,
    waitForEmpty,
    get isSpeaking() { return isSpeakingRef.current; },
    get isPaused()   { return isPausedRef.current; },
  };
}
