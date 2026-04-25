/**
 * Chat / Session Types — Frontend
 *
 * Models multi-turn discussion sessions (QA, discussion, lecture).
 */

import type { Action } from './action';

// ==================== Session ====================

/**
 * Type of interactive session.
 *   qa         — single-turn user question → agent answer
 *   discussion — multi-agent roundtable (teacher + assistant + student)
 *   lecture    — scripted lecture playback
 */
export type SessionType = 'qa' | 'discussion' | 'lecture';

export type SessionStatus = 'idle' | 'active' | 'interrupted' | 'completed';

// ==================== Messages ====================

export interface ChatMessageMetadata {
  /** Display name of the sender */
  senderName?: string;
  /** Avatar URL or emoji */
  senderAvatar?: string;
  /** Original role before agent aliasing */
  originalRole?: string;
  /** Ordered actions embedded in this message */
  actions?: Action[];
  /** Agent ID (maps to AgentConfig.id) */
  agentId?: string;
  /** Agent brand colour (hex) */
  agentColor?: string;
  /** ISO timestamp */
  createdAt?: number;
  /** Whether the session was interrupted after this message */
  interrupted?: boolean;
}

export interface ChatMessage {
  id: string;
  /** 'user' | 'assistant' | 'system' */
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: ChatMessageMetadata;
  createdAt: number;
}

// ==================== Session Config ====================

export interface SessionConfig {
  /** IDs of participating agents */
  agentIds: string[];
  /** Maximum discussion turns before auto-close */
  maxTurns: number;
  /** Current turn counter */
  currentTurn: number;
  /** Agent that triggers the first turn */
  triggerAgentId?: string;
  /** Fallback agent for un-addressed messages */
  defaultAgentId?: string;
}

// ==================== Tool Calls ====================

export interface ToolCallRequest {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export type ToolCallStatus = 'pending' | 'executing' | 'completed' | 'failed';

export interface ToolCallRecord {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: unknown;
  error?: string;
  status: ToolCallStatus;
  createdAt: number;
  completedAt?: number;
}

// ==================== Chat Session ====================

export interface ChatSession {
  id: string;
  type: SessionType;
  title: string;
  status: SessionStatus;
  messages: ChatMessage[];
  config: SessionConfig;
  toolCalls: ToolCallRecord[];
  pendingToolCalls: ToolCallRequest[];
  /** ID of the scene this session is attached to */
  sceneId?: string;
  /** Index of the last processed action in the scene */
  lastActionIndex?: number;
  createdAt: number;
  updatedAt: number;
}

// ==================== Session Events (SSE) ====================

export interface SessionSummary {
  sessionId: string;
  totalTurns: number;
  totalMessages: number;
  totalToolCalls: number;
  endReason: string;
}

export type SessionEvent =
  | { type: 'message';       data: ChatMessage }
  | { type: 'tool_request';  data: { sessionId: string; toolCalls: ToolCallRequest[] } }
  | { type: 'tool_complete'; data: ToolCallRecord }
  | { type: 'agent_switch';  data: { fromAgentId: string | null; toAgentId: string } }
  | { type: 'session_status'; data: { status: SessionStatus; reason?: string } }
  | { type: 'text_start';    data: { messageId: string; agentId: string; agentName: string } }
  | { type: 'text_delta';    data: { messageId: string; delta: string } }
  | { type: 'text_end';      data: { messageId: string; content: string } }
  | { type: 'error';         data: { message: string } }
  | { type: 'done';          data: SessionSummary };

// ==================== Lecture Notes ====================

export type LectureNoteItem =
  | { kind: 'speech'; text: string }
  | { kind: 'action'; type: string; label?: string };

export interface LectureNoteEntry {
  sceneId: string;
  sceneTitle: string;
  sceneOrder: number;
  items: LectureNoteItem[];
  completedAt: number;
}

// ==================== Stateless Discussion API ====================

/** Condensed summary of one agent's turn (passed back in subsequent requests) */
export interface AgentTurnSummary {
  agentId: string;
  agentName: string;
  speechText: string;
  actionCount: number;
}

/** Accumulated director state (client-maintained across per-agent calls) */
export interface DirectorState {
  turnCount: number;
  agentResponses: AgentTurnSummary[];
}

/** Request body for the /api/discuss endpoint */
export interface DiscussRequest {
  classroomId: string;
  discussionTopic: string;
  discussionPrompt?: string;
  sceneTitle?: string;
  sceneDescription?: string;
  studentMessage?: string;
  directorState?: DirectorState;
  userProfile?: { nickname?: string; bio?: string };
}

/** Per-agent response returned from /api/discuss */
export interface DiscussionAgentResponse {
  agentId: string;
  agentName: string;
  agentRole: string;
  speech: string;
  whiteboardActions: Array<{ name: string; params?: Record<string, unknown> }>;
}
