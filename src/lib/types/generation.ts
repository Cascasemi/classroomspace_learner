/**
 * Generation Pipeline Types — Frontend
 *
 * Types for generation progress events and AI call functions.
 */

// ==================== Generation Progress ====================

export interface GenerationProgress {
  /** Pipeline stage (1 = outline, 2 = scene generation) */
  currentStage: 1 | 2;
  /** Overall progress 0–100 */
  overallProgress: number;
  /** Current stage progress 0–100 */
  stageProgress: number;
  statusMessage: string;
  scenesGenerated: number;
  totalScenes: number;
  errors?: string[];
}

// ==================== Results ====================

export interface GenerationResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// ==================== Callbacks ====================

export interface GenerationCallbacks {
  onProgress?: (progress: GenerationProgress) => void;
  onStageComplete?: (stage: 1 | 2, result: unknown) => void;
  onError?: (error: string) => void;
}

// ==================== Scene Outline (frontend mirror) ====================

export type SceneOutlineType = 'lesson' | 'quiz';

export interface SceneOutline {
  id: string;
  type: SceneOutlineType;
  order: number;
  title: string;
  description: string;
  /** Key learning points or quiz coverage */
  keyPoints: string[];
}

// ==================== Generation Session ====================

export interface GenerationSession {
  id: string;
  topic: string;
  grade?: string;
  subject?: string;
  sceneOutlines?: SceneOutline[];
  progress: GenerationProgress;
  startedAt: Date;
  completedAt?: Date;
}

// ==================== Context ====================

/** Cross-scene context for speech coherence */
export interface SceneGenerationContext {
  sceneIndex: number;        // 0-based
  totalScenes: number;
  allTitles: string[];
  previousSpeeches: string[];
}
