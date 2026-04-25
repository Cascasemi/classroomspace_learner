/**
 * useAudioRecorder — MediaRecorder → Whisper ASR hook
 *
 * Supports two ASR modes:
 *   1. MediaRecorder → POST /api/transcription (server-side Whisper, better accuracy)
 *   2. Web Speech API fallback (instant, no server required)
 *
 * The hook tries Whisper first when `transcribeAudio` is provided. If the
 * server returns a WHISPER_NOT_CONFIGURED error it silently falls back to
 * browser ASR for the rest of the session.
 *
 * Usage:
 *   const { isRecording, isProcessing, recordingTime, startRecording, stopRecording } =
 *     useAudioRecorder({
 *       onTranscription: (text) => setTranscript(text),
 *       onError: (err) => console.error(err),
 *       transcribeAudio: (blob) => api.transcribeAudio(blob),
 *     });
 */

import { useState, useRef, useCallback } from 'react';

// TypeScript declarations for Web Speech API (not fully typed in lib.dom)
declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    SpeechRecognition: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    webkitSpeechRecognition: any;
  }
}

export interface UseAudioRecorderOptions {
  /** Called with the final transcript text */
  onTranscription?: (text: string) => void;
  /** Called when an error occurs */
  onError?: (error: string) => void;
  /**
   * If provided, recorded audio is sent here (e.g. api.transcribeAudio).
   * On WHISPER_NOT_CONFIGURED the hook permanently falls back to browser ASR.
   */
  transcribeAudio?: (blob: Blob) => Promise<{ text: string }>;
  /** Language code for Web Speech API fallback (default 'en-US') */
  lang?: string;
}

export interface UseAudioRecorderResult {
  isRecording: boolean;
  isProcessing: boolean;
  /** Seconds elapsed since recording started */
  recordingTime: number;
  startRecording: () => void;
  stopRecording: () => void;
}

export function useAudioRecorder({
  onTranscription,
  onError,
  transcribeAudio,
  lang = 'en-US',
}: UseAudioRecorderOptions = {}): UseAudioRecorderResult {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const speechRecognitionRef = useRef<any>(null);
  // Synchronous lock to prevent rapid re-entrancy (React state updates are async)
  const busyRef = useRef(false);
  // Once a WHISPER_NOT_CONFIGURED error is returned, permanently use browser ASR
  const forcesBrowserASRRef = useRef(false);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  // ── MediaRecorder path ─────────────────────────────────────────────────────

  const startMediaRecorder = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : '';

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, {
          type: mimeType || 'audio/webm',
        });

        if (!transcribeAudio || forcesBrowserASRRef.current) return;

        setIsProcessing(true);
        try {
          const result = await transcribeAudio(blob);
          if (result.text) onTranscription?.(result.text);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          // If Whisper is not configured, switch permanently to browser ASR
          if (msg.includes('WHISPER_NOT_CONFIGURED')) {
            forcesBrowserASRRef.current = true;
          } else {
            onError?.(`Transcription failed: ${msg}`);
          }
        } finally {
          setIsProcessing(false);
          busyRef.current = false;
        }
      };

      recorder.start(250); // collect chunks every 250ms
      setIsRecording(true);
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime((t) => t + 1);
      }, 1000);
    } catch (err) {
      busyRef.current = false;
      const msg = err instanceof Error ? err.message : String(err);
      onError?.(`Microphone access denied: ${msg}`);
    }
  }, [onError, onTranscription, transcribeAudio]);

  // ── Web Speech API path ────────────────────────────────────────────────────

  const startBrowserASR = useCallback(() => {
    const SpeechRecognition =
      window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      onError?.('Speech recognition is not supported in this browser');
      busyRef.current = false;
      return;
    }

    const recognition = new SpeechRecognition();
    speechRecognitionRef.current = recognition;

    recognition.lang = lang;
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (event: { results: { 0: { transcript: string }[] } }) => {
      const text = event.results[0]?.[0]?.transcript ?? '';
      if (text) onTranscription?.(text);
    };

    recognition.onerror = (event: { error: string }) => {
      onError?.(`Speech recognition error: ${event.error}`);
    };

    recognition.onend = () => {
      setIsRecording(false);
      clearTimer();
      busyRef.current = false;
    };

    recognition.start();
    setIsRecording(true);
    setRecordingTime(0);

    timerRef.current = setInterval(() => {
      setRecordingTime((t) => t + 1);
    }, 1000);
  }, [lang, onError, onTranscription]);

  // ── Public API ─────────────────────────────────────────────────────────────

  const startRecording = useCallback(() => {
    if (busyRef.current || isRecording) return;
    busyRef.current = true;

    const useMedia =
      transcribeAudio &&
      !forcesBrowserASRRef.current &&
      typeof MediaRecorder !== 'undefined';

    if (useMedia) {
      startMediaRecorder();
    } else {
      startBrowserASR();
    }
  }, [isRecording, transcribeAudio, startMediaRecorder, startBrowserASR]);

  const stopRecording = useCallback(() => {
    clearTimer();

    // Stop MediaRecorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;

    // Stop Web Speech API
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop();
      } catch {
        /* ignore */
      }
      speechRecognitionRef.current = null;
    }

    setIsRecording(false);
    setRecordingTime(0);
    // busyRef will be cleared by onstop / onend callbacks
  }, []);

  return { isRecording, isProcessing, recordingTime, startRecording, stopRecording };
}
