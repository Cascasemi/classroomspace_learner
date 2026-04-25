/**
 * Browser TTS Service
 *
 * Uses the Web Speech API (SpeechSynthesis) — zero dependencies, works in all
 * modern browsers. Falls back silently if the API is unavailable.
 *
 * Design goals:
 * - Per-agent voice selection (different voice per role)
 * - Sentence-level chunking to avoid Chrome's ~15 s utterance cutoff bug
 *   (Chrome silently drops onend for utterances longer than ~15 s, causing the
 *   playback engine to stall indefinitely waiting for done() to be called)
 * - Session token prevents stale chunk callbacks after skip/cancel
 * - `speakText` returns a Promise that resolves after the final chunk ends
 * - `stopTTS` cancels all in-flight chunks immediately
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface TTSVoiceHint {
  /** BCP-47 language tag, e.g. 'en-US', 'en-GB'. Defaults to 'en-US'. */
  lang?: string;
  /** Preferred SpeechSynthesis voice name / voiceURI (optional). */
  voiceName?: string;
  /** Stable logical voice id used to separate agents. */
  voiceId?: string;
  /** Preferred index among matching browser voices. */
  voiceIndex?: number;
  /** Speech rate: 0.5–2.0. Defaults to 1.0. */
  rate?: number;
  /** Pitch: 0–2. Defaults to 1.0. */
  pitch?: number;
}

// ── Chunk session ─────────────────────────────────────────────────────────────

/**
 * Tracks the currently active chunk-playback session.
 * A new speakText() call cancels any in-flight session before starting fresh,
 * preventing double-play and orphaned done() callbacks.
 */
interface ChunkSession {
  cancelled: boolean;
}

let activeSession: ChunkSession | null = null;

/**
 * Cancel the active chunk session and silence any pending speech.
 * The in-flight chunk gets onerror('canceled'), which we silently ignore.
 */
function cancelActiveSession(): void {
  if (activeSession) {
    activeSession.cancelled = true;
    activeSession = null;
  }
  if (typeof window !== 'undefined') {
    window.speechSynthesis?.cancel();
  }
}

// ── Lesson channel flag ───────────────────────────────────────────────────────

/**
 * When true, the lesson playback engine owns the TTS channel.
 * stopTTS() becomes a no-op while the flag is set so discussion TTS cannot
 * cancel mid-sentence lesson audio by accident. The lesson caller (ClassroomPage
 * onSpeechRequest) is responsible for setting/clearing this flag around each
 * speakText() call.
 */
let lessonTTSActive = false;

export function setLessonTTSActive(active: boolean): void {
  lessonTTSActive = active;
}

export function isLessonTTSActive(): boolean {
  return lessonTTSActive;
}

/**
 * Split text into sentence-level chunks so Chrome's ~15 s utterance cutoff
 * is avoided. Chrome silently stops audio and never fires onend for utterances
 * longer than approximately 15 seconds, which stalls the playback engine.
 *
 * Splits after sentence-ending punctuation (Latin + CJK) and on newlines.
 * Falls back to the original text if no split points are found.
 */
function splitIntoChunks(text: string): string[] {
  const chunks = text
    .split(/(?<=[.!?。！？])\s*|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return chunks.length > 0 ? chunks : [text.trim()];
}

/**
 * Normalize common abbreviations before browser TTS.
 * Web Speech often spells "Dr." as letters ("D R"), so convert it explicitly.
 */
function normalizeTextForTTS(text: string): string {
  return text
    .replace(/\bDr\.(?=\s|$)/g, 'Doctor')
    .replace(/\bDr(?=\s+[A-Z])/g, 'Doctor');
}

// ── Voice cache ──────────────────────────────────────────────────────────────

const VOICES_LOAD_TIMEOUT_MS = 2_000;

/**
 * Load browser voices with a timeout fallback.
 * Voices may not be available synchronously on first render.
 */
async function ensureVoicesLoaded(): Promise<SpeechSynthesisVoice[]> {
  if (typeof window === 'undefined' || !window.speechSynthesis) return [];

  const initial = window.speechSynthesis.getVoices();
  if (initial.length > 0) return initial;

  return new Promise<SpeechSynthesisVoice[]>((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const finish = () => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      window.speechSynthesis.removeEventListener('voiceschanged', onVoicesChanged);
      resolve(window.speechSynthesis.getVoices());
    };

    const onVoicesChanged = () => {
      if (window.speechSynthesis.getVoices().length > 0) finish();
    };

    window.speechSynthesis.addEventListener('voiceschanged', onVoicesChanged);
    timer = setTimeout(finish, VOICES_LOAD_TIMEOUT_MS);
  });
}

/**
 * Pick the best matching voice for a given hint.
 * Priority: exact voiceName match → lang-prefix match → no preference.
 */
function resolveVoice(
  voices: SpeechSynthesisVoice[],
  hint: TTSVoiceHint,
): SpeechSynthesisVoice | null {
  if (hint.voiceName) {
    const exact = voices.find(
      (v) => v.name === hint.voiceName || v.voiceURI === hint.voiceName,
    );
    if (exact) return exact;
  }

  if (hint.lang) {
    const langPrefix = hint.lang.split('-')[0];
    const matchingVoices = voices.filter(
      (v) => v.lang === hint.lang || v.lang.startsWith(langPrefix),
    );

    if (matchingVoices.length > 0) {
      if (typeof hint.voiceIndex === 'number') {
        const normalizedIndex = Math.abs(hint.voiceIndex) % matchingVoices.length;
        return matchingVoices[normalizedIndex] ?? null;
      }
      return matchingVoices[0] ?? null;
    }
  }

  if (typeof hint.voiceIndex === 'number' && voices.length > 0) {
    const normalizedIndex = Math.abs(hint.voiceIndex) % voices.length;
    return voices[normalizedIndex] ?? null;
  }

  return null;
}

// ── Core API ─────────────────────────────────────────────────────────────────

/**
 * Stop any currently playing speech immediately, including all pending chunks.
 *
 * No-op when the lesson channel owns the TTS session (lessonTTSActive = true)
 * so discussion teardown code cannot accidentally kill lesson audio.
 */
export function stopTTS(): void {
  if (lessonTTSActive) return;
  cancelActiveSession();
}

/**
 * Speak `text` using the browser's SpeechSynthesis API.
 *
 * Text is split into sentence-level chunks and played sequentially so that
 * Chrome's ~15 s single-utterance cutoff bug never stalls playback. The
 * returned Promise resolves only after the final chunk's onend fires (or the
 * whole call is cancelled by a subsequent speakText() / stopTTS() call).
 *
 * @param text    The text to speak.
 * @param hint    Optional voice/rate/pitch preferences.
 */
export async function speakText(text: string, hint: TTSVoiceHint = {}): Promise<void> {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  if (!text.trim()) return;

  // Cancel any in-flight session (previous speakText still playing chunks).
  cancelActiveSession();

  // Yield a macrotask so Chrome flushes the cancel() before the next speak().
  // A microtask gap is not sufficient — Chrome needs a full event-loop turn.
  await new Promise<void>((r) => setTimeout(r, 50));

  const voices = await ensureVoicesLoaded();
  const voice = resolveVoice(voices, hint);
  const normalizedText = normalizeTextForTTS(text);
  const chunks = splitIntoChunks(normalizedText);

  // Mint a new session token. If speakText() is called again while we are
  // mid-chunk, cancelActiveSession() will mark this session cancelled and the
  // next chunk callback will resolve early instead of advancing.
  const session: ChunkSession = { cancelled: false };
  activeSession = session;

  return new Promise<void>((resolve) => {
    let chunkIndex = 0;

    const playNextChunk = (): void => {
      // Another speakText() or stopTTS() already took over.
      if (session.cancelled) {
        resolve();
        return;
      }

      if (chunkIndex >= chunks.length) {
        // All chunks finished — clean up and signal done.
        if (activeSession === session) activeSession = null;
        resolve();
        return;
      }

      const chunkText = chunks[chunkIndex];
      const utterance = new SpeechSynthesisUtterance(chunkText);
      utterance.lang = hint.lang ?? 'en-US';
      utterance.rate = hint.rate ?? 1.0;
      utterance.pitch = hint.pitch ?? 1.0;
      if (voice) utterance.voice = voice;

      utterance.onend = () => {
        chunkIndex++;
        playNextChunk();
      };

      utterance.onerror = (event) => {
        if (event.error === 'canceled') {
          // Deliberate cancel via cancelActiveSession() — the session is already
          // marked cancelled; resolve the old promise and stop advancing.
          resolve();
          return;
        }
        // Any other error (network, synthesis failure, etc.): skip this chunk
        // and continue rather than stalling the engine permanently.
        chunkIndex++;
        playNextChunk();
      };

      window.speechSynthesis.speak(utterance);
    };

    playNextChunk();
  });
}

/**
 * Returns true if the browser is currently speaking.
 */
export function isTTSSpeaking(): boolean {
  return typeof window !== 'undefined' && (window.speechSynthesis?.speaking ?? false);
}

// ── Agent voice presets ──────────────────────────────────────────────────────

/**
 * Default voice hints per agent role.
 * Teacher: slightly slower + neutral pitch (authority)
 * Assistant: normal speed, slightly higher pitch (friendly)
 * Student: slightly faster + higher pitch (youthful enthusiasm)
 */
export const ROLE_VOICE_HINTS: Record<string, TTSVoiceHint> = {
  teacher: { lang: 'en-US', voiceId: 'teacher', voiceIndex: 0, rate: 0.9, pitch: 1.0 },
  assistant: { lang: 'en-US', voiceId: 'assistant', voiceIndex: 1, rate: 1.0, pitch: 1.1 },
  student: { lang: 'en-US', voiceId: 'student', voiceIndex: 2, rate: 1.1, pitch: 1.25 },
};

/**
 * Merge an agent's stored voiceHint with the role-based default.
 * Agent-specific settings override role defaults.
 */
export function resolveVoiceHint(
  agentRole: string | undefined,
  agentVoiceHint?: TTSVoiceHint,
): TTSVoiceHint {
  const roleDefault = agentRole ? (ROLE_VOICE_HINTS[agentRole] ?? {}) : {};
  return { ...roleDefault, ...agentVoiceHint };
}
