/**
 * Playback Constants
 *
 * Shared numeric and configuration constants for the classroom playback engine.
 */

// ==================== Speed Tiers ====================

/** Available playback speed multipliers */
export const PLAYBACK_SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const;
export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number];

export const DEFAULT_PLAYBACK_SPEED: PlaybackSpeed = 1;

// ==================== TTS ====================

/** Default TTS speed (word-per-minute scale, 1.0 = normal) */
export const DEFAULT_TTS_SPEED = 1.0;

/** TTS speed range */
export const TTS_SPEED_MIN = 0.5;
export const TTS_SPEED_MAX = 2.0;

/** Default TTS volume (0–1) */
export const DEFAULT_TTS_VOLUME = 1.0;

// ==================== Discussion ====================

/** Maximum discussion turns before auto-close */
export const MAX_DISCUSSION_TURNS = 6;

/** Delay (ms) between agent speeches in a discussion round */
export const AGENT_SPEECH_DELAY_MS = 600;

// ==================== Whiteboard ====================

/** Virtual canvas width */
export const WB_CANVAS_WIDTH = 1000;

/** Virtual canvas height */
export const WB_CANVAS_HEIGHT = 562;

/** Maximum number of whiteboard undo snapshots */
export const WB_MAX_HISTORY = 20;

// ==================== Progress persistence ====================

/** LocalStorage key for saving playback progress */
export const PROGRESS_STORAGE_KEY = 'ns_playback_progress';
