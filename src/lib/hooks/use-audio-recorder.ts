/**
 * useAudioRecorder — Mic recording hook for the classroom discussion overlay
 *
 * Openclass_learner single-provider simplification:
 *   1. Primary: MediaRecorder → POST /api/transcription (Whisper)
 *   2. Fallback: Browser Web Speech API (if Whisper not configured on server,
 *      or if MediaRecorder is not supported)
 *
 * The caller receives onTranscription(text) when a final result is ready.
 *
 * Usage:
 *   const { isRecording, isProcessing, recordingTime, isSupported,
 *           startRecording, stopRecording, cancelRecording } = useAudioRecorder({
 *     onTranscription: (text) => console.log(text),
 *     onError: (msg) => console.error(msg),
 *   });
 */

import { useState, useRef, useCallback } from 'react';

// Web Speech API types (vendor-prefix already declared in use-browser-asr.ts)
declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    SpeechRecognition: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    webkitSpeechRecognition: any;
  }
}

export interface UseAudioRecorderOptions {
  onTranscription?: (text: string) => void;
  onError?: (error: string) => void;
}

export interface UseAudioRecorderResult {
  isRecording: boolean;
  isProcessing: boolean;
  /** Elapsed recording seconds */
  recordingTime: number;
  /** false only if both Whisper and browser ASR are unavailable */
  isSupported: boolean;
  startRecording: () => void;
  stopRecording: () => void;
  cancelRecording: () => void;
}

const WHISPER_ROUTE = '/api/transcription';
const MAX_RECORDING_SECONDS = 60;

export function useAudioRecorder(
  options: UseAudioRecorderOptions = {},
): UseAudioRecorderResult {
  const { onTranscription, onError } = options;

  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const speechRef = useRef<any>(null);
  /** Synchronous busy lock because React state updates are async */
  const busyRef = useRef(false);

  // Keep callbacks in refs so closures don't go stale
  const onTranscriptionRef = useRef(onTranscription);
  const onErrorRef = useRef(onError);
  onTranscriptionRef.current = onTranscription;
  onErrorRef.current = onError;

  const isMediaRecorderSupported =
    typeof window !== 'undefined' && typeof window.MediaRecorder !== 'undefined';
  const isBrowserASRSupported =
    typeof window !== 'undefined' &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  const isSupported = isMediaRecorderSupported || isBrowserASRSupported;

  // ─── Timer helpers ──────────────────────────────────────────────────────────

  const startTimer = useCallback(() => {
    setRecordingTime(0);
    timerRef.current = setInterval(() => {
      setRecordingTime((t) => {
        if (t >= MAX_RECORDING_SECONDS) {
          // Auto-stop at limit
          stopRecording(); // forward ref — defined below
          return t;
        }
        return t + 1;
      });
    }, 1000);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setRecordingTime(0);
  }, []);

  // ─── Whisper transcription ──────────────────────────────────────────────────

  const transcribeBlob = useCallback(async (blob: Blob) => {
    setIsProcessing(true);
    try {
      const form = new FormData();
      form.append('audio', blob, 'recording.webm');

      const res = await fetch(WHISPER_ROUTE, {
        method: 'POST',
        body: form,
        credentials: 'include',
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        // Gracefully fall through: WHISPER_NOT_CONFIGURED means fallback is needed
        if (body?.code === 'WHISPER_NOT_CONFIGURED') {
          onErrorRef.current?.('Whisper not configured on server. Enable browser mic instead.');
        } else {
          onErrorRef.current?.('Transcription failed — please try again.');
        }
        return;
      }

      const json = await res.json() as { text: string };
      const text = json.text?.trim();
      if (text) onTranscriptionRef.current?.(text);
    } catch {
      onErrorRef.current?.('Network error during transcription.');
    } finally {
      setIsProcessing(false);
    }
  }, []);

  // ─── Browser ASR fallback ─────────────────────────────────────────────────

  const startBrowserASR = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      onErrorRef.current?.('Speech recognition is not supported in this browser.');
      busyRef.current = false;
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => setIsRecording(true);

    recognition.onresult = (event: {
      results: { [i: number]: { [i: number]: { transcript: string }; isFinal: boolean } };
    }) => {
      const transcript = event.results[0][0].transcript.trim();
      if (transcript) onTranscriptionRef.current?.(transcript);
    };

    recognition.onerror = (event: { error: string }) => {
      if (event.error !== 'aborted' && event.error !== 'no-speech') {
        onErrorRef.current?.(`ASR error: ${event.error}`);
      }
    };

    recognition.onend = () => {
      setIsRecording(false);
      stopTimer();
      busyRef.current = false;
      speechRef.current = null;
    };

    speechRef.current = recognition;
    recognition.start();
    startTimer();
  }, [startTimer, stopTimer]);

  // ─── MediaRecorder flow ────────────────────────────────────────────────────

  const startMediaRecorder = useCallback(async () => {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      // User denied mic — try browser ASR fallback
      startBrowserASR();
      return;
    }

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';

    const recorder = new MediaRecorder(stream, { mimeType });
    chunksRef.current = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = async () => {
      // Release mic
      stream.getTracks().forEach((t) => t.stop());
      setIsRecording(false);
      stopTimer();

      const blob = new Blob(chunksRef.current, { type: mimeType });
      chunksRef.current = [];
      await transcribeBlob(blob);
      busyRef.current = false;
      mediaRecorderRef.current = null;
    };

    recorder.onerror = () => {
      stream.getTracks().forEach((t) => t.stop());
      setIsRecording(false);
      stopTimer();
      busyRef.current = false;
      mediaRecorderRef.current = null;
      onErrorRef.current?.('Recording error — please try again.');
    };

    mediaRecorderRef.current = recorder;
    recorder.start(250); // collect chunks every 250 ms
    setIsRecording(true);
    startTimer();
  }, [startBrowserASR, startTimer, stopTimer, transcribeBlob]);

  // ─── Public API ─────────────────────────────────────────────────────────────

  const startRecording = useCallback(() => {
    if (busyRef.current || isRecording) return;
    busyRef.current = true;

    if (isMediaRecorderSupported) {
      startMediaRecorder();
    } else {
      startBrowserASR();
    }
  }, [isRecording, isMediaRecorderSupported, startMediaRecorder, startBrowserASR]);

  const stopRecording = useCallback(() => {
    // MediaRecorder path
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      return;
    }
    // Browser ASR path
    if (speechRef.current) {
      speechRef.current.stop();
    }
  }, []);

  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stream?.getTracks().forEach((t) => t.stop());
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
      chunksRef.current = [];
    }
    if (speechRef.current) {
      speechRef.current.abort();
      speechRef.current = null;
    }
    stopTimer();
    setIsRecording(false);
    setIsProcessing(false);
    busyRef.current = false;
  }, [stopTimer]);

  return {
    isRecording,
    isProcessing,
    recordingTime,
    isSupported,
    startRecording,
    stopRecording,
    cancelRecording,
  };
}
