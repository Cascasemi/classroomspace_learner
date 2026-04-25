/**
 * Generation Pipeline — Full Orchestrator
 *
 * Coordinates the two-stage pipeline:
 *   Stage 1: GenerationInput → SceneOutline[]
 *   Stage 2: SceneOutline[] → Scene[] (content + actions)
 *
 * Supports two modes:
 *   1. Curriculum-based: loads curriculum from DB + learner profile
 *   2. Custom topic: user provides a free-form topic string
 */

import { Curriculum } from '../models/Curriculum';
import { LearnerProfile, type ISubjectProgress } from '../models/LearnerProfile';
import { createAICallFn, createAICallFnForUser } from '../ai/llm';
import { generateSceneOutlines } from './outline-generator';
import { generateFullScenes } from './scene-generator';
import { getDefaultAgents, getDefaultAgentConfigs, clampAgents, generateAgentProfiles } from './agents';
import type {
  GenerationInput,
  GenerationResult,
  GenerationProgress,
  Scene,
  AgentConfig,
} from './types';
import type { LoadedCurriculum } from '../lib/curriculum-loader.js';

export type ProgressCallback = (progress: GenerationProgress) => void;

/** Called immediately when each scene finishes generating — enables early-ready UX. */
export type OnSceneReadyCallback = (
  scene: Scene,
  completedIndex: number,
  total: number,
  title: string,
  agentConfigs: AgentConfig[],
) => Promise<void>;

/**
 * Returns true when the subject is a mathematics/quantitative discipline.
 * Used to switch the generation pipeline into whiteboard solve-along mode.
 */
function detectMath(input: Pick<GenerationInput, 'subjectName' | 'topic' | 'curriculumTopics'>): boolean {
  const haystack = [
    input.subjectName,
    input.topic,
    ...(input.curriculumTopics ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return /\b(math|maths|mathematics|algebra|geometry|calculus|trigonometry|statistics|arithmetic|number\s+theory|linear\s+algebra|differential\s+equation|probability|combinatorics|discrete\s+math|pre\s*calc|precalc)\b/.test(haystack);
}

/**
 * Run the full generation pipeline for a curriculum-based classroom.
 */
export async function generateFromCurriculum(
  userId: string,
  subjectId: string,
  onProgress?: ProgressCallback,
  onSceneReady?: OnSceneReadyCallback,
): Promise<GenerationResult> {
  try {
    // Step 1: Load curriculum data
    onProgress?.({
      stage: 'outlines',
      overallProgress: 5,
      message: 'Loading curriculum data...',
      scenesCompleted: 0,
      totalScenes: 0,
    });

    const curriculum = await Curriculum.findOne({ subjectId, isActive: true });
    if (!curriculum) {
      return { success: false, error: `Curriculum not found: ${subjectId}` };
    }

    // Step 2: Load learner profile for adaptation
    const profile = await LearnerProfile.findOne({ userId });
    const subjectProgress = profile?.subjects.find(
      (s: ISubjectProgress) => s.subjectId === subjectId,
    );

    // Build generation input
    const input: GenerationInput = {
      subjectId,
      subjectName: curriculum.subjectName,
      grade: curriculum.grade,
      curriculumText: curriculum.pdfText || '',
      curriculumTopics: curriculum.topics,
      learnerLevel: profile?.overallLevel || 'beginner',
      weakTopics: subjectProgress?.weakTopics || [],
      strongTopics: subjectProgress?.strongTopics || [],
      strandScores: subjectProgress?.strandScores ?? undefined,
      language: 'en-US',
      isMath: detectMath({ subjectName: curriculum.subjectName, curriculumTopics: curriculum.topics }),
    };

    // Run the pipeline
    return await runPipeline(input, onProgress, userId, onSceneReady);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown pipeline error';
    console.error('[pipeline] Curriculum generation failed:', message);
    return { success: false, error: message };
  }
}

/**
 * Run the full generation pipeline for a custom topic.
 */
export async function generateFromTopic(
  userId: string,
  topic: string,
  grade?: string,
  onProgress?: ProgressCallback,
  onSceneReady?: OnSceneReadyCallback,
): Promise<GenerationResult> {
  try {
    // Load learner profile for adaptation
    const profile = await LearnerProfile.findOne({ userId });

    const input: GenerationInput = {
      topic,
      grade,
      learnerLevel: profile?.overallLevel || 'beginner',
      language: 'en-US',
      isMath: detectMath({ topic }),
    };

    return await runPipeline(input, onProgress, userId, onSceneReady);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown pipeline error';
    console.error('[pipeline] Topic generation failed:', message);
    return { success: false, error: message };
  }
}

/**
 * Core pipeline: input → outlines → scenes.
 */
async function runPipeline(
  input: GenerationInput,
  onProgress?: ProgressCallback,
  userId?: string,
  onSceneReady?: OnSceneReadyCallback,
): Promise<GenerationResult> {
  // Use per-user model routing when a userId is available
  const callAI = userId
    ? await createAICallFnForUser(userId)
    : createAICallFn();

  // ==================== Stage 0: Generate AI Agent Profiles ====================
  onProgress?.({
    stage: 'outlines',
    overallProgress: 7,
    message: 'Preparing your classroom team...',
    scenesCompleted: 0,
    totalScenes: 0,
  });

  // Use the curriculum text (or topic) as the requirement input for role gen.
  // Falls back to default agents if the LLM fails.
  const agentRequirement =
    input.curriculumText
      ? `${input.subjectName ?? ''} — ${input.grade ?? ''}\n\n${input.curriculumText.slice(0, 1200)}`
      : `${input.subjectName ?? ''} ${input.topic ?? ''}`.trim() || 'General subject';

  const rawAgentConfigs = await generateAgentProfiles(
    agentRequirement,
    input.language ?? 'en-US',
    callAI,
  );

  const agentConfigs = clampAgents(rawAgentConfigs);
  const agents = agentConfigs.map(({ id, name, role, persona }) => ({
    id,
    name,
    role,
    persona,
  }));

  onProgress?.({
    stage: 'outlines',
    overallProgress: 14,
    message: 'Classroom roles ready ✓',
    scenesCompleted: 0,
    totalScenes: 0,
    agentConfigs,
  });

  // ==================== Stage 1: Generate Outlines ====================
  onProgress?.({
    stage: 'outlines',
    overallProgress: 18,
    message: 'Generating lesson outline...',
    scenesCompleted: 0,
    totalScenes: 0,
  });

  console.log('[pipeline] Stage 1: Generating outlines...');
  const outlines = await generateSceneOutlines(input, callAI, agents);

  if (!outlines.length) {
    return { success: false, error: 'Failed to generate any scene outlines' };
  }

  const totalScenes = outlines.length;
  console.log(`[pipeline] Stage 1 complete: ${totalScenes} outlines`);

  onProgress?.({
    stage: 'content',
    overallProgress: 28,
    message: `Outline ready — generating opening scenes...`,
    scenesCompleted: 0,
    totalScenes,
    agentConfigs,
  });

  // ==================== Stage 2: Generate Full Scenes ====================
  console.log('[pipeline] Stage 2: Generating full scenes...');

  // Derive title + description early (needed by onSceneReady on first scene)
  const earlyTitle =
    input.subjectName
      ? `${input.subjectName} — ${input.grade || 'Adaptive'}`
      : `Custom Classroom: ${input.topic?.substring(0, 60) || 'Untitled'}`;

  const scenes: Scene[] = await generateFullScenes(
    outlines,
    input,
    callAI,
    (completed, total) => {
      const progress = 35 + Math.round((completed / total) * 60);
      onProgress?.({
        stage: completed < total ? 'content' : 'actions',
        overallProgress: progress,
        message: completed < total
          ? `Generated ${completed} of ${total} scenes...`
          : 'Finalizing your classroom...',
        scenesCompleted: completed,
        totalScenes: total,
        agentConfigs,
      });
    },
    agents,
    onSceneReady
      ? (scene, completedIdx, total) => onSceneReady(scene, completedIdx, total, earlyTitle, agentConfigs)
      : undefined,
    (phase, sceneIndex, total, title) => {
      const base = 30 + Math.floor(((sceneIndex - 1) / Math.max(total, 1)) * 58);
      const phaseOffset =
        phase === 'starting'
          ? 0
          : phase === 'content-ready'
            ? 6
            : phase === 'actions-ready'
              ? 11
              : 14;

      const stage = phase === 'actions-ready' || phase === 'complete' ? 'actions' : 'content';
      const message =
        phase === 'starting'
          ? `Generating scene ${sceneIndex} of ${total}: ${title}`
          : phase === 'content-ready'
            ? `Scene ${sceneIndex} content ready: ${title}`
            : phase === 'actions-ready'
              ? `Adding teaching actions for scene ${sceneIndex}: ${title}`
              : `Scene ${sceneIndex} ready: ${title}`;

      onProgress?.({
        stage,
        overallProgress: Math.min(base + phaseOffset, 92),
        message,
        scenesCompleted: Math.max(0, sceneIndex - (phase === 'complete' ? 0 : 1)),
        totalScenes: total,
        agentConfigs,
      });
    },
  );

  console.log(`[pipeline] Stage 2 complete: ${scenes.length} scenes generated`);

  const description =
    input.curriculumTopics?.length
      ? `Covers: ${input.curriculumTopics.slice(0, 5).join(', ')}`
      : input.topic?.substring(0, 200) || '';

  onProgress?.({
    stage: 'complete',
    overallProgress: 100,
    message: 'Classroom ready!',
    scenesCompleted: totalScenes,
    totalScenes,
    agentConfigs,
  });

  return {
    success: true,
    scenes,
    title: earlyTitle,
    description,
    agentConfigs,
  };
}

/**
 * Run the full generation pipeline using a pre-parsed PDF curriculum.
 * Called by the Phase 3 enter-classroom route after fetching the PDF
 * from MongoDB Atlas and parsing it with parsePdfBuffer().
 *
 * Phase 3 entry point:
 *   PDF buffer → parsePdfBuffer() → generateFromPdfCurriculum() → GenerationResult
 */
export async function generateFromPdfCurriculum(
  userId: string,
  curriculum: LoadedCurriculum,
  onProgress?: ProgressCallback,
  onSceneReady?: OnSceneReadyCallback,
): Promise<GenerationResult> {
  try {
    onProgress?.({
      stage: 'outlines',
      overallProgress: 5,
      message: 'Loading learner profile...',
      scenesCompleted: 0,
      totalScenes: 0,
    });

    // Load learner profile for adaptive difficulty
    const profile = await LearnerProfile.findOne({ userId });

    const input: GenerationInput = {
      subjectId: curriculum.courseId,
      subjectName: curriculum.subjectName,
      grade: curriculum.grade,
      // Use parsed PDF text as the curriculum source of truth
      curriculumText: curriculum.pdfContent.text,
      // Images are available in pdfContent but not yet used by the outline/scene generators
      learnerLevel: profile?.overallLevel ?? 'beginner',
      weakTopics: [],
      strongTopics: [],
      language: 'en-US',
      isMath: detectMath({ subjectName: curriculum.subjectName }),
    };

    return await runPipeline(input, onProgress, userId, onSceneReady);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown pipeline error';
    console.error('[pipeline] PDF curriculum generation failed:', message);
    return { success: false, error: message };
  }
}
