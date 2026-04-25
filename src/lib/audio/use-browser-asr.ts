/**
 * Browser Native ASR (Speech Recognition) Hook
 *
 * English-only for Openclass_learner (no i18n language switching).
 * Uses Web Speech API — client-side, no API key required.
 */

import { useState, useCallback, useRef, useEffect } from 'react';

// Vendor-prefix types
declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    SpeechRecognition: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    webkitSpeechRecognition: any;
  }
}

export type ASRErrorCode =
  | 'not-supported'
  | 'no-speech'
  | 'audio-capture'
  | 'not-allowed'
  | 'network'
  | 'aborted'
  | 'unknown';

export interface UseBrowserASROptions {
  onTranscription?: (text: string) => void;
  onError?: (errorCode: ASRErrorCode) => void;
  /** defaults to false — single utterance mode */
  continuous?: boolean;
  /** defaults to false */
  interimResults?: boolean;
}

export interface UseBrowserASRResult {
  isListening: boolean;
  isSupported: boolean;
  /** Partial transcript while the user is still speaking */
  interimTranscript: string;
  startListening: () => void;
  stopListening: () => void;
}

export function useBrowserASR(options: UseBrowserASROptions = {}): UseBrowserASRResult {
  const { onTranscription, onError, continuous = false, interimResults = false } = options;

  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  // Keep callbacks in refs to avoid stale closures in recognition handlers
  const onTranscriptionRef = useRef(onTranscription);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onTranscriptionRef.current = onTranscription;
    onErrorRef.current = onError;
  }, [onTranscription, onError]);

  // SSR-safe support check
  const [isSupported] = useState(
    () =>
      typeof window !== 'undefined' &&
      !!(window.SpeechRecognition || window.webkitSpeechRecognition),
  );

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
    setInterimTranscript('');
  }, []);

  const startListening = useCallback(() => {
    if (typeof window === 'undefined') return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      onErrorRef.current?.('not-supported');
      return;
    }

    // Cancel any existing session
    if (recognitionRef.current) {
      recognitionRef.current.abort();
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.continuous = continuous;
    recognition.interimResults = interimResults;

    recognition.onstart = () => {
      setIsListening(true);
      setInterimTranscript('');
    };

    recognition.onresult = (event: {
      resultIndex: number;
      results: {
        [index: number]: { [index: number]: { transcript: string }; isFinal: boolean };
        length: number;
      };
    }) => {
      let finalTranscript = '';
      let interimText = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += text;
        } else {
          interimText += text;
        }
      }

      if (interimText) {
        setInterimTranscript(interimText);
      }

      if (finalTranscript.trim()) {
        onTranscriptionRef.current?.(finalTranscript.trim());
        setInterimTranscript('');
      }
    };

    recognition.onerror = (event: { error: string }) => {
      const code = (event.error as ASRErrorCode) || 'unknown';
      onErrorRef.current?.(code);
      setIsListening(false);
      setInterimTranscript('');
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterimTranscript('');
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [continuous, interimResults]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
    };
  }, []);

  return { isListening, isSupported, interimTranscript, startListening, stopListening };
}
