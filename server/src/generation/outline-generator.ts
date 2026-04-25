/**
 * Outline Generator — Stage 1
 *
 * Takes GenerationInput → SceneOutline[]
 *
 * - Uses curriculum text from DB
 * - Incorporates learner profile for adaptive outline generation
 * - Generates lesson + quiz scene outlines
 */

import {
  type SceneOutline,
  type GenerationInput,
  type AICallFn,
  type AgentInfo,
  type MediaGenerationRequest,
} from './types';
import {
  OUTLINE_SYSTEM,
  buildOutlineUserPrompt,
} from './prompts';
import { parseJsonResponse } from './json-repair';
import { formatTeacherPersonaForPrompt } from './agents';

/**
 * Generate scene outlines from input requirements.
 * This is Stage 1 of the two-stage pipeline.
 */
export async function generateSceneOutlines(
  input: GenerationInput,
  callAI: AICallFn,
  agents?: AgentInfo[],
): Promise<SceneOutline[]> {
  // Build the topic string from available input
  const topic = input.topic || input.subjectName || 'General Topic';
  const language = input.language === 'zh-CN' ? 'Chinese (Simplified)' : 'English';
  const teacherContext = agents ? formatTeacherPersonaForPrompt(agents) : undefined;

  const userPrompt = buildOutlineUserPrompt({
    topic,
    language,
    grade: input.grade,
    learnerLevel: input.learnerLevel,
    weakTopics: input.weakTopics,
    strongTopics: input.strongTopics,
    strandScores: input.strandScores,
    curriculumText: input.curriculumText,
    curriculumTopics: input.curriculumTopics,
    subjectName: input.subjectName,
    teacherContext,
  });

  console.log('[outline-generator] Generating outlines for topic:', topic);

  const rawResponse = await callAI(OUTLINE_SYSTEM, userPrompt);
  const outlines = parseJsonResponse<SceneOutline[]>(rawResponse);

  if (!outlines || !Array.isArray(outlines)) {
    throw new Error('Failed to parse scene outlines from AI response');
  }

  // Validate and clean up outlines
  const validated = outlines.map((outline, idx) => {
    const normalizedMedia = normalizeMediaGenerations(
      Array.isArray(outline.mediaGenerations) ? outline.mediaGenerations : [],
      idx,
    );

    const clean: SceneOutline = {
      id: outline.id || `scene_${idx + 1}`,
      type: outline.type === 'quiz' ? 'quiz' : 'lesson',
      title: outline.title || `Scene ${idx + 1}`,
      description: outline.description || '',
      keyPoints: Array.isArray(outline.keyPoints) ? outline.keyPoints : [],
      teachingObjective: outline.teachingObjective,
      estimatedDuration: outline.estimatedDuration || 180,
      order: idx + 1, // Force sequential ordering
      mediaGenerations: normalizedMedia.length ? normalizedMedia : undefined,
    };

    // Ensure quiz scenes have a config
    if (clean.type === 'quiz') {
      clean.quizConfig = outline.quizConfig || {
        questionCount: 3,
        difficulty: mapDifficultyFromLevel(input.learnerLevel),
        questionTypes: ['single'],
      };
    }

    return clean;
  });

  console.log(`[outline-generator] Generated ${validated.length} scene outlines`);
  return validated;
}

function normalizeMediaGenerations(
  mediaGenerations: MediaGenerationRequest[],
  outlineIndex: number,
): MediaGenerationRequest[] {
  const seen = new Set<string>();

  return mediaGenerations
    .filter((mg) => mg && mg.type === 'image' && mg.prompt)
    .map((mg, mediaIndex) => {
      const fallbackId = `gen_img_scene_${outlineIndex + 1}_${mediaIndex + 1}`;
      const rawElementId = (mg.elementId || fallbackId).trim() || fallbackId;
      const normalizedElementId = rawElementId
        .replace(/[^a-zA-Z0-9_-]+/g, '_')
        .replace(/^_+|_+$/g, '') || fallbackId;
      const scopedElementId = `${normalizedElementId}__scene_${outlineIndex + 1}_${mediaIndex + 1}`;
      const uniqueElementId = seen.has(scopedElementId)
        ? `${scopedElementId}_${mediaIndex + 1}`
        : scopedElementId;
      seen.add(uniqueElementId);

      return {
        type: 'image' as const,
        prompt: mg.prompt.trim(),
        elementId: uniqueElementId,
        aspectRatio: mg.aspectRatio || '16:9',
        style: mg.style?.trim() || undefined,
        slot: mg.slot || inferMediaSlot(mg.prompt, mediaIndex),
        sourceSectionId: mg.sourceSectionId || `sec_visual_${mediaIndex + 1}`,
        renderPolicy: 'server' as const,
      };
    });
}

function inferMediaSlot(prompt: string, mediaIndex: number): MediaGenerationRequest['slot'] {
  const lowerPrompt = prompt.toLowerCase();

  if (/(compare|versus|vs\.|difference|similarit)/.test(lowerPrompt)) return 'comparison';
  if (/(process|flow|cycle|step|sequence|pipeline)/.test(lowerPrompt)) return 'process';
  if (/(diagram|label|cross-section|schema|schematic|structure)/.test(lowerPrompt)) return 'diagram';
  if (mediaIndex === 0) return 'hero';
  return 'supporting';
}

/**
 * Map learner level to quiz difficulty.
 */
function mapDifficultyFromLevel(
  level?: string,
): 'easy' | 'medium' | 'hard' {
  switch (level) {
    case 'beginner':
      return 'easy';
    case 'advanced':
      return 'hard';
    default:
      return 'medium';
  }
}
