/**
 * MathPracticePanel — OpenClass Learner
 *
 * Renders a math_practice section:
 *  1. Displays the LaTeX problem for the student
 *  2. Accepts a free-text (LaTeX or plain) answer
 *  3. Submits to /api/math-check via api.mathCheck()
 *  4. On correct → celebration banner
 *  5. On wrong   → feedback text + fires onResult so ClassroomPage can
 *                  animate the step-by-step solution on the whiteboard
 */

import { useState } from 'react';
import { CheckCircle2, XCircle, Lightbulb, SendHorizonal, Loader2, RotateCcw } from 'lucide-react';
import { KatexMath } from '@/components/ui/katex-math';
import { api } from '@/lib/api';
import type { ContentSection } from '@/lib/playback/types';
import type { WBAction } from '@/lib/whiteboard/types';

// ─── Public result type (consumed by ClassroomPage) ──────────────────────────

export interface MathCheckStep {
  speech: string;
  wbActions: WBAction[];
}

export interface MathCheckResult {
  correct: boolean;
  feedback: string;
  steps?: MathCheckStep[];
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  section: ContentSection;
  sceneTitle?: string;
  /** Called when the server returns a grade (correct or wrong). */
  onResult?: (result: MathCheckResult) => void;
}

type Status = 'idle' | 'submitting' | 'correct' | 'wrong';

export function MathPracticePanel({ section, sceneTitle, onResult }: Props) {
  const [answer, setAnswer] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [feedback, setFeedback] = useState('');
  const [showHint, setShowHint] = useState(false);

  const problem = section.problem ?? '';
  const hint = section.hint ?? '';

  const canSubmit = answer.trim().length > 0 && status === 'idle';

  async function handleSubmit() {
    if (!canSubmit) return;
    setStatus('submitting');
    try {
      const res = await api.mathCheck({ problem, answer: answer.trim(), sceneTitle });
      setFeedback(res.feedback);
      setStatus(res.correct ? 'correct' : 'wrong');
      onResult?.({
        correct: res.correct,
        feedback: res.feedback,
        // Normalise wbActions shape from server (name+params) — pass through as-is
        steps: res.steps as MathCheckStep[] | undefined,
      });
    } catch {
      setFeedback('Something went wrong — please try again.');
      setStatus('idle');
    }
  }

  function handleRetry() {
    setAnswer('');
    setFeedback('');
    setStatus('idle');
  }

  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-950/10 p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 text-amber-400 font-semibold text-sm uppercase tracking-wide">
        <span className="text-base">🧮</span>
        <span>Practice Problem</span>
      </div>

      {/* Problem display */}
      <div className="rounded-xl bg-background/60 border border-border/50 p-4">
        {problem ? (
          <KatexMath math={problem} displayMode className="text-foreground text-lg" />
        ) : (
          <p className="text-muted-foreground italic text-sm">No problem provided.</p>
        )}
      </div>

      {/* Hint toggle */}
      {hint && (
        <button
          type="button"
          onClick={() => setShowHint(v => !v)}
          className="flex items-center gap-1.5 text-xs text-amber-400/80 hover:text-amber-300 transition-colors"
        >
          <Lightbulb className="w-3.5 h-3.5" />
          {showHint ? 'Hide hint' : 'Show hint'}
        </button>
      )}
      {hint && showHint && (
        <div className="rounded-lg bg-amber-900/20 border border-amber-500/20 px-3 py-2 text-sm text-amber-200">
          <KatexMath math={hint} />
        </div>
      )}

      {/* Answer input area */}
      {(status === 'idle' || status === 'submitting') && (
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Your answer (LaTeX or plain text)</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={answer}
              onChange={e => setAnswer(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              placeholder="e.g.  x = 5  or  \frac{1}{2}"
              disabled={status === 'submitting'}
              className="flex-1 rounded-lg border border-border/60 bg-background/80 px-3 py-2 text-sm
                         placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2
                         focus:ring-amber-500/40 disabled:opacity-50"
            />
            <button
              type="button"
              onClick={handleSubmit}
              disabled={status !== 'idle' || answer.trim().length === 0}
              className="flex items-center gap-1.5 rounded-lg bg-amber-500 hover:bg-amber-400
                         disabled:opacity-40 disabled:cursor-not-allowed text-black font-medium
                         text-sm px-4 py-2 transition-colors"
            >
              {status === 'submitting' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <SendHorizonal className="w-4 h-4" />
                  Submit
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Result: Correct */}
      {status === 'correct' && (
        <div className="rounded-xl border border-green-500/30 bg-green-950/20 p-4 space-y-2">
          <div className="flex items-center gap-2 text-green-400 font-semibold">
            <CheckCircle2 className="w-5 h-5" />
            Correct!
          </div>
          {feedback && (
            <p className="text-sm text-green-200/80">{feedback}</p>
          )}
        </div>
      )}

      {/* Result: Wrong */}
      {status === 'wrong' && (
        <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-4 space-y-3">
          <div className="flex items-center gap-2 text-red-400 font-semibold">
            <XCircle className="w-5 h-5" />
            Not quite — watch the whiteboard for the solution!
          </div>
          {feedback && (
            <p className="text-sm text-red-200/80">{feedback}</p>
          )}
          <button
            type="button"
            onClick={handleRetry}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground
                       transition-colors mt-1"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
