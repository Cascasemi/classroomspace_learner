/**
 * Browser Native TTS (Text-to-Speech) Hook
 *
 * Uses Web Speech API — client-side, no API key required.
 * Manages utterance lifecycle, pause/resume, and voice selection.
 */

import { useState, useCallback, useRef, useEffect } from 'react';

export interface UseBrowserTTSOptions {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: string) => void;
  /** Speech rate — 0.5 to 2.0, default 1.0 */
  rate?: number;
  /** Pitch — 0 to 2, default 1.0 */
  pitch?: number;
  /** Volume — 0 to 1, default 1.0 */
  volume?: number;
  /** BCP-47 language tag, default 'en-US' */
  lang?: string;
}

export interface UseBrowserTTSResult {
  isSpeaking: boolean;
  isPaused: boolean;
  isSupported: boolean;
  availableVoices: SpeechSynthesisVoice[];
  speak: (text: string, voiceName?: string) => void;
  pause: () => void;
  resume: () => void;
  cancel: () => void;
}

export function useBrowserTTS(options: UseBrowserTTSOptions = {}): UseBrowserTTSResult {
  const { onStart, onEnd, onError, rate = 1.0, pitch = 1.0, volume = 1.0, lang = 'en-US' } =
    options;

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);

  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Keep callbacks in refs to avoid stale closures
  const onStartRef = useRef(onStart);
  const onEndRef = useRef(onEnd);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onStartRef.current = onStart;
    onEndRef.current = onEnd;
    onErrorRef.current = onError;
  }, [onStart, onEnd, onError]);

  const isSupported =
    typeof window !== 'undefined' && typeof window.speechSynthesis !== 'undefined';

  // Load available voices (some browsers load them asynchronously)
  useEffect(() => {
    if (!isSupported) return;

    const loadVoices = () => {
      setAvailableVoices(window.speechSynthesis.getVoices());
    };

    loadVoices();
    window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', loadVoices);
  }, [isSupported]);

  const cancel = useCallback(() => {
    if (!isSupported) return;
    window.speechSynthesis.cancel();
    utteranceRef.current = null;
    setIsSpeaking(false);
    setIsPaused(false);
  }, [isSupported]);

  const speak = useCallback(
    (text: string, voiceName?: string) => {
      if (!isSupported || !text.trim()) return;

      // Cancel any current speech
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);

      utterance.rate = rate;
      utterance.pitch = pitch;
      utterance.volume = volume;
      utterance.lang = lang;

      // Try to select a matching voice by name
      if (voiceName) {
        const voices = window.speechSynthesis.getVoices();
        const voice = voices.find(
          (v) => v.name === voiceName || v.name.toLowerCase().includes(voiceName.toLowerCase()),
        );
        if (voice) utterance.voice = voice;
      }

      utterance.onstart = () => {
        setIsSpeaking(true);
        setIsPaused(false);
        onStartRef.current?.();
      };

      utterance.onend = () => {
        setIsSpeaking(false);
        setIsPaused(false);
        utteranceRef.current = null;
        onEndRef.current?.();
      };

      utterance.onerror = (event) => {
        setIsSpeaking(false);
        setIsPaused(false);
        utteranceRef.current = null;
        // 'interrupted' is not a real error — it means cancel() was called
        if (event.error !== 'interrupted') {
          onErrorRef.current?.(event.error);
        }
      };

      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    },
    [isSupported, rate, pitch, volume, lang],
  );

  const pause = useCallback(() => {
    if (!isSupported || !isSpeaking) return;
    window.speechSynthesis.pause();
    setIsPaused(true);
  }, [isSupported, isSpeaking]);

  const resume = useCallback(() => {
    if (!isSupported || !isPaused) return;
    window.speechSynthesis.resume();
    setIsPaused(false);
  }, [isSupported, isPaused]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isSupported) window.speechSynthesis.cancel();
    };
  }, [isSupported]);

  return { isSpeaking, isPaused, isSupported, availableVoices, speak, pause, resume, cancel };
}
