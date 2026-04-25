/**
 * Scene Generator — Stage 2
 *
 * For each SceneOutline, generates:
 *   2A: Content (LessonContent or QuizContent)
 *   2B: Actions (speech, highlight, reveal, discussion)
 *
 * - Generates rich text sections instead of PPT elements
 * - Simplified action set (speech, highlight, reveal, discussion)
 * - No image/video generation for Phase 2 MVP
 */

import {
  type SceneOutline,
  type Scene,
  type LessonContent,
  type QuizContent,
  type ContentSection,
  type Action,
  type AICallFn,
  type GenerationInput,
  type AgentInfo,
  type MediaGenerationRequest,
} from './types';
import { formatAgentsForPrompt } from './agents';
import {
  buildCourseContext,
  extractLastSpeech,
  type SceneGenerationContext,
} from './prompt-formatters';
import {
  LESSON_CONTENT_SYSTEM,
  buildLessonContentUserPrompt,
  LESSON_ACTIONS_SYSTEM,
  buildLessonActionsUserPrompt,
  MATH_LESSON_CONTENT_SYSTEM,
  MATH_LESSON_ACTIONS_SYSTEM,
  buildMathLessonActionsUserPrompt,
  QUIZ_CONTENT_SYSTEM,
  buildQuizContentUserPrompt,
  QUIZ_ACTIONS_SYSTEM,
  buildQuizActionsUserPrompt,
} from './prompts';
import { parseJsonResponse } from './json-repair';

/**
 * Generate all scenes from outlines.
 * Processes sequentially to manage AI API rate limits.
 *
 * @param onSceneReady  Called after each scene is generated.
 *                      Allows the caller to persist the scene immediately
 *                      (enables early-ready / background generation UX).
 */
export async function generateFullScenes(
  outlines: SceneOutline[],
  input: GenerationInput,
  callAI: AICallFn,
  onProgress?: (completed: number, total: number) => void,
  agents?: AgentInfo[],
  onSceneReady?: (scene: Scene, completedIndex: number, total: number) => Promise<void>,
  onScenePhase?: (
    phase: 'starting' | 'content-ready' | 'actions-ready' | 'complete',
    sceneIndex: number,
    total: number,
    title: string,
  ) => void,
): Promise<Scene[]> {
  const scenes: Scene[] = [];
  const totalScenes = outlines.length;
  const allTitles = outlines.map((o) => o.title);
  let previousSpeech: string | undefined;

  for (let i = 0; i < outlines.length; i++) {
    const outline = outlines[i];
    console.log(`[scene-generator] Generating scene ${i + 1}/${totalScenes}: "${outline.title}" (${outline.type})`);
    onScenePhase?.('starting', i + 1, totalScenes, outline.title);

    const courseCtx: SceneGenerationContext = { sceneIndex: i, totalScenes, allTitles, previousSpeech };

    try {
      const scene = await generateSingleScene(
        outline,
        input,
        callAI,
        i,
        totalScenes,
        agents,
        courseCtx,
        (phase) => onScenePhase?.(phase, i + 1, totalScenes, outline.title),
      );
      // Capture last speech for the next scene's transition reference
      previousSpeech = extractLastSpeech(scene.actions as Array<{ type: string; content?: string; agentId?: string }>);
      scenes.push(scene);
      // Notify caller immediately — allows early-ready persistence
      await onSceneReady?.(scene, i + 1, totalScenes);
      onScenePhase?.('complete', i + 1, totalScenes, outline.title);
    } catch (err) {
      console.error(`[scene-generator] Failed to generate scene "${outline.title}":`, err);
      previousSpeech = undefined;
      const fallback = createFallbackScene(outline);
      scenes.push(fallback);
      await onSceneReady?.(fallback, i + 1, totalScenes);
      onScenePhase?.('complete', i + 1, totalScenes, outline.title);
    }

    onProgress?.(i + 1, totalScenes);
  }

  return scenes;
}

/**
 * Generate a single scene (content + actions) from one outline.
 */
async function generateSingleScene(
  outline: SceneOutline,
  input: GenerationInput,
  callAI: AICallFn,
  sceneIndex: number,
  totalScenes: number,
  agents?: AgentInfo[],
  courseCtx?: SceneGenerationContext,
  onPhase?: (phase: 'content-ready' | 'actions-ready') => void,
): Promise<Scene> {
  const language = input.language === 'zh-CN' ? 'Chinese (Simplified)' : 'English';

  if (outline.type === 'quiz') {
    return generateQuizScene(outline, input, callAI, sceneIndex, totalScenes, language, agents, courseCtx, onPhase);
  }

  return generateLessonScene(outline, input, callAI, sceneIndex, totalScenes, language, agents, courseCtx, onPhase);
}

// ==================== Lesson Scene Generation ====================

async function generateLessonScene(
  outline: SceneOutline,
  input: GenerationInput,
  callAI: AICallFn,
  sceneIndex: number,
  totalScenes: number,
  language: string,
  agents?: AgentInfo[],
  courseCtx?: SceneGenerationContext,
  onPhase?: (phase: 'content-ready' | 'actions-ready') => void,
): Promise<Scene> {
  // Stage 2A: Generate lesson content
  const content = await generateLessonContent(outline, input, callAI, language);
  onPhase?.('content-ready');

  // Stage 2B: Generate lesson actions
  const actions = await generateLessonActions(
    outline, content, callAI, sceneIndex, totalScenes, language, agents, courseCtx,
    Boolean(input.isMath),
  );
  onPhase?.('actions-ready');

  return {
    id: outline.id,
    type: 'lesson',
    title: outline.title,
    order: outline.order,
    content,
    actions,
  };
}

async function generateLessonContent(
  outline: SceneOutline,
  input: GenerationInput,
  callAI: AICallFn,
  language: string,
): Promise<LessonContent> {
  const systemPrompt = input.isMath ? MATH_LESSON_CONTENT_SYSTEM : LESSON_CONTENT_SYSTEM;
  const userPrompt = buildLessonContentUserPrompt({
    title: outline.title,
    description: outline.description,
    keyPoints: outline.keyPoints,
    teachingObjective: outline.teachingObjective,
    learnerLevel: input.learnerLevel,
    language,
    mediaGenerations: outline.mediaGenerations,
  });

  const rawResponse = await callAI(systemPrompt, userPrompt);
  const parsed = parseJsonResponse<LessonContent>(rawResponse);

  if (!parsed || !parsed.sections || !Array.isArray(parsed.sections)) {
    console.warn('[scene-generator] Lesson content parse failed, using fallback');
    return createFallbackLessonContent(outline);
  }

  // Clean and validate sections
  const sections = parsed.sections.map((section, idx) =>
    validateSection(section, idx, outline),
  );

  const hasVisualSection = sections.some((section) => section.type === 'image_placeholder');
  const firstGeneratedVisual = outline.mediaGenerations?.find((mg) => mg.type === 'image');

  if (!hasVisualSection && firstGeneratedVisual) {
    sections.splice(Math.min(2, sections.length), 0, validateSection({
      id: 'sec_visual',
      type: 'image_placeholder',
      content: outline.description || outline.keyPoints[0] || outline.title,
      caption: outline.keyPoints[0] || outline.description || outline.title,
      imagePrompt: firstGeneratedVisual.prompt,
      mediaElementId: firstGeneratedVisual.elementId,
      mediaSlot: firstGeneratedVisual.slot,
    } as ContentSection, sections.length, outline));
  }

  return { type: 'lesson', sections: bindMediaPlaceholdersToSections(sections, outline) };
}

async function generateLessonActions(
  outline: SceneOutline,
  content: LessonContent,
  callAI: AICallFn,
  sceneIndex: number,
  totalScenes: number,
  language: string,
  agents?: AgentInfo[],
  courseCtx?: SceneGenerationContext,
  isMath = false,
): Promise<Action[]> {
  const agentsContext = agents ? formatAgentsForPrompt(agents) : undefined;
  const courseContext = buildCourseContext(courseCtx);

  // Choose math vs standard prompt
  const systemPrompt = isMath ? MATH_LESSON_ACTIONS_SYSTEM : LESSON_ACTIONS_SYSTEM;
  const userPrompt = isMath
    ? buildMathLessonActionsUserPrompt({
        title: outline.title,
        description: outline.description,
        keyPoints: outline.keyPoints,
        sections: content.sections.map((s) => ({
          id: s.id,
          type: s.type,
          content: s.content,
          term: s.term,
          latex: s.latex,
          problem: (s as ContentSection & { problem?: string }).problem,
        })),
        sceneIndex,
        totalScenes,
        language,
        agentsContext,
        courseContext,
      })
    : buildLessonActionsUserPrompt({
        title: outline.title,
        description: outline.description,
        keyPoints: outline.keyPoints,
        sections: content.sections.map((s) => ({
          id: s.id,
          type: s.type,
          content: s.content,
          term: s.term,
        })),
        sceneIndex,
        totalScenes,
        language,
        agentsContext,
        courseContext,
      });

  const rawResponse = await callAI(systemPrompt, userPrompt);
  const parsed = parseJsonResponse<Array<RawAction>>(rawResponse);

  if (!parsed || !Array.isArray(parsed)) {
    console.warn('[scene-generator] Lesson actions parse failed, using fallback');
    return createFallbackLessonActions(outline, content, agents);
  }

  return processActions(parsed, content.sections, agents);
}

// ==================== Quiz Scene Generation ====================

async function generateQuizScene(
  outline: SceneOutline,
  input: GenerationInput,
  callAI: AICallFn,
  sceneIndex: number,
  totalScenes: number,
  language: string,
  agents?: AgentInfo[],
  courseCtx?: SceneGenerationContext,
  onPhase?: (phase: 'content-ready' | 'actions-ready') => void,
): Promise<Scene> {
  // Stage 2A: Generate quiz content
  const content = await generateQuizContent(outline, input, callAI, language);
  onPhase?.('content-ready');

  // Stage 2B: Generate quiz actions
  const actions = await generateQuizActions(
    outline, content, callAI, sceneIndex, totalScenes, language, agents, courseCtx
  );
  onPhase?.('actions-ready');

  return {
    id: outline.id,
    type: 'quiz',
    title: outline.title,
    order: outline.order,
    content,
    actions,
  };
}

async function generateQuizContent(
  outline: SceneOutline,
  input: GenerationInput,
  callAI: AICallFn,
  language: string,
): Promise<QuizContent> {
  const config = outline.quizConfig || {
    questionCount: 3,
    difficulty: 'medium',
    questionTypes: ['single'] as ('single' | 'multiple' | 'short_answer')[],
  };

  const userPrompt = buildQuizContentUserPrompt({
    title: outline.title,
    description: outline.description,
    keyPoints: outline.keyPoints,
    questionCount: config.questionCount,
    difficulty: config.difficulty,
    questionTypes: config.questionTypes,
    learnerLevel: input.learnerLevel,
    language,
  });

  const rawResponse = await callAI(QUIZ_CONTENT_SYSTEM, userPrompt);
  const parsed = parseJsonResponse<QuizContent>(rawResponse);

  if (!parsed || !parsed.questions || !Array.isArray(parsed.questions)) {
    console.warn('[scene-generator] Quiz content parse failed, using fallback');
    return createFallbackQuizContent(outline);
  }

  // Validate questions
  const questions = parsed.questions.map((q, idx) => ({
    id: q.id || `q${idx + 1}`,
    type: (['single', 'multiple', 'short_answer'].includes(q.type) ? q.type : 'single') as 'single' | 'multiple' | 'short_answer',
    question: q.question || `Question ${idx + 1}`,
    options: q.options,
    answer: q.answer,
    analysis: q.analysis || '',
    commentPrompt: q.commentPrompt,
    points: q.points || 10,
  }));

  return { type: 'quiz', questions };
}

async function generateQuizActions(
  outline: SceneOutline,
  content: QuizContent,
  callAI: AICallFn,
  sceneIndex: number,
  totalScenes: number,
  language: string,
  agents?: AgentInfo[],
  courseCtx?: SceneGenerationContext,
): Promise<Action[]> {
  const agentsContext = agents ? formatAgentsForPrompt(agents) : undefined;
  const courseContext = buildCourseContext(courseCtx);
  const userPrompt = buildQuizActionsUserPrompt({
    title: outline.title,
    description: outline.description,
    keyPoints: outline.keyPoints,
    questions: content.questions.map((q) => ({
      id: q.id,
      type: q.type,
      question: q.question,
    })),
    sceneIndex,
    totalScenes,
    language,
    agentsContext,
    courseContext,
  });

  const rawResponse = await callAI(QUIZ_ACTIONS_SYSTEM, userPrompt);
  const parsed = parseJsonResponse<Array<RawAction>>(rawResponse);

  if (!parsed || !Array.isArray(parsed)) {
    console.warn('[scene-generator] Quiz actions parse failed, using fallback');
    return createFallbackQuizActions(outline, agents);
  }

  return processActions(parsed, [], agents);
}

// ==================== Action Processing ====================

/**
 * Raw action format from the LLM.
 * The prompts instruct the LLM to output:
 *   { "type": "text", "content": "speech text" }
 *   { "type": "action", "name": "highlight", "params": { ... } }
 */
interface RawAction {
  type: 'text' | 'action';
  content?: string;
  agentId?: string;
  name?: string;
  params?: Record<string, string>;
}

/**
 * Convert raw LLM actions into typed Action objects.
 */
function processActions(
  rawActions: RawAction[],
  sections: ContentSection[],
  agents?: AgentInfo[],
): Action[] {
  const actions: Action[] = [];
  const sectionIds = new Set(sections.map((s) => s.id));
  const defaultAgentId = agents?.[0]?.id ?? 'agent-1';
  let actionCount = 0;

  for (const raw of rawActions) {
    actionCount++;
    const id = `act_${actionCount}`;

    if (raw.type === 'text' && raw.content) {
      // Speech action — resolve agentId from AI output, fallback to default (teacher)
      const agentId = raw.agentId ?? defaultAgentId;
      actions.push({
        id,
        type: 'speech',
        text: stripInlineMarkdown(raw.content),
        agentId,
      });
    } else if (raw.type === 'action' && raw.name) {
      switch (raw.name) {
        case 'highlight':
          if (raw.params?.sectionId) {
            // Only highlight sections that actually exist
            if (sectionIds.size === 0 || sectionIds.has(raw.params.sectionId)) {
              actions.push({
                id,
                type: 'highlight',
                sectionId: raw.params.sectionId,
              });
            }
          }
          break;

        case 'reveal':
          if (raw.params?.sectionId) {
            if (sectionIds.size === 0 || sectionIds.has(raw.params.sectionId)) {
              actions.push({
                id,
                type: 'reveal',
                sectionId: raw.params.sectionId,
              });
            }
          }
          break;

        case 'discussion':
          if (raw.params?.topic) {
            actions.push({
              id,
              type: 'discussion',
              topic: raw.params.topic,
              prompt: raw.params.prompt,
            });
          }
          break;

        // ── Whiteboard scene actions (math solve-along) ──────────────────────────
        case 'wb_open':
        case 'wb_close':
        case 'wb_clear':
          actions.push({ id, type: raw.name } as Action);
          break;

        case 'wb_delete':
        case 'wb_draw_text':
        case 'wb_draw_latex':
        case 'wb_draw_shape':
        case 'wb_draw_line':
        case 'wb_draw_table': {
          // Spread params flat onto the action (matches frontend WbDraw*Action shape)
          const wbParams = raw.params ?? {};
          actions.push({
            id,
            type: raw.name as Action['type'],
            ...wbParams,
          } as Action);
          break;
        }

        default:
          console.warn(`[scene-generator] Unknown action name: ${raw.name}`);
      }
    }
  }

  return actions;
}

// ==================== Section Validation ====================

function validateSection(section: ContentSection, idx: number, outline: SceneOutline): ContentSection {
  const validTypes = ['heading', 'text', 'callout', 'formula', 'list', 'definition', 'code', 'example', 'image_placeholder', 'flashcard', 'math_practice'];
  const cleanContent = sanitizeRichText(section.content);
  const cleanItems = section.items?.map(sanitizeRichText);
  const cleanTerm = sanitizeRichText(section.term);
  const cleanDefinition = sanitizeRichText(section.definition);
  const cleanCaption = sanitizeRichText((section as ContentSection & { caption?: string }).caption);
  const cleanPrompt = sanitizeRichText((section as ContentSection & { imagePrompt?: string }).imagePrompt);
  const existingImageUrl = (section as ContentSection & { imageUrl?: string }).imageUrl;
  const mediaElementId = sanitizeRichText((section as ContentSection & { mediaElementId?: string }).mediaElementId);
  const mediaSlot = (section as ContentSection & { mediaSlot?: ContentSection['mediaSlot'] }).mediaSlot;
  const imageUrl = section.type === 'image_placeholder' ? existingImageUrl : undefined;
  const options = section.type === 'flashcard' ? section.options : undefined;
  const answer = section.type === 'flashcard' ? section.answer : undefined;
  const explanation = section.type === 'flashcard' ? sanitizeRichText(section.explanation) : undefined;
  // math_practice fields
  const problem = section.type === 'math_practice'
    ? sanitizeRichText((section as ContentSection & { problem?: string }).problem)
    : undefined;
  const hint = section.type === 'math_practice'
    ? sanitizeRichText((section as ContentSection & { hint?: string }).hint)
    : undefined;

  return {
    id: section.id || `sec_${idx + 1}`,
    type: validTypes.includes(section.type) ? section.type : 'text',
    content: cleanContent,
    items: cleanItems,
    term: cleanTerm,
    definition: cleanDefinition,
    latex: section.latex,
    variant: section.variant,
    language: section.language,
    level: section.level,
    imageUrl,
    caption: cleanCaption || cleanContent,
    imagePrompt: cleanPrompt || cleanContent,
    mediaElementId: mediaElementId || undefined,
    mediaStatus: section.type === 'image_placeholder' ? 'pending' : undefined,
    mediaSlot,
    options,
    answer,
    explanation,
    problem,
    hint,
  } as ContentSection;
}

function bindMediaPlaceholdersToSections(
  sections: ContentSection[],
  outline: SceneOutline,
): ContentSection[] {
  const mediaRequests = outline.mediaGenerations?.filter((item) => item.type === 'image') ?? [];
  if (!mediaRequests.length) return sections;

  const placeholderSections = sections.filter((section) => section.type === 'image_placeholder');
  const availableById = new Map(mediaRequests.map((item) => [item.elementId, item]));
  const unclaimed = mediaRequests.filter((item) => !placeholderSections.some((section) => section.mediaElementId === item.elementId));
  let nextUnclaimedIndex = 0;

  return sections.map((section) => {
    if (section.type !== 'image_placeholder') return section;

    const directMatch = (section.mediaElementId && availableById.get(section.mediaElementId)) || undefined;
    const request = directMatch || unclaimed[nextUnclaimedIndex++];
    if (!request) return section;

    return {
      ...section,
      imagePrompt: request.prompt,
      mediaElementId: request.elementId,
      mediaStatus: 'pending',
      mediaSlot: request.slot,
      imageUrl: createMediaPlaceholderUrl(request.elementId),
    };
  });
}

function sanitizeRichText(value?: string): string | undefined {
  if (!value) return value;
  return value
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function stripInlineMarkdown(value?: string): string {
  if (!value) return '';
  return value
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function escapeSvgText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function wrapSvgText(value: string, maxLen = 34): string[] {
  const words = stripInlineMarkdown(value).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxLen) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 5);
}

function createGeneratedImageDataUrl(outline: SceneOutline, visualHint?: string): string {
  const title = escapeSvgText(stripInlineMarkdown(outline.title));
  const hint = stripInlineMarkdown(visualHint || outline.description || outline.keyPoints[0] || outline.title);
  const hintLines = wrapSvgText(hint, 32);
  const pointLines = outline.keyPoints.slice(0, 3).map((point) => escapeSvgText(stripInlineMarkdown(point)));

  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720" role="img" aria-label="${title}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#141b3a" />
        <stop offset="100%" stop-color="#1f103a" />
      </linearGradient>
      <linearGradient id="card" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0.12" />
        <stop offset="100%" stop-color="#ffffff" stop-opacity="0.05" />
      </linearGradient>
    </defs>
    <rect width="1280" height="720" fill="url(#bg)" rx="36" />
    <circle cx="1070" cy="130" r="180" fill="#7c3aed" fill-opacity="0.18" />
    <circle cx="170" cy="600" r="220" fill="#2563eb" fill-opacity="0.16" />
    <rect x="86" y="80" width="1108" height="560" rx="34" fill="url(#card)" stroke="#8b5cf6" stroke-opacity="0.25" />
    <text x="120" y="156" fill="#f8fafc" font-size="42" font-family="Inter, Arial, sans-serif" font-weight="700">${title}</text>
    ${hintLines.map((line, i) => `<text x="120" y="${220 + i * 38}" fill="#dbeafe" font-size="28" font-family="Inter, Arial, sans-serif">${escapeSvgText(line)}</text>`).join('')}
    ${pointLines.map((line, i) => `
      <g transform="translate(120 ${360 + i * 92})">
        <circle cx="12" cy="12" r="12" fill="#a78bfa" />
        <text x="40" y="20" fill="#f8fafc" font-size="24" font-family="Inter, Arial, sans-serif">${line}</text>
      </g>
    `).join('')}
    <g transform="translate(835 220)">
      <rect x="0" y="0" width="250" height="250" rx="28" fill="#ffffff" fill-opacity="0.08" stroke="#ffffff" stroke-opacity="0.14" />
      <circle cx="125" cy="88" r="42" fill="#60a5fa" fill-opacity="0.7" />
      <path d="M72 164 C108 122, 143 122, 178 164" fill="none" stroke="#c4b5fd" stroke-width="16" stroke-linecap="round" />
      <path d="M72 194 C108 152, 143 152, 178 194" fill="none" stroke="#ffffff" stroke-opacity="0.7" stroke-width="10" stroke-linecap="round" />
    </g>
  </svg>`;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg.replace(/\n\s+/g, ' ').trim())}`;
}

function createMediaPlaceholderUrl(elementId: string): string {
  return `media://${elementId}`;
}

// ==================== Fallback Generators ====================

function createFallbackScene(outline: SceneOutline): Scene {
  if (outline.type === 'quiz') {
    return {
      id: outline.id,
      type: 'quiz',
      title: outline.title,
      order: outline.order,
      content: createFallbackQuizContent(outline),
      actions: createFallbackQuizActions(outline),
    };
  }

  return {
    id: outline.id,
    type: 'lesson',
    title: outline.title,
    order: outline.order,
    content: createFallbackLessonContent(outline),
    actions: createFallbackLessonActions(outline, createFallbackLessonContent(outline)),
  };
}

function createFallbackLessonContent(outline: SceneOutline): LessonContent {
  const fallbackVisual = outline.mediaGenerations?.find((item) => item.type === 'image');
  const sections: ContentSection[] = [
    { id: 'sec_1', type: 'heading', content: outline.title, level: 1 },
    { id: 'sec_2', type: 'text', content: outline.description },
    {
      id: 'sec_visual',
      type: 'image_placeholder',
      content: `Visual summary of ${outline.title}`,
      caption: `Visual summary of ${outline.title}`,
      imagePrompt: fallbackVisual?.prompt || outline.description,
      mediaElementId: fallbackVisual?.elementId || `gen_img_${outline.id}`,
      mediaStatus: 'pending',
      mediaSlot: fallbackVisual?.slot,
      imageUrl: createMediaPlaceholderUrl(fallbackVisual?.elementId || `gen_img_${outline.id}`),
    },
    ...outline.keyPoints.map((point, i) => ({
      id: `sec_${i + 4}`,
      type: 'text' as const,
      content: point,
    })),
  ];

  return { type: 'lesson', sections: bindMediaPlaceholdersToSections(sections, outline) };
}

function createFallbackLessonActions(
  outline: SceneOutline,
  content: LessonContent,
  agents?: AgentInfo[],
): Action[] {
  const agentId = agents?.[0]?.id ?? 'agent-1';
  const actions: Action[] = [
    {
      id: 'act_1',
      type: 'speech',
      text: `Let's learn about ${outline.title}. ${outline.description}`,
      agentId,
    },
  ];

  // Add highlights for each section
  content.sections.forEach((section, idx) => {
    actions.push({
      id: `act_${idx + 2}`,
      type: 'highlight',
      sectionId: section.id,
    });
  });

  return actions;
}

function createFallbackQuizContent(outline: SceneOutline): QuizContent {
  return {
    type: 'quiz',
    questions: outline.keyPoints.map((point, i) => ({
      id: `q${i + 1}`,
      type: 'single' as const,
      question: `Which statement about "${point}" is correct?`,
      options: [
        { label: 'Option A', value: 'A' },
        { label: 'Option B', value: 'B' },
        { label: 'Option C', value: 'C' },
        { label: 'Option D', value: 'D' },
      ],
      answer: ['A'],
      analysis: 'This is a fallback question. Please regenerate for better content.',
      points: 10,
    })),
  };
}

function createFallbackQuizActions(outline: SceneOutline, agents?: AgentInfo[]): Action[] {
  const agentId = agents?.[0]?.id ?? 'agent-1';
  return [
    {
      id: 'act_1',
      type: 'speech',
      text: `Time for a quick quiz on ${outline.title}! Let's see what you've learned.`,
      agentId,
    },
  ];
}
