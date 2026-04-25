/**
 * ASR — Automatic Speech Recognition service.
 *
 * Uses the browser's Web Speech API (SpeechRecognition) as the default
 * for all users — no server round-trip, instant results.
 *
 * Future premium upgrade path (noted in code below):
 *   Send the Blob to /api/asr/whisper (OpenAI Whisper server proxy)
 *   for higher accuracy with accents, domain vocab, longer utterances.
 *
 * Usage:
 *   import { startListening, stopListening } from '@/lib/audio/asr';
 *
 *   startListening({
 *     onResult: (text, isFinal) => console.log(text, isFinal),
 *     onError: (err) => console.error(err),
 *     continuous: false,    // single utterance (for quiz answers)
 *   });
 */

// ─── Web Speech API: vendor-prefixed, type-cast via unknown ──────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyWindow = Window & typeof globalThis & Record<string, any>;

/** Constructor type for SpeechRecognition (works vendor-prefixed or not) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

/** Minimal interface we need from SpeechRecognition */
interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onresult: ((event: any) => void) | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
}

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as AnyWindow;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as SpeechRecognitionCtor | null;
}

/** Returns true if the browser supports the Web Speech API. */
export function isASRSupported(): boolean {
  return !!getSpeechRecognitionCtor();
}

export interface ASRCallbacks {
  /** Called with each transcription result — isFinal=true when recognition is done */
  onResult: (text: string, isFinal: boolean) => void;
  /** Called on error (e.g., microphone permission denied) */
  onError?: (err: string) => void;
  /** Called when recognition ends naturally (after silence) */
  onEnd?: () => void;
}

export interface ASROptions extends ASRCallbacks {
  /** Keep listening across multiple pauses (default false) */
  continuous?: boolean;
  /** BCP-47 language for recognition (default 'en-US') */
  lang?: string;
}

let activeRecog: SpeechRecognitionInstance | null = null;

/**
 * Start listening. Resolves immediately; results arrive via callbacks.
 * Stops any previous session before starting.
 */
export function startListening(options: ASROptions): void {
  stopListening();

  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) {
    options.onError?.('Web Speech API is not supported in this browser.');
    return;
  }

  const recog = new Ctor();
  activeRecog = recog;

  recog.lang = options.lang ?? 'en-US';
  recog.continuous = options.continuous ?? false;
  recog.interimResults = true;
  recog.maxAlternatives = 1;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recog.onresult = (event: any) => {
    let interim = '';
    let final = '';

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) {
        final += result[0].transcript;
      } else {
        interim += result[0].transcript;
      }
    }

    if (final) {
      options.onResult(final.trim(), true);
    } else if (interim) {
      options.onResult(interim.trim(), false);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recog.onerror = (event: any) => {
    const msg =
      event.error === 'not-allowed'
        ? 'Microphone permission denied.'
        : event.error === 'network'
          ? 'Network error during speech recognition.'
          : `Speech recognition error: ${event.error}`;
    options.onError?.(msg);
  };

  recog.onend = () => {
    activeRecog = null;
    options.onEnd?.();
  };

  recog.start();
}

/**
 * Stop the active listening session (if any).
 */
export function stopListening(): void {
  if (activeRecog) {
    try {
      activeRecog.stop();
    } catch {
      // ignore if already stopped
    }
    activeRecog = null;
  }
}

/**
 * Returns a Promise that resolves with the final transcript
 * of a single user utterance. Rejects on error.
 *
 * Useful for simple "ask → await answer" patterns.
 */
export function listenOnce(options?: { lang?: string; timeout?: number }): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const timeoutMs = options?.timeout ?? 15000;
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        stopListening();
        reject(new Error('Listening timed out'));
      }
    }, timeoutMs);

    startListening({
      lang: options?.lang ?? 'en-US',
      continuous: false,
      onResult(text, isFinal) {
        if (isFinal && !settled) {
          settled = true;
          clearTimeout(timer);
          resolve(text);
        }
      },
      onError(err) {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(new Error(err));
        }
      },
    });
  });
}

/*
 * ─── Future premium upgrade: OpenAI Whisper via server proxy ─────────────────
 *
 * async function transcribeWithWhisper(audio: Blob, lang = 'en'): Promise<string> {
 *   const form = new FormData();
 *   form.append('file', audio, 'recording.webm');
 *   form.append('language', lang);
 *
 *   const token = localStorage.getItem('neurospace_token');
 *   const res = await fetch('/api/asr/whisper', {
 *     method: 'POST',
 *     headers: { Authorization: `Bearer ${token}` },
 *     body: form,
 *   });
 *   const { text } = await res.json();
 *   return text;
 * }
 */
