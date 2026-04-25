/**
 * Whiteboard Types — Openclass_learner Classroom
 *
 * Models the whiteboard state and all element/action types that agents
 * can emit during live discussion rounds.
 *
 * Canvas size: 1000 × 562 px (16:9 virtual coordinate space).
 * All element positions are in this virtual space; the component scales
 * to fit the container using a CSS transform.
 */

// ==================== Element Types ====================

export interface WBBaseElement {
  /** Stable logical ID — set by the agent via elementId param or auto-generated */
  id: string;
}

export interface WBTextElement extends WBBaseElement {
  type: 'text';
  content: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  fontSize?: number;
  color?: string;
  bold?: boolean;
  italic?: boolean;
}

export type WBShapeKind =
  | 'rectangle'
  | 'circle'
  | 'triangle'
  | 'arrow'
  | 'diamond'
  | 'parallelogram';

export interface WBShapeElement extends WBBaseElement {
  type: 'shape';
  shape: WBShapeKind;
  x: number;
  y: number;
  width: number;
  height: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  /** Optional label drawn inside the shape */
  label?: string;
}

export interface WBChartDataset {
  label: string;
  data: number[];
  color?: string;
}

export interface WBChartElement extends WBBaseElement {
  type: 'chart';
  /** 'column' is an alias for 'bar'; 'ring' is an alias for 'pie'. */
  chartType: 'bar' | 'column' | 'line' | 'pie' | 'ring' | 'area';
  labels: string[];
  datasets: WBChartDataset[];
  x: number;
  y: number;
  width: number;
  height: number;
  title?: string;
}

export interface WBLatexElement extends WBBaseElement {
  type: 'latex';
  latex: string;
  x: number;
  y: number;
  /** Rendered height in virtual px — width is auto-computed by KaTeX */
  height: number;
  color?: string;
  /** Optional explicit font-size in virtual px. Defaults to height * 0.5 (capped at 80). */
  fontSize?: number;
}

export interface WBTableElement extends WBBaseElement {
  type: 'table';
  /** Row-major 2-D array; first row is treated as header */
  data: string[][];
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WBPoint {
  x: number;
  y: number;
}

export interface WBLineElement extends WBBaseElement {
  type: 'line';
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  stroke?: string;
  strokeWidth?: number;
  /** 'arrow' adds an arrowhead at the end */
  points?: string[];
}

export type WBElement =
  | WBTextElement
  | WBShapeElement
  | WBChartElement
  | WBLatexElement
  | WBTableElement
  | WBLineElement;

// ==================== Action Payloads ====================

/** Raw action objects in the agent's JSON array response */
export type WBActionName =
  | 'wb_open'
  | 'wb_close'
  | 'wb_clear'
  | 'wb_delete'
  | 'wb_draw_text'
  | 'wb_draw_shape'
  | 'wb_draw_chart'
  | 'wb_draw_latex'
  | 'wb_draw_table'
  | 'wb_draw_line';

export interface WBAction {
  name: WBActionName;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params?: Record<string, any>;
}

// ==================== Whiteboard State ====================

export interface WhiteboardState {
  /** Whether the whiteboard panel is visible */
  isOpen: boolean;
  /** Current elements on the canvas, in draw order */
  elements: WBElement[];
}

export function createEmptyWhiteboard(): WhiteboardState {
  return { isOpen: false, elements: [] };
}

// ==================== Ledger (server-side round tracking) ====================

/** One recorded whiteboard action from an agent during a round */
export interface WBLedgerEntry {
  agentName: string;
  actionName: WBActionName;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params?: Record<string, any>;
}

// ==================== Parsed Agent Response ====================

/** One agent item from the JSON array the LLM emits */
export type AgentResponseItem =
  | { type: 'text'; content: string }
  | { type: 'action'; name: WBActionName; params?: Record<string, never> };
