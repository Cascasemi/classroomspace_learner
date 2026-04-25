/**
 * use-tts — Web Speech API TTS hook
 * Speaks tutor messages aloud; reports live speaking state.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseTTSReturn {
  isSpeaking: boolean;
  speak: (text: string, onEnd?: () => void) => void;
  stop: () => void;
  isSupported: boolean;
}

export function useTTS(): UseTTSReturn {
  const [isSpeaking, setSpeaking] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const isSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  // Pre-load voices (browsers load them async on first call)
  useEffect(() => {
    if (!isSupported) return;
    window.speechSynthesis.getVoices();
    const onVoicesChanged = () => window.speechSynthesis.getVoices();
    window.speechSynthesis.addEventListener('voiceschanged', onVoicesChanged);
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', onVoicesChanged);
    };
  }, [isSupported]);

  // Cancel on unmount
  useEffect(() => () => { window.speechSynthesis?.cancel(); }, []);

  const speak = useCallback((text: string, onEnd?: () => void) => {
    if (!isSupported || !text.trim()) return;

    // Cancel any in-progress speech
    window.speechSynthesis.cancel();
    setSpeaking(false);

    const utterance = new SpeechSynthesisUtterance(text);

    // Prefer a natural English voice
    const voices = window.speechSynthesis.getVoices();
    const preferred =
      voices.find((v) => v.name.toLowerCase().includes('neural') && v.lang.startsWith('en')) ||
      voices.find((v) => v.name.toLowerCase().includes('google') && v.lang.startsWith('en')) ||
      voices.find((v) => v.lang === 'en-US') ||
      voices.find((v) => v.lang.startsWith('en')) ||
      null;
    if (preferred) utterance.voice = preferred;

    utterance.rate = 0.92;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => {
      setSpeaking(false);
      onEnd?.();
    };
    utterance.onerror = () => {
      setSpeaking(false);
      onEnd?.();
    };

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, [isSupported]);

  const stop = useCallback(() => {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  }, []);

  return { isSpeaking, speak, stop, isSupported };
}
