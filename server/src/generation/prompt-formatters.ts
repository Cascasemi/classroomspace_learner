/**
 * Prompt Formatters for Scene Generation
 *
 * Provides cross-scene coherence context for the NeuroSpace generation pipeline.
 */

/** Cross-scene context for maintaining speech coherence across scenes */
export interface SceneGenerationContext {
  /** Current scene index (0-based) */
  sceneIndex: number;
  /** Total number of scenes */
  totalScenes: number;
  /** All scene titles in order */
  allTitles: string[];
  /** Last speech text from the previous scene (for transition reference) */
  previousSpeech?: string;
}

/**
 * Build a course context string for injection into action prompts.
 * Tells the AI where in the course it is and how to transition naturally.
 *
 */
export function buildCourseContext(ctx?: SceneGenerationContext): string {
  if (!ctx) return '';

  const lines: string[] = [];

  // Course outline with current position marker
  lines.push('Course Outline:');
  ctx.allTitles.forEach((title, i) => {
    const marker = i === ctx.sceneIndex ? ' ← current' : '';
    lines.push(`  ${i + 1}. ${title}${marker}`);
  });

  lines.push('');
  lines.push(
    'IMPORTANT: All scenes belong to the SAME class session. Do NOT greet again after the first scene. ' +
      'When referencing content from earlier scenes, say "we just covered" or "as we mentioned earlier" — ' +
      'NEVER say "last class" or "previous session" because there is no previous session.',
  );
  lines.push('');

  if (ctx.sceneIndex === 0) {
    lines.push('Position: This is the FIRST scene. Teacher opens with a warm greeting and topic introduction.');
  } else if (ctx.sceneIndex === ctx.totalScenes - 1) {
    lines.push('Position: This is the LAST scene. Teacher wraps up with a summary and closing.');
    lines.push('Transition: Continue naturally from the previous scene. Do NOT greet again or re-introduce.');
  } else {
    lines.push(`Position: Scene ${ctx.sceneIndex + 1} of ${ctx.totalScenes} (middle of the course).`);
    lines.push('Transition: Continue naturally from the previous scene. Do NOT greet again.');
  }

  // Previous speech for transition reference
  if (ctx.previousSpeech) {
    lines.push('');
    lines.push('Previous scene ended with (for transition reference):');
    const snippet = ctx.previousSpeech.slice(-150);
    lines.push(`  "...${snippet}"`);
  }

  return lines.join('\n');
}

/**
 * Extract the final teacher speech text from an actions array.
 * Used to populate SceneGenerationContext.previousSpeech.
 */
export function extractLastSpeech(
  actions: Array<{ type: string; content?: string; agentId?: string }>,
): string | undefined {
  // Find the last text action from the teacher (agent-1)
  for (let i = actions.length - 1; i >= 0; i--) {
    const a = actions[i];
    if (a.type === 'text' && a.content) {
      return a.content;
    }
  }
  return undefined;
}
