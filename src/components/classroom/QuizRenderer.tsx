import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import { useDraftCache } from '@/lib/hooks/use-draft-cache';
import {
  PieChart,
  CheckCircle2,
  XCircle,
  RotateCcw,
  ChevronRight,
  Check,
  BookOpen,
  Loader2,
  Sparkles,
} from 'lucide-react';
import type { QuizQuestion } from '@/lib/playback/types';
import type { ReactNode } from 'react';
import { renderMathText } from '@/components/ui/katex-math';

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase = 'not_started' | 'answering' | 'grading' | 'reviewing';

interface QuestionResult {
  questionId: string;
  status: 'correct' | 'incorrect';
  earned: number;
  aiComment?: string;
}

interface QuizRendererProps {
  questions: QuizQuestion[];
  sceneId: string;
  onSubmit: (answers: Record<string, string[]>) => void;
  existingResult?: { answers: Record<string, string[]>; score: number } | null;
  /** Subject ID for Tier 3 diagnostic feedback. */
  subjectId?: string;
  /** Strand label (e.g. scene title) for Tier 3 feedback routing. */
  strandName?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

function isShortAnswer(q: QuizQuestion): boolean {
  return q.type === 'short_answer' || !q.answer || q.answer.length === 0;
}

const renderInlineRichText = renderMathText;

function gradeChoiceLocally(
  questions: QuizQuestion[],
  answers: Record<string, string[]>,
): QuestionResult[] {
  return questions
    .filter((q) => !isShortAnswer(q))
    .map((q) => {
      const pts = q.points ?? 1;
      const userAnswer = answers[q.id] ?? [];
      const correctAnswer = q.answer ?? [];
      const correct = arraysEqual(userAnswer, correctAnswer);
      return {
        questionId: q.id,
        status: (correct ? 'correct' : 'incorrect') as 'correct' | 'incorrect',
        earned: correct ? pts : 0,
      };
    });
}

async function gradeShortAnswerViaAPI(
  q: QuizQuestion,
  userAnswer: string,
): Promise<QuestionResult> {
  const pts = q.points ?? 1;
  try {
    const result = await api.gradeShortAnswer({
      question: q.question,
      userAnswer,
      points: pts,
      commentPrompt: q.commentPrompt,
    });
    const earned = Math.max(0, Math.min(pts, result.score));
    return {
      questionId: q.id,
      status: (earned >= pts * 0.8 ? 'correct' : 'incorrect') as 'correct' | 'incorrect',
      earned,
      aiComment: result.comment,
    };
  } catch {
    return {
      questionId: q.id,
      status: 'incorrect',
      earned: Math.round(pts * 0.5),
      aiComment: 'Grading service unavailable. Partial credit given.',
    };
  }
}



// ─── QuizCover ────────────────────────────────────────────────────────────────

function QuizCover({
  questionCount,
  totalPoints,
  onStart,
}: {
  questionCount: number;
  totalPoints: number;
  onStart: () => void;
}) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-5 relative overflow-hidden animate-fade-in-fast">
      {/* Decorative background icons */}
      <div className="absolute top-4 right-4 opacity-[0.04] pointer-events-none select-none">
        <PieChart className="w-48 h-48" style={{ color: 'hsl(245 78% 60%)' }} />
      </div>
      <div className="absolute bottom-4 left-4 opacity-[0.03] pointer-events-none select-none rotate-12">
        <BookOpen className="w-36 h-36" style={{ color: 'hsl(245 78% 60%)' }} />
      </div>

      {/* Icon badge */}
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center"
        style={{
          background: 'linear-gradient(135deg, hsl(245 78% 60% / 0.2), hsl(265 70% 55% / 0.12))',
          border: '1px solid hsl(245 78% 60% / 0.3)',
          boxShadow: '0 8px 28px hsl(245 78% 60% / 0.22)',
        }}
      >
        <PieChart className="w-8 h-8" style={{ color: 'hsl(245 78% 65%)' }} />
      </div>

      {/* Title */}
      <div className="text-center z-10">
        <h3 className="text-xl font-bold text-foreground">Knowledge Check</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Answer all questions, then submit for grading
        </p>
      </div>

      {/* Stats */}
      <div className="flex gap-5 text-sm z-10">
        <div className="flex items-center gap-2 text-muted-foreground">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: 'hsl(245 78% 60% / 0.12)' }}
          >
            <BookOpen className="w-3.5 h-3.5" style={{ color: 'hsl(245 78% 65%)' }} />
          </div>
          <span>{questionCount} question{questionCount !== 1 ? 's' : ''}</span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: 'hsl(245 78% 60% / 0.12)' }}
          >
            <PieChart className="w-3.5 h-3.5" style={{ color: 'hsl(245 78% 65%)' }} />
          </div>
          <span>{totalPoints} pts total</span>
        </div>
      </div>

      {/* Start button */}
      <button
        onClick={onStart}
        className="mt-1 px-8 py-2.5 rounded-full font-semibold text-white flex items-center gap-2 transition-all hover:brightness-110 active:scale-95 z-10"
        style={{
          background: 'linear-gradient(135deg, hsl(245 78% 58%), hsl(265 70% 52%))',
          boxShadow: '0 4px 20px hsl(245 78% 60% / 0.4)',
        }}
      >
        Start Quiz
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

// ─── QuestionCard ─────────────────────────────────────────────────────────────

function QuestionCard({
  question,
  index,
  result,
  children,
}: {
  question: QuizQuestion;
  index: number;
  result?: QuestionResult;
  children: React.ReactNode;
}) {
  const isReview = !!result;
  const pts = question.points ?? 1;

  const accentColor = !isReview
    ? 'hsl(245 78% 60%)'
    : result.status === 'correct'
    ? '#10b981'
    : '#f87171';

  return (
    <div
      className="rounded-2xl border p-5 relative overflow-hidden transition-all animate-fade-in-fast"
      style={{
        background: 'hsl(var(--card))',
        borderColor: isReview
          ? result.status === 'correct'
            ? 'hsl(160 60% 35% / 0.45)'
            : 'hsl(0 70% 55% / 0.35)'
          : 'hsl(var(--border) / 0.5)',
        boxShadow: isReview
          ? result.status === 'correct'
            ? '0 2px 12px hsl(160 60% 35% / 0.1)'
            : '0 2px 12px hsl(0 70% 55% / 0.1)'
          : 'none',
      }}
    >
      {/* Left accent stripe */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-2xl"
        style={{ background: accentColor }}
      />

      {/* Question header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-start gap-3">
          <span
            className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0"
            style={{
              background: isReview
                ? result.status === 'correct'
                  ? 'hsl(160 60% 35% / 0.2)'
                  : 'hsl(0 70% 55% / 0.2)'
                : 'hsl(245 78% 60% / 0.15)',
              color: accentColor,
            }}
          >
            {index + 1}
          </span>
          <div>
            <p className="text-sm font-medium text-foreground leading-relaxed">
              {renderInlineRichText(question.question)}
            </p>
            <p className="text-xs text-muted-foreground/55 mt-0.5">
              {question.type === 'single'
                ? 'Single choice'
                : question.type === 'multiple'
                ? 'Multiple choice'
                : 'Short answer'}
              {' · '}
              {pts} pt{pts !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        {isReview && (
          <div className="shrink-0 ml-2">
            {result.status === 'correct' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            ) : (
              <XCircle className="w-5 h-5 text-red-400" />
            )}
          </div>
        )}
      </div>

      {/* Question body */}
      {children}

      {/* Analysis (review mode only) */}
      {isReview && question.analysis && (
        <div
          className="mt-3 p-3 rounded-lg text-xs leading-relaxed"
          style={{
            background: 'hsl(210 80% 50% / 0.08)',
            border: '1px solid hsl(210 80% 50% / 0.2)',
            color: 'hsl(210 80% 70%)',
          }}
        >
          <span className="font-semibold">Analysis: </span>
          {renderInlineRichText(question.analysis)}
        </div>
      )}
    </div>
  );
}

function SingleChoiceQuestion({
  question,
  index,
  value,
  onChange,
  disabled,
  result,
}: {
  question: QuizQuestion;
  index: number;
  value?: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  result?: QuestionResult;
}) {
  const isReview = !!result;

  return (
    <QuestionCard question={question} index={index} result={result}>
      <div className="grid gap-2">
        {question.options?.map((opt) => {
          const selected = value === opt.value;
          const isCorrectOpt = isReview && (question.answer ?? []).includes(opt.value);
          const isWrong = isReview && selected && result?.status === 'incorrect';

          return (
            <button
              key={opt.value}
              disabled={disabled}
              onClick={() => !disabled && onChange(opt.value)}
              className={cn(
                'flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all text-sm',
                !isReview && !selected && 'border-border/40 hover:border-primary/40 hover:bg-primary/5',
                !isReview && selected && 'border-primary/60 bg-primary/10 ring-1 ring-primary/25',
                isReview && isCorrectOpt && 'border-emerald-500/45 bg-emerald-500/8',
                isReview && isWrong && !isCorrectOpt && 'border-red-400/45 bg-red-400/8',
                isReview && !isCorrectOpt && !selected && 'border-border/25 opacity-50',
                disabled && !isReview && 'cursor-default',
              )}
            >
              <span
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors"
                style={{
                  background:
                    !isReview && !selected
                      ? 'hsl(var(--muted))'
                      : !isReview && selected
                      ? 'hsl(245 78% 60%)'
                      : isReview && isCorrectOpt
                      ? '#10b981'
                      : isReview && isWrong && !isCorrectOpt
                      ? '#f87171'
                      : 'hsl(var(--muted))',
                  color:
                    (!isReview && !selected) || (isReview && !isCorrectOpt && !selected)
                      ? 'hsl(var(--muted-foreground))'
                      : 'white',
                }}
              >
                {opt.value}
              </span>
              <span
                className={cn(
                  'flex-1 text-sm',
                  isReview && !isCorrectOpt && !selected && 'text-muted-foreground/45',
                )}
              >
                {renderInlineRichText(opt.label)}
              </span>
              {isReview && isCorrectOpt && (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              )}
              {isReview && isWrong && !isCorrectOpt && (
                <XCircle className="w-4 h-4 text-red-400 shrink-0" />
              )}
            </button>
          );
        })}
      </div>
    </QuestionCard>
  );
}

// ─── MultipleChoiceQuestion ───────────────────────────────────────────────────

function MultipleChoiceQuestion({
  question,
  index,
  value,
  onChange,
  disabled,
  result,
}: {
  question: QuizQuestion;
  index: number;
  value?: string[];
  onChange: (v: string[]) => void;
  disabled?: boolean;
  result?: QuestionResult;
}) {
  const isReview = !!result;
  const selected = value ?? [];

  const toggle = (optValue: string) => {
    if (disabled) return;
    const next = selected.includes(optValue)
      ? selected.filter((v) => v !== optValue)
      : [...selected, optValue];
    onChange(next);
  };

  return (
    <QuestionCard question={question} index={index} result={result}>
      {!isReview && (
        <p className="text-xs text-muted-foreground/45 mb-2">Select all that apply</p>
      )}
      <div className="grid gap-2">
        {question.options?.map((opt) => {
          const isSelected = selected.includes(opt.value);
          const isCorrectOpt = isReview && (question.answer ?? []).includes(opt.value);
          const isWrong = isReview && isSelected && !isCorrectOpt;

          return (
            <button
              key={opt.value}
              disabled={disabled}
              onClick={() => toggle(opt.value)}
              className={cn(
                'flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all text-sm',
                !isReview && !isSelected && 'border-border/40 hover:border-primary/40 hover:bg-primary/5',
                !isReview && isSelected && 'border-primary/60 bg-primary/10 ring-1 ring-primary/25',
                isReview && isCorrectOpt && 'border-emerald-500/45 bg-emerald-500/8',
                isReview && isWrong && 'border-red-400/45 bg-red-400/8',
                isReview && !isCorrectOpt && !isSelected && 'border-border/25 opacity-50',
                disabled && !isReview && 'cursor-default',
              )}
            >
              <span
                className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 transition-colors"
                style={{
                  background:
                    !isReview && !isSelected
                      ? 'hsl(var(--muted))'
                      : !isReview && isSelected
                      ? 'hsl(245 78% 60%)'
                      : isReview && isCorrectOpt
                      ? '#10b981'
                      : isReview && isWrong
                      ? '#f87171'
                      : 'hsl(var(--muted))',
                  color:
                    (!isReview && !isSelected) || (isReview && !isCorrectOpt && !isSelected)
                      ? 'hsl(var(--muted-foreground))'
                      : 'white',
                }}
              >
                {!isReview && isSelected ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  opt.value
                )}
              </span>
              <span
                className={cn(
                  'flex-1 text-sm',
                  isReview && !isCorrectOpt && !isSelected && 'text-muted-foreground/45',
                )}
              >
                {renderInlineRichText(opt.label)}
              </span>
              {isReview && isCorrectOpt && (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              )}
              {isReview && isWrong && (
                <XCircle className="w-4 h-4 text-red-400 shrink-0" />
              )}
            </button>
          );
        })}
      </div>
    </QuestionCard>
  );
}

// ─── ShortAnswerQuestion ──────────────────────────────────────────────────────

function ShortAnswerQuestion({
  question,
  index,
  value,
  onChange,
  disabled,
  result,
}: {
  question: QuizQuestion;
  index: number;
  value?: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  result?: QuestionResult;
}) {
  const isReview = !!result;
  const charCount = (value ?? '').length;

  return (
    <QuestionCard question={question} index={index} result={result}>
      {!isReview ? (
        <div className="relative">
          <textarea
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            placeholder="Type your answer here..."
            rows={3}
            className="w-full p-3 pb-8 rounded-xl border text-sm resize-none focus:outline-none transition-all disabled:opacity-50"
            style={{
              background: 'hsl(var(--background))',
              borderColor: 'hsl(var(--border))',
              color: 'inherit',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'hsl(245 78% 60% / 0.5)';
              e.currentTarget.style.boxShadow = '0 0 0 2px hsl(245 78% 60% / 0.15)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'hsl(var(--border))';
              e.currentTarget.style.boxShadow = 'none';
            }}
          />
          <span className="absolute bottom-2.5 right-3 text-[10px] text-muted-foreground/35 pointer-events-none">
            {charCount} chars
          </span>
        </div>
      ) : (
        <div className="space-y-3">
          <div
            className="p-3 rounded-xl text-sm"
            style={{
              background: 'hsl(var(--background))',
              border: '1px solid hsl(var(--border))',
            }}
          >
            <p className="text-[10px] text-muted-foreground/45 mb-1 uppercase tracking-wide font-medium">
              Your Answer
            </p>
            {value ? (
              <p className="text-foreground/80 leading-relaxed">{value}</p>
            ) : (
              <p className="text-muted-foreground/35 italic">Not answered</p>
            )}
          </div>
          {result.aiComment && (
            <div
              className="flex items-start gap-2 px-3 py-2.5 rounded-lg"
              style={{
                background: 'hsl(245 78% 60% / 0.08)',
                border: '1px solid hsl(245 78% 60% / 0.2)',
              }}
            >
              <Sparkles
                className="w-4 h-4 shrink-0 mt-0.5"
                style={{ color: 'hsl(245 78% 65%)' }}
              />
              <div className="flex-1 min-w-0">
                <p
                  className="text-xs font-semibold mb-0.5"
                  style={{ color: 'hsl(245 78% 70%)' }}
                >
                  AI Feedback
                </p>
                <p className="text-xs leading-relaxed" style={{ color: 'hsl(245 78% 65% / 0.85)' }}>
                  {result.aiComment}
                </p>
              </div>
              <span
                className="text-xs font-bold shrink-0 mt-0.5"
                style={{ color: 'hsl(245 78% 70%)' }}
              >
                {result.earned}/{question.points ?? 1}pt
              </span>
            </div>
          )}
        </div>
      )}
    </QuestionCard>
  );
}

// ─── ScoreBanner ──────────────────────────────────────────────────────────────

function ScoreBanner({
  earned,
  total,
  results,
}: {
  earned: number;
  total: number;
  results: QuestionResult[];
}) {
  const pct = total > 0 ? Math.round((earned / total) * 100) : 0;
  const correctCount = results.filter((r) => r.status === 'correct').length;
  const incorrectCount = results.filter((r) => r.status === 'incorrect').length;
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 120);
    return () => clearTimeout(t);
  }, []);

  const color = pct >= 80 ? 'emerald' : pct >= 60 ? 'amber' : 'red';
  const variants = {
    emerald: {
      gradient: 'linear-gradient(135deg, #059669, #0d9488)',
      shadow: '0 8px 32px rgba(16,185,129,0.35)',
      label: 'Excellent work! 🎉',
    },
    amber: {
      gradient: 'linear-gradient(135deg, #d97706, #ca8a04)',
      shadow: '0 8px 32px rgba(217,119,6,0.35)',
      label: 'Good effort, keep going! 💪',
    },
    red: {
      gradient: 'linear-gradient(135deg, #dc2626, #e11d48)',
      shadow: '0 8px 32px rgba(220,38,38,0.35)',
      label: 'Needs more review 📚',
    },
  };
  const v = variants[color];

  const circumference = 2 * Math.PI * 34;
  const dashOffset = circumference * (1 - pct / 100);

  return (
    <div
      className="rounded-2xl p-6 text-white animate-slide-up"
      style={{ background: v.gradient, boxShadow: v.shadow }}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-white/80 text-sm font-medium">{v.label}</p>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-4xl font-black">{earned}</span>
            <span className="text-white/55 text-lg">/ {total} pts</span>
          </div>
          <div className="flex gap-4 mt-3 text-xs text-white/75">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {correctCount} correct
            </span>
            <span className="flex items-center gap-1.5">
              <XCircle className="w-3.5 h-3.5" />
              {incorrectCount} incorrect
            </span>
          </div>
        </div>

        {/* Animated SVG percentage ring */}
        <div className="relative w-20 h-20">
          <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
            <circle
              cx="40" cy="40" r="34"
              fill="none"
              stroke="rgba(255,255,255,0.18)"
              strokeWidth="6"
            />
            <circle
              cx="40" cy="40" r="34"
              fill="none"
              stroke="white"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={animated ? dashOffset : circumference}
              style={{ transition: 'stroke-dashoffset 1s ease-out 0.2s' }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xl font-black">{pct}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function QuizRenderer({
  questions,
  sceneId,
  onSubmit,
  existingResult,
  subjectId,
  strandName,
}: QuizRendererProps) {
  // Persistent draft cache — debounced localStorage
  const {
    cachedValue: draftAnswers,
    updateCache: saveDraft,
    clearCache: clearDraft,
  } = useDraftCache<Record<string, string[]>>({
    key: `quizDraft:${sceneId}`,
    debounceMs: 400,
  });

  // Determine initial phase
  const [phase, setPhase] = useState<Phase>(() => {
    if (existingResult) return 'reviewing';
    if (draftAnswers && Object.keys(draftAnswers).length > 0) return 'answering';
    return 'not_started';
  });

  // Answers state — restored from existingResult or draft
  const [answers, setAnswers] = useState<Record<string, string[]>>(() => {
    if (existingResult) return existingResult.answers;
    return draftAnswers ?? {};
  });

  // Per-question results — pre-computed from existingResult (no AI comments) or set after grading
  const [results, setResults] = useState<QuestionResult[]>(() => {
    if (!existingResult) return [];
    return questions.map((q) => {
      const pts = q.points ?? 1;
      const userAns = existingResult.answers[q.id] ?? [];
      const correctAns = q.answer ?? [];
      const correct =
        userAns.length > 0 &&
        correctAns.length > 0 &&
        arraysEqual(userAns, correctAns);
      return {
        questionId: q.id,
        status: (correct ? 'correct' : 'incorrect') as 'correct' | 'incorrect',
        earned: correct ? pts : 0,
      };
    });
  });

  const totalPoints = useMemo(
    () => questions.reduce((sum, q) => sum + (q.points ?? 1), 0),
    [questions],
  );

  const answeredCount = useMemo(() => {
    return questions.filter((q) => {
      const a = answers[q.id];
      if (!a || a.length === 0) return false;
      return a.some((v) => v.trim().length > 0);
    }).length;
  }, [questions, answers]);

  const allAnswered = answeredCount === questions.length;

  const handleSetAnswer = useCallback(
    (questionId: string, value: string[]) => {
      setAnswers((prev) => {
        const next = { ...prev, [questionId]: value };
        saveDraft(next);
        return next;
      });
    },
    [saveDraft],
  );

  const handleSubmit = useCallback(() => {
    clearDraft();
    setPhase('grading');
  }, [clearDraft]);

  // Grading effect — runs once when phase enters 'grading'
  const gradingRef = useRef(false);
  useEffect(() => {
    if (phase !== 'grading') {
      gradingRef.current = false;
      return;
    }
    if (gradingRef.current) return;
    gradingRef.current = true;

    let cancelled = false;
    (async () => {
      // Grade choice questions instantly (local)
      const choiceResults = gradeChoiceLocally(questions, answers);

      // Grade short-answer via AI (parallel)
      const shortQs = questions.filter(isShortAnswer);
      const aiResults = await Promise.all(
        shortQs.map((q) => gradeShortAnswerViaAPI(q, (answers[q.id] ?? [])[0] ?? '')),
      );

      if (cancelled) return;

      const map = new Map<string, QuestionResult>();
      for (const r of [...choiceResults, ...aiResults]) map.set(r.questionId, r);
      const ordered = questions
        .map((q) => map.get(q.id))
        .filter((r): r is QuestionResult => r !== undefined);

      setResults(ordered);
      setPhase('reviewing');
      // Persist to server
      onSubmit(answers);

      // Tier 3 diagnostic feedback — push quiz score to gap map
      if (subjectId && strandName) {
        const earned = ordered.reduce((sum, r) => sum + (r.earned ?? 0), 0);
        const total = questions.reduce((sum, q) => sum + (q.points ?? 1), 0);
        const scorePercent = total > 0 ? Math.round((earned / total) * 100) : 0;
        api.pushDiagnosticFeedback(subjectId, strandName, scorePercent, 'quiz').catch(() => {});
      }
    })();

    return () => { cancelled = true; };
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRetry = useCallback(() => {
    setPhase('not_started');
    setAnswers({});
    setResults([]);
    clearDraft();
  }, [clearDraft]);

  const earnedScore = useMemo(
    () => results.reduce((sum, r) => sum + r.earned, 0),
    [results],
  );

  const resultMap = useMemo(() => {
    const map: Record<string, QuestionResult> = {};
    results.forEach((r) => { map[r.questionId] = r; });
    return map;
  }, [results]);

  // ── Render a question (used by both answering and reviewing phases) ────────

  function renderQuestion(q: QuizQuestion, i: number, disabled: boolean) {
    if (q.type === 'single') {
      return (
        <SingleChoiceQuestion
          key={q.id}
          question={q}
          index={i}
          value={(answers[q.id] ?? [])[0]}
          onChange={(v) => handleSetAnswer(q.id, [v])}
          disabled={disabled}
          result={resultMap[q.id]}
        />
      );
    }
    if (q.type === 'multiple') {
      return (
        <MultipleChoiceQuestion
          key={q.id}
          question={q}
          index={i}
          value={answers[q.id]}
          onChange={(v) => handleSetAnswer(q.id, v)}
          disabled={disabled}
          result={resultMap[q.id]}
        />
      );
    }
    return (
      <ShortAnswerQuestion
        key={q.id}
        question={q}
        index={i}
        value={(answers[q.id] ?? [])[0]}
        onChange={(v) => handleSetAnswer(q.id, v.length > 0 ? [v] : [])}
        disabled={disabled}
        result={resultMap[q.id]}
      />
    );
  }

  // ── Phase: not_started ────────────────────────────────────────────────────

  if (phase === 'not_started') {
    return (
      <div className="w-full min-h-[420px] h-full">
        <QuizCover
          questionCount={questions.length}
          totalPoints={totalPoints}
          onStart={() => setPhase('answering')}
        />
      </div>
    );
  }

  // ── Phase: grading ────────────────────────────────────────────────────────

  if (phase === 'grading') {
    return (
      <div className="w-full min-h-[420px] h-full flex flex-col items-center justify-center gap-5 animate-fade-in-fast">
        <div className="animate-spin">
          <Loader2 className="w-10 h-10" style={{ color: 'hsl(245 78% 65%)' }} />
        </div>
        <div className="text-center">
          <p className="text-base font-semibold text-foreground">Grading your answers…</p>
          <p className="text-sm text-muted-foreground mt-1">
            AI is evaluating short-answer responses
          </p>
        </div>
        <div className="flex gap-1.5 mt-1">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-full animate-pulse"
              style={{
                background: 'hsl(245 78% 60%)',
                animationDelay: `${i * 220}ms`,
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  // ── Phase: answering ──────────────────────────────────────────────────────

  if (phase === 'answering') {
    return (
      <div className="w-full flex flex-col min-h-0 animate-fade-in-fast">
        {/* Sticky header */}
        <div
          className="flex items-center justify-between px-6 py-3 border-b shrink-0 sticky top-0 z-10"
          style={{
            background: 'hsl(var(--background) / 0.96)',
            borderColor: 'hsl(var(--border))',
            backdropFilter: 'blur(12px)',
          }}
        >
          <div className="flex items-center gap-2">
            <PieChart className="w-4 h-4" style={{ color: 'hsl(245 78% 65%)' }} />
            <span className="text-sm font-semibold text-foreground">Quiz</span>
            <span className="text-xs text-muted-foreground/60 ml-1">
              {answeredCount} / {questions.length} answered
            </span>
          </div>
          <button
            onClick={handleSubmit}
            disabled={!allAnswered}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95 disabled:cursor-not-allowed"
            style={
              allAnswered
                ? {
                    background: 'linear-gradient(135deg, hsl(245 78% 58%), hsl(265 70% 52%))',
                    color: 'white',
                    boxShadow: '0 2px 14px hsl(245 78% 60% / 0.3)',
                  }
                : {
                    background: 'hsl(var(--muted))',
                    color: 'hsl(var(--muted-foreground))',
                  }
            }
          >
            Submit Answers
          </button>
        </div>

        {/* All questions */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {questions.map((q, i) => renderQuestion(q, i, false))}
        </div>
      </div>
    );
  }

  // ── Phase: reviewing ─────────────────────────────────────────────────────

  return (
    <div className="w-full flex flex-col min-h-0 animate-fade-in-fast">
      {/* Sticky header */}
      <div
        className="flex items-center justify-between px-6 py-3 border-b shrink-0 sticky top-0 z-10"
        style={{
          background: 'hsl(var(--background) / 0.96)',
          borderColor: 'hsl(var(--border))',
          backdropFilter: 'blur(12px)',
        }}
      >
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span className="text-sm font-semibold text-foreground">Quiz Report</span>
        </div>
        <button
          onClick={handleRetry}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Retry Quiz
        </button>
      </div>

      {/* Score banner + per-question review */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
        <ScoreBanner earned={earnedScore} total={totalPoints} results={results} />
        {questions.map((q, i) => renderQuestion(q, i, true))}
      </div>
    </div>
  );
}
