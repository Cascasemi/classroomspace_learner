/**
 * Playback Types — Frontend
 *
 * Mirrors the backend generation types needed for the classroom player.
 */

import type { Action } from '@/lib/types/action';

// ==================== Agents ====================

export interface AgentConfig {
  id: string;
  name: string;
  role: 'teacher' | 'assistant' | 'student';
  persona?: string;
  avatar: string;   // emoji or relative path (/avatars/...)
  color: string;    // hex e.g. '#3b82f6'
  priority: number;
  voiceHint?: {
    lang?: string;     // BCP-47 e.g. 'en-US'
    voiceName?: string;
    voiceId?: string;
    voiceIndex?: number;
    rate?: number;     // 0.5–2.0
    pitch?: number;    // 0–2.0
  };
}

// ==================== Scene Types ====================

export type SceneType = 'lesson' | 'quiz';

export type MediaTaskStatus = 'pending' | 'generating' | 'done' | 'failed' | 'disabled';
export type MediaPlacementSlot = 'hero' | 'supporting' | 'comparison' | 'process' | 'diagram';

export interface MediaTask {
  elementId: string;
  sceneId: string;
  sectionId?: string;
  type: 'image' | 'video';
  prompt: string;
  aspectRatio?: '16:9' | '4:3' | '1:1' | '9:16';
  style?: string;
  slot?: MediaPlacementSlot;
  status: MediaTaskStatus;
  providerId?: string;
  imageUrl?: string;
  error?: string;
  cached?: boolean;
  attempts?: number;
  createdAt: string;
  updatedAt: string;
}

// ==================== Content Sections ====================

export type SectionType =
  | 'heading'
  | 'text'
  | 'callout'
  | 'formula'
  | 'list'
  | 'definition'
  | 'code'
  | 'example'
  | 'image_placeholder'
  | 'flashcard'
  | 'math_practice';

export interface ContentSection {
  id: string;
  type: SectionType;
  content?: string;
  items?: string[];
  term?: string;
  definition?: string;
  latex?: string;
  variant?: 'info' | 'warning' | 'tip' | 'success';
  language?: string;
  level?: number;
  imageUrl?: string;
  caption?: string;
  imagePrompt?: string;
  mediaElementId?: string;
  mediaStatus?: MediaTaskStatus;
  mediaSlot?: MediaPlacementSlot;
  // flashcard fields
  options?: { label: string; value: string }[];
  answer?: string;
  explanation?: string;
  // math_practice fields
  problem?: string;      // LaTeX-encoded problem for the student to solve
  hint?: string;         // optional hint shown on demand
}

export interface LessonContent {
  type: 'lesson';
  sections: ContentSection[];
}

export interface QuizQuestion {
  id: string;
  type: 'single' | 'multiple' | 'short_answer';
  question: string;
  options?: { label: string; value: string }[];
  answer?: string[];
  analysis?: string;
  commentPrompt?: string;
  points?: number;
}

export interface QuizContent {
  type: 'quiz';
  questions: QuizQuestion[];
}

export type SceneContent = LessonContent | QuizContent;

// ==================== Actions ====================
// Full action system — re-exported from lib/types/action for backward compatibility

export type {
  Action,
  ActionType,
  ActionBase,
  SpeechAction,
  HighlightAction,
  RevealAction,
  PauseAction,
  DiscussionAction,
  SpotlightAction,
  LaserAction,
  PlayVideoAction,
  WbOpenAction,
  WbDrawTextAction,
  WbDrawShapeAction,
  WbDrawChartAction,
  WbDrawLatexAction,
  WbDrawTableAction,
  WbDrawLineAction,
  WbClearAction,
  WbDeleteAction,
  WbCloseAction,
  WbActionType,
} from '@/lib/types/action';

export { FIRE_AND_FORGET_ACTIONS, SLIDE_ONLY_ACTIONS, SYNC_ACTIONS, WB_ACTION_TYPES } from '@/lib/types/action';

// ==================== Scene ====================

export interface Scene {
  id: string;
  type: SceneType;
  title: string;
  order: number;
  content: SceneContent;
  actions: Action[];
}

// ==================== Classroom ====================

export interface ClassroomData {
  id: string;
  userId: string;
  title: string;
  description: string;
  subjectId?: string;
  grade?: string;
  scenes: Scene[];
  agentConfigs?: AgentConfig[];
  mediaTasks?: MediaTask[];
  status: 'generating' | 'ready' | 'error';
  isCustom: boolean;
  customTopic?: string;
  progress: ClassroomProgress;
  /** Live generation state — present while status === 'generating' */
  generation?: {
    progress: number;        // 0–100
    message: string;
    scenesCompleted: number;
    totalScenes: number;
  };
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClassroomProgress {
  currentSceneIndex: number;
  currentActionIndex: number;
  completedScenes: string[];
  quizResults: QuizResult[];
  startedAt: string;
  lastAccessedAt: string;
  totalTimeSpentMs: number;
}

export interface QuizResult {
  sceneId: string;
  answers: Record<string, string[]>;
  score: number;
  completedAt: string;
}

// ==================== Playback Engine State ====================

export type PlaybackState = 'idle' | 'playing' | 'paused' | 'scene-complete' | 'finished';

/** Active spotlight state — null when no spotlight is showing */
export interface SpotlightState {
  elementId: string;
}

/** Active laser state — null when no laser is showing */
export interface LaserState {
  elementId: string;
  color: string;
}

export interface PlaybackEngineState {
  playbackState: PlaybackState;
  currentSceneIndex: number;
  currentActionIndex: number;
  currentSpeech: string | null;
  currentSpeakingAgentId: string | null;
  highlightedSectionId: string | null;
  revealedSectionIds: Set<string>;
  discussionActive: boolean;
  discussionTopic: string | null;
  /** Playback speed multiplier: 0.75 | 1 | 1.5 | 2 */
  playbackSpeed: number;
  /** Active spotlight effect — null when not showing */
  spotlightState: SpotlightState | null;
  /** Active laser pointer effect — null when not showing */
  laserState: LaserState | null;
}
