/**
 * Quiz Grade Route — AI-powered short-answer grading
 *
 * POST /api/quiz-grade
 *
 * Body: { question, userAnswer, points, commentPrompt? }
 * Returns: { score: number, comment: string }
 *
 * Uses the authenticated user's preferred LLM model/tier.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { protect } from '../middleware/auth.js';
import { createAICallFnForUser } from '../ai/llm.js';
import { grantXP, XP_VALUES } from '../utils/xp.js';

const router = Router();
router.use(protect);

const bodySchema = z.object({
  question: z.string().min(1),
  userAnswer: z.string(),
  points: z.number().int().positive().default(1),
  commentPrompt: z.string().optional(),
});

const SYSTEM_PROMPT = `You are a fair and encouraging academic grader.
You will be given a quiz question, the student's answer, and the maximum points available.
Evaluate the answer for correctness and completeness, then return ONLY a valid JSON object (no markdown, no prose):
{
  "score": <integer from 0 to maxPoints>,
  "comment": "<brief one-sentence feedback in the same language as the student's answer>"
}
Be generous for partially correct answers. If maxPoints is 1, score is 0 or 1 only.`;

/**
 * POST /api/quiz-grade
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { question, userAnswer, points, commentPrompt } = bodySchema.parse(req.body);

    // Empty answer → instant 0
    if (!userAnswer.trim()) {
      res.json({ score: 0, comment: 'No answer provided.' });
      return;
    }

    const callLLM = await createAICallFnForUser(req.userId!, {
      temperature: 0.2,
      maxTokens: 256,
    });

    const userPrompt = [
      `Question: ${question}`,
      `Student Answer: ${userAnswer}`,
      `Max Points: ${points}`,
      commentPrompt ? `Grading Focus: ${commentPrompt}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const raw = await callLLM(SYSTEM_PROMPT, userPrompt);

    // Strip markdown fences if model returned them
    const cleaned = raw.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim();

    let parsed: { score: number; comment: string };
    try {
      parsed = JSON.parse(cleaned) as { score: number; comment: string };
    } catch {
      // Fallback: give half credit if parsing fails
      console.warn('[quiz-grade] JSON parse failed, giving half credit:', raw);
      parsed = { score: Math.round(points * 0.5), comment: 'Grading service returned an unexpected format.' };
    }

    const score = Math.max(0, Math.min(points, Math.round(parsed.score)));
    const comment = typeof parsed.comment === 'string' ? parsed.comment : '';

    // Grant XP for correct / partially-correct answers
    if (score > 0 && req.userId) {
      grantXP(req.userId, score * XP_VALUES.quiz_correct, 'quiz_correct').catch(
        (e) => console.error('[xp] quiz_correct error:', e),
      );
    }

    res.json({ score, comment });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    console.error('[quiz-grade] Error:', err);
    res.status(500).json({ error: 'Grading failed' });
  }
});

export { router as quizGradeRouter };
