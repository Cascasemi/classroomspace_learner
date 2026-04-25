/**
 * Playback Engine — Frontend
 *
 * Drives NeuroSpace's rich-text lesson format.
 *
 * Processes actions sequentially:
 *   - speech → display text, wait for reading time (or TTS)
 *   - highlight → mark a section, fire-and-forget
 *   - reveal → show a hidden section, fire-and-forget
 *   - pause → wait N ms
 *   - discussion → pause and show prompt
 *
 * State machine: idle → playing → paused → scene-complete → finished
 */

import type {
  Scene,
  Action,
  SpeechAction,
  SpotlightAction,
  LaserAction,
  PlaybackState,
  PlaybackEngineState,
} from './types';

// Average reading speed: ~200 words per minute → ~300ms per word
const MS_PER_WORD = 300;
const MIN_SPEECH_MS = 2000;
const MAX_SPEECH_MS = 15000;

export interface PlaybackCallbacks {
  onStateChange: (state: PlaybackEngineState) => void;
  onSceneChange: (sceneIndex: number) => void;
  onComplete: () => void;
  /**
   * Called when all actions in the current scene have finished executing.
   * Implementors can use this to trigger auto-next or agent proactivity.
   */
  onSceneComplete?: (sceneIndex: number) => void;
  /**
   * Called at the start of each new scene (after navigation).
   * Implementors can use this to trigger agent proactive commentary.
   */
  onSceneStart?: (sceneIndex: number) => void;
  /**
   * Called when the engine wants to speak text.
   * Implementors should call `done()` after the audio finishes (or is skipped).
   * If not provided, the engine falls back to a word-count reading-time timer.
   */
  onSpeechRequest?: (text: string, agentId: string | null, done: () => void) => void;
  /**
   * Called when the engine cancels in-progress speech (pause/skip/scene-change).
   * Implementors should stop any playing audio immediately.
   */
  onSpeechCancel?: () => void;
  /**
   * Called when the engine encounters a whiteboard action (wb_open, wb_draw_latex, etc.).
   * Implementors should update the whiteboard state immediately.
   * The action object carries `type` + flat params (e.g. `{ type: 'wb_draw_latex', latex, x, y }`).
   */
  onWbAction?: (action: Action) => void;
}

const EFFECT_CLEAR_DELAY_MS = 5_000;

export class PlaybackEngine {
  private scenes: Scene[] = [];
  private callbacks: PlaybackCallbacks;
  private state: PlaybackEngineState;
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private effectTimer: ReturnType<typeof setTimeout> | null = null;
  private isStopped = false;
  /** Incremented on every skip/navigate/stop to invalidate in-flight TTS done() callbacks. */
  private speechGeneration = 0;
  /**
   * Saved scene/action index captured the moment a discussion action fires.
   * Allows `dismissDiscussion()` to restore the exact playback position even if
   * the user navigated to a different scene while the discussion overlay was open.
   */
  private discussionCheckpoint: { sceneIndex: number; actionIndex: number } | null = null;

  constructor(scenes: Scene[], callbacks: PlaybackCallbacks) {
    this.scenes = scenes;
    this.callbacks = callbacks;
    this.state = this.createInitialState();
  }

  // ==================== Public API ====================

  /** Start or resume playback from the current position */
  play(): void {
    if (this.state.playbackState === 'finished') return;
    this.isStopped = false;
    this.setState({ playbackState: 'playing' });
    this.processNextAction();
  }

  /** Pause playback */
  pause(): void {
    if (this.state.playbackState !== 'playing') return;
    this.clearTimer();
    this.speechGeneration++; // invalidate in-flight TTS
    this.callbacks.onSpeechCancel?.();
    this.setState({ playbackState: 'paused' });
  }

  /** Resume from paused state */
  resume(): void {
    if (this.state.playbackState !== 'paused') return;
    this.setState({ playbackState: 'playing' });
    this.processNextAction();
  }

  /** Stop playback and reset */
  stop(): void {
    this.isStopped = true;
    this.clearTimer();
    this.clearEffects();
    this.speechGeneration++;
    this.discussionCheckpoint = null;
    this.callbacks.onSpeechCancel?.();
    this.state = this.createInitialState();
    this.emitState();
  }

  /** Jump to a specific scene */
  goToScene(index: number): void {
    if (index < 0 || index >= this.scenes.length) return;
    this.clearTimer();
    this.clearEffects();
    this.speechGeneration++;
    this.callbacks.onSpeechCancel?.();

    const scene = this.scenes[index];

    // Reveal all sections immediately when jumping to a scene
    const revealedIds = new Set<string>();
    if (scene.content.type === 'lesson') {
      scene.content.sections.forEach((s) => revealedIds.add(s.id));
    }

    this.setState({
      currentSceneIndex: index,
      currentActionIndex: 0,
      currentSpeech: null,
      currentSpeakingAgentId: null,
      highlightedSectionId: null,
      revealedSectionIds: revealedIds,
      playbackState: 'paused',
      discussionActive: false,
      discussionTopic: null,
      spotlightState: null,
      laserState: null,
    });

    this.callbacks.onSceneChange(index);
  }

  /** Move to the next scene */
  nextScene(): void {
    const nextIndex = this.state.currentSceneIndex + 1;
    if (nextIndex >= this.scenes.length) {
      this.setState({ playbackState: 'finished' });
      this.callbacks.onComplete();
      return;
    }

    this.clearTimer();
    this.clearEffects();
    this.speechGeneration++;
    this.callbacks.onSpeechCancel?.();
    this.setState({
      currentSceneIndex: nextIndex,
      currentActionIndex: 0,
      currentSpeech: null,
      currentSpeakingAgentId: null,
      highlightedSectionId: null,
      revealedSectionIds: new Set<string>(),
      playbackState: 'playing',
      discussionActive: false,
      discussionTopic: null,
      spotlightState: null,
      laserState: null,
    });

    this.callbacks.onSceneChange(nextIndex);
    this.processNextAction();
  }

  /** Move to the previous scene */
  prevScene(): void {
    const prevIndex = this.state.currentSceneIndex - 1;
    if (prevIndex < 0) return;
    this.goToScene(prevIndex);
  }

  /** Dismiss discussion and continue from the checkpoint (or current position) */
  dismissDiscussion(): void {
    if (!this.state.discussionActive) return;

    // Restore the checkpoint if the user navigated away during the discussion overlay
    if (
      this.discussionCheckpoint !== null &&
      (this.discussionCheckpoint.sceneIndex !== this.state.currentSceneIndex ||
        this.discussionCheckpoint.actionIndex !== this.state.currentActionIndex)
    ) {
      this.setState({
        currentSceneIndex: this.discussionCheckpoint.sceneIndex,
        currentActionIndex: this.discussionCheckpoint.actionIndex,
      });
    }

    this.discussionCheckpoint = null;
    this.setState({
      discussionActive: false,
      discussionTopic: null,
      playbackState: 'playing',
    });
    this.advanceAction();
    this.processNextAction();
  }

  /** Close discussion and jump straight to the next scene */
  finishDiscussionAndNextScene(): void {
    if (!this.state.discussionActive) return;

    this.clearTimer();
    this.speechGeneration++;
    this.callbacks.onSpeechCancel?.();
    this.discussionCheckpoint = null;

    this.setState({
      discussionActive: false,
      discussionTopic: null,
      playbackState: 'playing',
      currentSpeech: null,
      currentSpeakingAgentId: null,
    });

    this.nextScene();
  }

  /** Skip the current speech and move to the next action */
  skipSpeech(): void {
    if (this.state.playbackState !== 'playing') return;
    this.clearTimer();
    this.speechGeneration++; // invalidate in-flight TTS done() callback
    this.callbacks.onSpeechCancel?.();
    this.setState({ currentSpeech: null, currentSpeakingAgentId: null });
    this.advanceAction();
    this.processNextAction();
  }

  /** Set playback speed multiplier (0.75 | 1 | 1.5 | 2) */
  setSpeed(speed: number): void {
    this.setState({ playbackSpeed: speed });
  }

  /** Get current playback speed */
  getSpeed(): number {
    return this.state.playbackSpeed;
  }

  /** Get current state snapshot */
  getState(): PlaybackEngineState {
    return { ...this.state, revealedSectionIds: new Set(this.state.revealedSectionIds) };
  }

  /** Get current scene */
  getCurrentScene(): Scene | null {
    return this.scenes[this.state.currentSceneIndex] ?? null;
  }

  /** Restore progress (e.g. from server) */
  restoreProgress(sceneIndex: number, actionIndex: number): void {
    if (sceneIndex >= 0 && sceneIndex < this.scenes.length) {
      this.goToScene(sceneIndex);
      this.setState({ currentActionIndex: Math.min(actionIndex, this.getCurrentActions().length) });
    }
  }

  /**
   * Append newly-generated scenes to the engine's scene list.
   * Called while the classroom is in "background generation" mode — the
   * classroom is already accessible but more scenes are still being produced.
   * The engine does NOT reset or interrupt playback; new scenes simply become
   * available for navigation once appended.
   */
  appendScenes(newScenes: Scene[]): void {
    if (!newScenes.length) return;
    this.scenes = [...this.scenes, ...newScenes];
    // If the engine was in 'finished' state (user reached the last scene),
    // reset to 'scene-complete' so navigation to the next scene is possible.
    if (this.state.playbackState === 'finished') {
      this.setState({ playbackState: 'scene-complete' });
    }
    // Re-emit state so subscribers learn the new scene count
    this.emitState();
  }

  /** Total number of scenes currently loaded in the engine */
  getTotalScenes(): number {
    return this.scenes.length;
  }

  // ==================== Internal ====================

  private processNextAction(): void {
    if (this.isStopped || this.state.playbackState !== 'playing') return;

    const actions = this.getCurrentActions();
    const idx = this.state.currentActionIndex;

    // Check if scene is complete
    if (idx >= actions.length) {
      this.setState({ playbackState: 'scene-complete', currentSpeech: null });
      this.callbacks.onSceneComplete?.(this.state.currentSceneIndex);
      return;
    }

    const action = actions[idx];
    this.executeAction(action);
  }

  private executeAction(action: Action): void {
    switch (action.type) {
      case 'speech':
        this.handleSpeech(action);
        break;

      case 'spotlight': {
        const sa = action as SpotlightAction;
        this.setState({ spotlightState: { elementId: sa.elementId } });
        this.scheduleEffectClear();
        // Fire-and-forget — advance immediately; overlay appears while speech plays
        this.advanceAction();
        this.processNextAction();
        break;
      }

      case 'laser': {
        const la = action as LaserAction;
        this.setState({ laserState: { elementId: la.elementId, color: la.color ?? '#ff0000' } });
        this.scheduleEffectClear();
        // Fire-and-forget
        this.advanceAction();
        this.processNextAction();
        break;
      }

      case 'highlight':
        // Some generated scenes highlight a section without emitting a separate
        // reveal step first. If we only highlight, the lesson can remain fully
        // hidden because LessonRenderer gates visibility on revealedSectionIds.
        // Treat highlight as an implicit reveal so navigation never lands on a
        // blank slide while still preserving progressive disclosure.
        this.setState({
          highlightedSectionId: action.sectionId,
          revealedSectionIds: new Set(this.state.revealedSectionIds).add(action.sectionId),
        });
        // Fire-and-forget — immediately move to next action
        this.advanceAction();
        this.processNextAction();
        break;

      case 'reveal': {
        const newRevealed = new Set(this.state.revealedSectionIds);
        newRevealed.add(action.sectionId);
        this.setState({ revealedSectionIds: newRevealed });
        // Fire-and-forget
        this.advanceAction();
        this.processNextAction();
        break;
      }

      case 'pause':
        this.timerId = setTimeout(() => {
          this.advanceAction();
          this.processNextAction();
        }, action.durationMs);
        break;

      case 'discussion':
        // Save current position so dismissDiscussion() can restore it even if
        // the user navigated while the overlay was open.
        this.discussionCheckpoint = {
          sceneIndex: this.state.currentSceneIndex,
          actionIndex: this.state.currentActionIndex,
        };
        this.setState({
          discussionActive: true,
          discussionTopic: action.topic,
          playbackState: 'paused',
        });
        break;

      case 'wb_open':
      case 'wb_close':
      case 'wb_clear':
      case 'wb_delete':
      case 'wb_draw_text':
      case 'wb_draw_latex':
      case 'wb_draw_shape':
      case 'wb_draw_line':
      case 'wb_draw_table':
        // Fire whiteboard action callback then immediately advance
        this.callbacks.onWbAction?.(action);
        this.advanceAction();
        this.processNextAction();
        break;

      default:
        // Unknown action — skip
        this.advanceAction();
        this.processNextAction();
    }
  }

  private handleSpeech(action: SpeechAction): void {
    this.setState({
      currentSpeech: action.text,
      currentSpeakingAgentId: action.agentId ?? null,
    });

    const gen = ++this.speechGeneration;

    const advance = () => {
      // Stale callback — a skip/pause/navigate already moved us on
      if (gen !== this.speechGeneration) return;
      if (this.isStopped || this.state.playbackState !== 'playing') return;
      this.setState({ currentSpeech: null, currentSpeakingAgentId: null });
      this.advanceAction();
      this.processNextAction();
    };

    // If a TTS delegate is registered, hand off to it (no timer needed)
    if (this.callbacks.onSpeechRequest) {
      this.callbacks.onSpeechRequest(action.text, action.agentId ?? null, advance);
      return;
    }

    // Fallback: word-count reading-time timer (divided by speed)
    const wordCount = action.text.split(/\s+/).length;
    const speed = this.state.playbackSpeed || 1;
    const readingTimeMs = Math.min(
      Math.max(wordCount * MS_PER_WORD, MIN_SPEECH_MS),
      MAX_SPEECH_MS,
    ) / speed;
    this.timerId = setTimeout(advance, readingTimeMs);
  }

  private advanceAction(): void {
    this.state.currentActionIndex++;
  }

  private getCurrentActions(): Action[] {
    const scene = this.scenes[this.state.currentSceneIndex];
    return scene?.actions ?? [];
  }

  private createInitialState(): PlaybackEngineState {
    return {
      playbackState: 'idle',
      currentSceneIndex: 0,
      currentActionIndex: 0,
      currentSpeech: null,
      currentSpeakingAgentId: null,
      highlightedSectionId: null,
      revealedSectionIds: new Set<string>(),
      discussionActive: false,
      discussionTopic: null,
      playbackSpeed: 1,
      spotlightState: null,
      laserState: null,
    };
  }

  private setState(partial: Partial<PlaybackEngineState>): void {
    this.state = { ...this.state, ...partial };
    this.emitState();
  }

  private emitState(): void {
    this.callbacks.onStateChange({
      ...this.state,
      revealedSectionIds: new Set(this.state.revealedSectionIds),
    });
  }

  private clearTimer(): void {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  /**
   * Immediately clear all active visual effects (spotlight + laser).
   * Called on scene change and engine stop so effects never bleed across scenes.
   */
  clearEffects(): void {
    if (this.effectTimer !== null) {
      clearTimeout(this.effectTimer);
      this.effectTimer = null;
    }
    if (this.state.spotlightState !== null || this.state.laserState !== null) {
      this.setState({ spotlightState: null, laserState: null });
    }
  }

  /**
   * Schedule effects to auto-clear after EFFECT_CLEAR_DELAY_MS.
   * Resets the timer if a new effect fires before the previous one expired.
   */
  private scheduleEffectClear(): void {
    if (this.effectTimer !== null) {
      clearTimeout(this.effectTimer);
    }
    this.effectTimer = setTimeout(() => {
      this.effectTimer = null;
      this.clearEffects();
    }, EFFECT_CLEAR_DELAY_MS);
  }
}
