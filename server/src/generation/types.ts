/**
 * NeuroSpace Generation Types
 *
 * Two-stage generation pipeline:
 *   Stage 1: Curriculum/Topic → Scene Outlines
 *   Stage 2: Scene Outlines → Full Scenes (content + actions)
 *
 * Pipeline characteristics:
 *   - Lessons use rich-text sections instead of PPT element positioning
 *   - Curriculum data comes from MongoDB
 *   - Multi-agent orchestration with AI-generated personas
 *   - Learner profile drives difficulty adaptation
 */

// ==================== Agent Types ====================

/** Lightweight agent info passed to the generation pipeline */
export interface AgentInfo {
  id: string;
  name: string;
  role: 'teacher' | 'assistant' | 'student';
  persona?: string;
}

/** Full agent config stored in the persisted classroom */
export interface AgentConfig extends AgentInfo {
  avatar: string;   // emoji or relative path (/avatars/...)
  color: string;    // hex color for the speech bubble accent
  priority: number; // higher = speaks more often (teacher=10, assistant=7, student=5)
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

export type MediaGenerationType = 'image' | 'video';
export type MediaAspectRatio = '16:9' | '4:3' | '1:1' | '9:16';
export type MediaPlacementSlot = 'hero' | 'supporting' | 'comparison' | 'process' | 'diagram';
export type MediaTaskStatus = 'pending' | 'generating' | 'done' | 'failed' | 'disabled';

export interface MediaGenerationRequest {
  type: MediaGenerationType;
  prompt: string;
  elementId: string;
  aspectRatio?: MediaAspectRatio;
  style?: string;
  slot?: MediaPlacementSlot;
  sourceSectionId?: string;
  renderPolicy?: 'server' | 'hybrid';
}

export interface MediaTask {
  elementId: string;
  sceneId: string;
  sectionId?: string;
  type: MediaGenerationType;
  prompt: string;
  aspectRatio?: MediaAspectRatio;
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

// ==================== Scene Outline (Stage 1 Output) ====================

export interface SceneOutline {
  id: string;
  type: SceneType;
  title: string;
  description: string;
  keyPoints: string[];
  teachingObjective?: string;
  estimatedDuration?: number; // seconds
  order: number;
  mediaGenerations?: MediaGenerationRequest[];
  quizConfig?: QuizConfig;
}

export interface QuizConfig {
  questionCount: number;
  difficulty: 'easy' | 'medium' | 'hard';
  questionTypes: ('single' | 'multiple' | 'short_answer')[];
}

// ==================== Scene Content (Stage 2A Output) ====================

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
  content?: string;         // HTML or plain text
  items?: string[];          // for 'list' type
  term?: string;             // for 'definition' type
  definition?: string;       // for 'definition' type
  latex?: string;            // for 'formula' type
  variant?: 'info' | 'warning' | 'tip' | 'success'; // for 'callout'
  language?: string;         // for 'code' type
  level?: number;            // for 'heading' (1-3)
  imageUrl?: string;         // rendered image data URL for visual sections
  caption?: string;          // display caption for the visual
  imagePrompt?: string;      // source prompt/description for generated visual
  mediaElementId?: string;   // stable placeholder/media task binding
  mediaStatus?: MediaTaskStatus;
  mediaSlot?: MediaPlacementSlot;
  // flashcard fields
  options?: { label: string; value: string }[];  // answer choices A/B/C/D
  answer?: string;           // value of the correct option
  explanation?: string;      // shown on card flip
  // math_practice fields
  problem?: string;          // LaTeX string — the problem the student must solve
  hint?: string;             // optional hint shown on demand
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

// ==================== Actions (Stage 2B Output) ====================

export type ActionType =
  | 'speech'
  | 'highlight'
  | 'reveal'
  | 'pause'
  | 'discussion'
  | 'wb_open'
  | 'wb_close'
  | 'wb_clear'
  | 'wb_delete'
  | 'wb_draw_text'
  | 'wb_draw_latex'
  | 'wb_draw_shape'
  | 'wb_draw_line'
  | 'wb_draw_table';

export interface ActionBase {
  id: string;
  type: ActionType;
}

export interface SpeechAction extends ActionBase {
  type: 'speech';
  text: string;
  /** ID of the agent speaking — maps to AgentConfig.id */
  agentId: string;
}

export interface HighlightAction extends ActionBase {
  type: 'highlight';
  sectionId: string;
}

export interface RevealAction extends ActionBase {
  type: 'reveal';
  sectionId: string;
}

export interface PauseAction extends ActionBase {
  type: 'pause';
  durationMs: number;
}

export interface DiscussionAction extends ActionBase {
  type: 'discussion';
  topic: string;
  prompt?: string;
}

/**
 * Whiteboard scene action — pre-generated in lesson actions alongside speech.
 * Params are stored flat on the object (same shape as frontend WbDraw*Action types).
 */
export interface WbSceneAction extends ActionBase {
  type:
    | 'wb_open'
    | 'wb_close'
    | 'wb_clear'
    | 'wb_delete'
    | 'wb_draw_text'
    | 'wb_draw_latex'
    | 'wb_draw_shape'
    | 'wb_draw_line'
    | 'wb_draw_table';
  // All draw params live flat on the action (elementId, x, y, latex, content …)
  [key: string]: unknown;
}

export type Action =
  | SpeechAction
  | HighlightAction
  | RevealAction
  | PauseAction
  | DiscussionAction
  | WbSceneAction;

// ==================== Complete Scene ====================

export interface Scene {
  id: string;
  type: SceneType;
  title: string;
  order: number;
  content: SceneContent;
  actions: Action[];
}

// ==================== Generation Session ====================

export interface GenerationInput {
  /** Free-form topic text OR subjectId for curriculum-based generation */
  topic?: string;
  subjectId?: string;
  /** Learner context for adaptive generation */
  grade?: string;
  learnerLevel?: 'beginner' | 'intermediate' | 'advanced';
  weakTopics?: string[];
  strongTopics?: string[];
  /**
   * Per-strand mastery scores from the Tier 1 diagnostic (strand name → 0-100).
   * Used to calibrate:
   *  - lesson depth per strand (more scaffolding for low-score strands)
   *  - scene ordering (introduce weak strands before reinforcing strong ones)
   */
  strandScores?: Record<string, number>;
  /** Language */
  language?: 'en-US' | 'zh-CN';
  /** true when the subject is mathematics — enables whiteboard solve-along and math_practice sections */
  isMath?: boolean;
  /** Curriculum data (loaded from DB) */
  curriculumText?: string;
  curriculumTopics?: string[];
  subjectName?: string;
}

export interface GenerationProgress {
  stage: 'outlines' | 'content' | 'actions' | 'complete' | 'error';
  overallProgress: number;
  message: string;
  scenesCompleted: number;
  totalScenes: number;
  /** AI-generated agent configs — emitted once roles are ready, before outlines */
  agentConfigs?: AgentConfig[];
}

export interface GenerationResult {
  success: boolean;
  scenes?: Scene[];
  mediaTasks?: MediaTask[];
  title?: string;
  description?: string;
  error?: string;
  /** Agent configs to embed in the classroom for frontend display */
  agentConfigs?: AgentConfig[];
}

// ==================== AI Call Signature ====================

export type AICallFn = (
  systemPrompt: string,
  userPrompt: string,
) => Promise<string>;
