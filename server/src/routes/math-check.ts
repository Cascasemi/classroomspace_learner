/**
 * Math Check Route — AI-powered math answer grading with step-by-step solution reveal
 *
 * POST /api/math-check
 *
 * Body: { problem, answer, sceneTitle? }
 * Returns: { correct, feedback, steps? }
 *
 * When the answer is wrong the AI generates a full step-by-step solution as
 * { speech, wbActions }[] items that the frontend plays out on the whiteboard
 * like a live tutoring session — teacher speaks each step while drawing equations.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { protect } from '../middleware/auth.js';
import { createAICallFnForUser } from '../ai/llm.js';

export const mathCheckRouter = Router();
mathCheckRouter.use(protect);

// ── Request schema ─────────────────────────────────────────────────────────────
const bodySchema = z.object({
  /** LaTeX problem string (no outer $ delimiters) */
  problem: z.string().min(1).max(2000),
  /** Student's plain-text answer (may include simple expressions like "x = 3") */
  answer: z.string().max(500),
  /** Optional — used to give the AI context */
  sceneTitle: z.string().max(200).optional(),
});

// ── Prompt ────────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are an expert mathematics teacher grading a student's answer and, when incorrect, producing a clear step-by-step whiteboard solution.

WHITEBOARD LAYOUT
Canvas: 1000 × 562 px. Safe drawing area: x 20–980, y 20–540.
Stack elements top-to-bottom; each element's y = previous y + previous height + 20.

WHITEBOARD ACTIONS
Use wb_draw_text for labels and headings:
  { "name": "wb_draw_text", "params": { "content": "Step 1: Subtract 5 from both sides", "x": 20, "y": 20, "fontSize": 18, "bold": false, "color": "#94a3b8", "elementId": "lbl_1" } }

Use wb_draw_latex for equations (KaTeX):
  { "name": "wb_draw_latex", "params": { "latex": "2x + 5 - 5 = 11 - 5", "x": 20, "y": 60, "height": 70, "color": "#fbbf24", "elementId": "eq_1" } }

Use wb_draw_latex heights:
  - Simple expression (2x = 6): height 60
  - Fraction/quadratic: height 80
  - Integral/summation: height 90

Color palette:
  - Problem statement: "#fbbf24"  (amber)
  - Working steps:     "#86efac"  (green)
  - Final answer:      "#a78bfa"  (purple)
  - Step labels:       "#94a3b8"  (muted)

REQUIRED OUTPUT FORMAT (JSON only, no markdown):
{
  "correct": true | false,
  "feedback": "<1-2 sentence direct response to the student>",
  "steps": [                  // OMIT this array entirely if correct === true
    {
      "speech": "<What the teacher says for this step — 1-2 sentences>",
      "wbActions": [
        { "name": "wb_draw_text",  "params": { ... } },
        { "name": "wb_draw_latex", "params": { ... } }
      ]
    }
  ]
}

RULES:
1. steps[0] should open with wb_draw_text showing "Problem:" and then a wb_draw_latex showing the original problem statement.
2. Each subsequent step handles ONE logical operation (e.g., "subtract from both sides", "divide both sides", "factorise").
3. Keep 3–6 steps maximum. Complex problems may have up to 8.
4. All y coordinates must accumulate correctly — double-check that no element exceeds y=520.
5. Speech is conversational and encouraging — never condescending.
6. Every elementId must be globally unique across all steps.
7. Output ONLY the JSON object. No explanation, no code fences.`;

// ── Handler ───────────────────────────────────────────────────────────────────
mathCheckRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
      return;
    }

    const { problem, answer, sceneTitle } = parsed.data;
    const userId = (req as Request & { userId?: string }).userId!;

    // Empty answer → skip AI, just encourage the student
    if (!answer.trim()) {
      res.json({
        correct: false,
        feedback: 'Give it a try! Enter your answer and I\'ll check it for you.',
      });
      return;
    }

    const userPrompt = [
      sceneTitle ? `Scene context: ${sceneTitle}` : '',
      `Problem (LaTeX): ${problem}`,
      `Student answer: ${answer}`,
      '',
      'Evaluate whether the answer is correct (allow equivalent forms, e.g. "x=3" and "3" are both correct for x=3).',
      'If correct, set correct=true and write an encouraging 1-sentence feedback. Do NOT include steps.',
      'If wrong, set correct=false, write a brief 1-sentence corrective feedback, and produce clear step-by-step wbActions for the full solution.',
    ].filter(Boolean).join('\n');

    const callAI = await createAICallFnForUser(userId);
    const raw = await callAI(SYSTEM_PROMPT, userPrompt);

    // Strip markdown fences if present
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');

    let result: { correct: boolean; feedback: string; steps?: unknown[] };
    try {
      result = JSON.parse(cleaned);
    } catch {
      // Fallback: AI response mangled — give generic feedback
      console.warn('[math-check] Failed to parse AI response:', raw.slice(0, 200));
      result = {
        correct: false,
        feedback: 'I couldn\'t fully evaluate your answer. Let me walk you through the solution.',
      };
    }

    // Clamp: ensure 'correct' is boolean and 'feedback' is a string
    res.json({
      correct: Boolean(result.correct),
      feedback: String(result.feedback ?? ''),
      steps: result.correct ? undefined : (result.steps ?? undefined),
    });
  } catch (err) {
    console.error('[math-check]', err);
    res.status(500).json({ error: 'Math check failed' });
  }
});
