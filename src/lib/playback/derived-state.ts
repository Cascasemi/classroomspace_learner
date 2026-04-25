/**
 * Playback Derived State — Pure computation layer
 *
 * Centralises all "what is happening right now?" derivation logic so that
 * ClassroomPage doesn't inline-derive the same conditions in every render.
 *
 * Usage:
 *   const view = computePlaybackView({ engineState: pbState, isDiscussLoading, ... });
 *   // view.phase, view.bubbleRole, view.buttonState, view.sourceText, ...
 */

import type { PlaybackEngineState } from './types';

// ────────────────────────────────────────────────────────────────────────────
// Raw input collected from multiple React state variables
// ────────────────────────────────────────────────────────────────────────────

export interface PlaybackRawState {
  /** Current engine state (null while classroom is loading) */
  engineState: PlaybackEngineState | null;
  /** Whether the discuss API call is in-flight */
  isDiscussLoading: boolean;
  /** Which agent is currently speaking in discussion (null = none) */
  speakingDiscussAgentId: string | null;
  /** The very latest discussion speech text being rendered */
  latestDiscussSpeech: string | null;
}

// ────────────────────────────────────────────────────────────────────────────
// Output: a single derived view consumed by ClassroomPage UI
// ────────────────────────────────────────────────────────────────────────────

export type PlaybackPhase =
  | 'idle'
  | 'lecturePlaying'
  | 'lecturePaused'
  | 'lectureComplete'
  | 'discussionPending'   /** overlay shown, waiting for user to click Continue */
  | 'discussionLoading'   /** agents are thinking (spinner) */
  | 'discussionActive'    /** agents are responding + TTS playing */
  | 'finished';

export type BubbleButtonState = 'skip' | 'play' | 'restart' | 'none';

export interface PlaybackView {
  /** High-level phase — "what is happening right now?" */
  phase: PlaybackPhase;

  /** Text to display in the speech bubble */
  sourceText: string | null;

  /** Who owns the speech bubble */
  bubbleRole: 'teacher' | 'agent' | 'user' | null;

  /** Button shown on the speech bubble */
  buttonState: BubbleButtonState;

  /**
   * Whether any discussion-related activity is ongoing.
   * Used to block scene switching while a discussion round is in progress.
   */
  isDiscussionActive: boolean;

  /**
   * Whether the playback engine is in a state where controls
   * (play / pause / next / prev) should be enabled.
   */
  controlsEnabled: boolean;
}

// ────────────────────────────────────────────────────────────────────────────
// Pure computation
// ────────────────────────────────────────────────────────────────────────────

export function computePlaybackView(raw: PlaybackRawState): PlaybackView {
  const { engineState, isDiscussLoading, speakingDiscussAgentId, latestDiscussSpeech } = raw;

  // ── 1. Discussion active (overlays everything) ──
  if (speakingDiscussAgentId || isDiscussLoading) {
    return {
      phase:               isDiscussLoading ? 'discussionLoading' : 'discussionActive',
      sourceText:          latestDiscussSpeech,
      bubbleRole:          'agent',
      buttonState:         'none',
      isDiscussionActive:  true,
      controlsEnabled:     false,
    };
  }

  // ── 2. No engine state yet (loading or error) ──
  if (!engineState) {
    return {
      phase:               'idle',
      sourceText:          null,
      bubbleRole:          null,
      buttonState:         'none',
      isDiscussionActive:  false,
      controlsEnabled:     false,
    };
  }

  const ps = engineState.playbackState;

  // ── 3. Discussion prompt showing (engine paused, overlay visible) ──
  if (engineState.discussionActive) {
    return {
      phase:               'discussionPending',
      sourceText:          engineState.discussionTopic,
      bubbleRole:          'teacher',
      buttonState:         'none',
      isDiscussionActive:  true,
      controlsEnabled:     false,
    };
  }

  // ── 4. Finished ──
  if (ps === 'finished') {
    return {
      phase:               'finished',
      sourceText:          'Lesson complete!',
      bubbleRole:          'teacher',
      buttonState:         'restart',
      isDiscussionActive:  false,
      controlsEnabled:     false,
    };
  }

  // ── 5. Idle / scene-complete ──
  if (ps === 'idle' || ps === 'scene-complete') {
    return {
      phase:               'idle',
      sourceText:          null,
      bubbleRole:          null,
      buttonState:         ps === 'scene-complete' ? 'play' : 'none',
      isDiscussionActive:  false,
      controlsEnabled:     true,
    };
  }

  // ── 6. Playing or paused during lecture ──
  const isLectureSpeech = engineState.currentSpeech !== null;
  const bubbleRole: PlaybackView['bubbleRole'] = engineState.currentSpeakingAgentId
    ? 'agent'
    : 'teacher';

  return {
    phase:               ps === 'playing' ? 'lecturePlaying' : 'lecturePaused',
    sourceText:          isLectureSpeech ? engineState.currentSpeech : null,
    bubbleRole:          isLectureSpeech ? bubbleRole : null,
    buttonState:         ps === 'playing' && isLectureSpeech ? 'skip' : 'play',
    isDiscussionActive:  false,
    controlsEnabled:     true,
  };
}
