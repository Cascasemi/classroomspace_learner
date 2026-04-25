/**
 * Unified Action System — Frontend Types
 *
 * Actions are the sole mechanism for agents to interact with the presentation.
 * Two categories:
 *  - Fire-and-forget: visual effects on slides (spotlight, laser)
 *  - Synchronous: must wait for completion before next action (speech, whiteboard, discussion)
 *
 * Both online (streaming) and offline (playback) paths consume the same Action types.
 */

// ==================== Base ====================

export interface ActionBase {
  id: string;
  title?: string;
  description?: string;
}

// ==================== Fire-and-forget actions ====================

/** Spotlight — focus on a single element, dim everything else */
export interface SpotlightAction extends ActionBase {
  type: 'spotlight';
  elementId: string;
  dimOpacity?: number; // default 0.5
}

/** Laser — point at an element with a laser effect */
export interface LaserAction extends ActionBase {
  type: 'laser';
  elementId: string;
  color?: string; // default '#ff0000'
}

// ==================== Synchronous actions ====================

/** Speech — teacher narration (wait for TTS to finish) */
export interface SpeechAction extends ActionBase {
  type: 'speech';
  text: string;
  audioId?: string;
  audioUrl?: string;
  voice?: string;
  speed?: number; // default 1.0
  agentId?: string;
}

/** Highlight — visually emphasise a section/element */
export interface HighlightAction extends ActionBase {
  type: 'highlight';
  sectionId: string;
}

/** Reveal — progressively reveal a section */
export interface RevealAction extends ActionBase {
  type: 'reveal';
  sectionId: string;
}

/** Pause — wait before next action */
export interface PauseAction extends ActionBase {
  type: 'pause';
  durationMs: number;
}

/** Open whiteboard (wait for animation) */
export interface WbOpenAction extends ActionBase {
  type: 'wb_open';
}

/** Draw text on whiteboard */
export interface WbDrawTextAction extends ActionBase {
  type: 'wb_draw_text';
  elementId?: string;
  content: string;
  x: number;
  y: number;
  width?: number;  // default 400
  height?: number; // default 100
  fontSize?: number; // default 18
  color?: string;    // default '#333333'
  bold?: boolean;
  italic?: boolean;
}

/** Draw shape on whiteboard */
export interface WbDrawShapeAction extends ActionBase {
  type: 'wb_draw_shape';
  elementId?: string;
  shape: 'rectangle' | 'circle' | 'triangle' | 'diamond' | 'parallelogram' | 'arrow';
  x: number;
  y: number;
  width: number;
  height: number;
  fillColor?: string;  // default '#5b9bd5'
  stroke?: string;
  strokeWidth?: number;
  label?: string;
}

/** A single dataset series for a chart element */
export interface WbChartDataset {
  label: string;
  data: number[];
  color?: string;
}

/** Draw chart on whiteboard */
export interface WbDrawChartAction extends ActionBase {
  type: 'wb_draw_chart';
  elementId?: string;
  /**
   * Supported render types. `'column'` is an alias for `'bar'` (rendered as bar chart).
   * `'ring'` falls back to a pie chart. `'area'`, `'radar'`, and `'scatter'` are
   * progressively supported — `'area'` has a dedicated renderer, the rest fall back to bar.
   */
  chartType: 'bar' | 'column' | 'line' | 'pie' | 'ring' | 'area';
  x: number;
  y: number;
  width: number;
  height: number;
  /**
   * Chart data in the `datasets` format produced by the server-side agent prompts.
   * Each dataset is one line/bar series. `labels` are the shared X-axis categories.
   *
   * Legacy OpenMAIC `{ labels, legends, series }` format is also accepted by the
   * whiteboard reducer for backward compatibility but is NOT used by any server route.
   */
  labels: string[];
  datasets: WbChartDataset[];
  title?: string;
}

/** Draw LaTeX formula on whiteboard */
export interface WbDrawLatexAction extends ActionBase {
  type: 'wb_draw_latex';
  elementId?: string;
  latex: string;
  x: number;
  y: number;
  width?: number;  // default 400
  height?: number; // auto-calculated based on formula
  color?: string;  // default '#000000'
}

/** Draw table on whiteboard */
export interface WbDrawTableAction extends ActionBase {
  type: 'wb_draw_table';
  elementId?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  data: string[][]; // Row-major; first row is header
  outline?: { width: number; style: string; color: string };
  theme?: { color: string };
}

/** Draw line/arrow on whiteboard */
export interface WbDrawLineAction extends ActionBase {
  type: 'wb_draw_line';
  elementId?: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  color?: string; // default '#333333'
  width?: number; // default 2
  style?: 'solid' | 'dashed'; // default 'solid'
  points?: ['', 'arrow'] | ['arrow', ''] | ['arrow', 'arrow'] | ['', '']; // endpoint markers
}

/** Clear all whiteboard elements */
export interface WbClearAction extends ActionBase {
  type: 'wb_clear';
}

/** Delete a specific whiteboard element by ID */
export interface WbDeleteAction extends ActionBase {
  type: 'wb_delete';
  elementId: string;
}

/** Close whiteboard */
export interface WbCloseAction extends ActionBase {
  type: 'wb_close';
}

/** Play video — start playback of a video element on the slide */
export interface PlayVideoAction extends ActionBase {
  type: 'play_video';
  elementId: string;
}

/** Discussion — trigger a roundtable discussion */
export interface DiscussionAction extends ActionBase {
  type: 'discussion';
  topic: string;
  prompt?: string;
  agentId?: string;
}

// ==================== Union type ====================

export type Action =
  | SpotlightAction
  | LaserAction
  | SpeechAction
  | HighlightAction
  | RevealAction
  | PauseAction
  | PlayVideoAction
  | WbOpenAction
  | WbDrawTextAction
  | WbDrawShapeAction
  | WbDrawChartAction
  | WbDrawLatexAction
  | WbDrawTableAction
  | WbDrawLineAction
  | WbClearAction
  | WbDeleteAction
  | WbCloseAction
  | DiscussionAction;

export type ActionType = Action['type'];

/** Action types that fire immediately without blocking */
export const FIRE_AND_FORGET_ACTIONS: ActionType[] = ['spotlight', 'laser'];

/** Action types that only work on slide scenes */
export const SLIDE_ONLY_ACTIONS: ActionType[] = ['spotlight', 'laser'];

/** Action types that must complete before the next action runs */
export const SYNC_ACTIONS: ActionType[] = [
  'speech',
  'play_video',
  'wb_open',
  'wb_draw_text',
  'wb_draw_shape',
  'wb_draw_chart',
  'wb_draw_latex',
  'wb_draw_table',
  'wb_draw_line',
  'wb_clear',
  'wb_delete',
  'wb_close',
  'discussion',
];

// ==================== Utility types ====================

/** All whiteboard action types */
export type WbActionType = Extract<
  ActionType,
  | 'wb_open' | 'wb_close' | 'wb_clear' | 'wb_delete'
  | 'wb_draw_text' | 'wb_draw_shape' | 'wb_draw_chart'
  | 'wb_draw_latex' | 'wb_draw_table' | 'wb_draw_line'
>;

export const WB_ACTION_TYPES: WbActionType[] = [
  'wb_open', 'wb_close', 'wb_clear', 'wb_delete',
  'wb_draw_text', 'wb_draw_shape', 'wb_draw_chart',
  'wb_draw_latex', 'wb_draw_table', 'wb_draw_line',
];
