import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, XCircle, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import type { ContentSection } from '@/lib/playback/types';

interface FlashCardProps {
  section: ContentSection;
  classroomId?: string;
  sceneId?: string;
  slideMode?: boolean;
  /** Subject ID for Tier 3 diagnostic feedback. */
  subjectId?: string;
  /** Strand label (e.g. scene title) for Tier 3 feedback routing. */
  strandName?: string;
}

const OPTION_LETTERS = ['A', 'B', 'C', 'D'];

interface StoredFlashCardState {
  selectedValue: string | null;
  isFlipped: boolean;
  signature: string;
}

function getFlashCardStorageKey(classroomId?: string, sceneId?: string, sectionId?: string): string | null {
  if (!classroomId || !sceneId || !sectionId) return null;
  return `OpenClass Learner:flashcard:${classroomId}:${sceneId}:${sectionId}`;
}

function loadStoredFlashCardState(storageKey: string): StoredFlashCardState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredFlashCardState>;
    return {
      selectedValue: typeof parsed.selectedValue === 'string' ? parsed.selectedValue : null,
      isFlipped: Boolean(parsed.isFlipped),
      signature: typeof parsed.signature === 'string' ? parsed.signature : '',
    };
  } catch {
    return null;
  }
}

function saveStoredFlashCardState(storageKey: string, state: StoredFlashCardState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    // Ignore storage quota / serialization failures.
  }
}

function clearStoredFlashCardState(storageKey: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // Ignore storage failures.
  }
}

export function FlashCard({ section, classroomId, sceneId, slideMode = false, subjectId, strandName }: FlashCardProps) {
  const [selectedValue, setSelectedValue] = useState<string | null>(null);
  const [isFlipped, setIsFlipped] = useState(false);
  const flipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const options = section.options ?? [];
  const correctValue = section.answer ?? '';
  const isCorrect = selectedValue === correctValue;
  const sectionResetKey = useMemo(
    () => JSON.stringify({
      id: section.id,
      content: section.content,
      answer: section.answer,
      explanation: section.explanation,
      options: options.map((opt) => ({ label: opt.label, value: opt.value })),
    }),
    [section.id, section.content, section.answer, section.explanation, options],
  );
  const storageKey = useMemo(
    () => getFlashCardStorageKey(classroomId, sceneId, section.id),
    [classroomId, sceneId, section.id],
  );

  useEffect(() => {
    if (flipTimerRef.current) {
      clearTimeout(flipTimerRef.current);
      flipTimerRef.current = null;
    }
    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
    const stored = storageKey ? loadStoredFlashCardState(storageKey) : null;
    if (stored && stored.signature === sectionResetKey) {
      setSelectedValue(stored.selectedValue);
      setIsFlipped(stored.isFlipped);
      return;
    }
    setSelectedValue(null);
    setIsFlipped(false);
    if (storageKey) clearStoredFlashCardState(storageKey);
  }, [sectionResetKey, storageKey]);

  useEffect(() => {
    if (!storageKey) return;
    saveStoredFlashCardState(storageKey, {
      selectedValue,
      isFlipped,
      signature: sectionResetKey,
    });
  }, [storageKey, selectedValue, isFlipped, sectionResetKey]);

  useEffect(() => () => {
    if (flipTimerRef.current) clearTimeout(flipTimerRef.current);
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
  }, []);

  function handleOptionClick(value: string) {
    if (isFlipped) return;
    if (flipTimerRef.current) clearTimeout(flipTimerRef.current);
    setSelectedValue(value);

    // Tier 3 feedback — push flashcard result to diagnostic system
    if (subjectId && strandName) {
      const correct = value === correctValue;
      api.pushDiagnosticFeedback(subjectId, strandName, correct ? 100 : 0, 'flashcard').catch(() => {});
    }

    // Small delay so user can see their selection before the flip
    flipTimerRef.current = setTimeout(() => {
      setIsFlipped(true);
      flipTimerRef.current = null;
    }, 120);
  }

  function handleReset() {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    if (storageKey) clearStoredFlashCardState(storageKey);
    setIsFlipped(false);
    resetTimerRef.current = setTimeout(() => {
      setSelectedValue(null);
      resetTimerRef.current = null;
    }, 350); // wait for flip back animation to finish
  }

  return (
    <div className={cn('w-full', slideMode ? 'py-1' : 'py-0')}>
      {/* Top label */}
      <div className="flex items-center gap-2 mb-3">
        <div
          className="h-px flex-1"
          style={{ background: 'linear-gradient(to right, hsl(245 78% 60% / 0.3), transparent)' }}
        />
        <span className="text-[9px] font-bold uppercase tracking-[0.22em] text-primary/60 flex items-center gap-1.5">
          <span>⚡</span> Quick Check
        </span>
        <div
          className="h-px flex-1"
          style={{ background: 'linear-gradient(to left, hsl(245 78% 60% / 0.3), transparent)' }}
        />
      </div>

      {/* 3D Flip container — height is driven by front-face content */}
      <div
        className="relative w-full"
        style={{ perspective: '1200px' }}
      >
        {/* Card body */}
        <div
          className="relative w-full"
          style={{
            transformStyle: 'preserve-3d',
            transition: 'transform 0.45s cubic-bezier(0.4, 0, 0.2, 1)',
            transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
          }}
        >
          {/* ── FRONT FACE ── (relative → determines container height) */}
          <div
            className="relative w-full rounded-2xl overflow-hidden border border-primary/20"
            style={{
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              background: 'linear-gradient(145deg, hsl(245 78% 60% / 0.07) 0%, hsl(var(--card)) 100%)',
            }}
          >
            <div className={cn('flex flex-col h-full', slideMode ? 'p-5' : 'p-5')}>
              {/* Question */}
              <p
                className={cn(
                  'font-semibold text-foreground/90 leading-snug mb-4',
                  slideMode ? 'text-[1rem]' : 'text-[15px]',
                )}
              >
                {section.content}
              </p>

              {/* Options */}
              <div className="grid grid-cols-1 gap-2.5 flex-1">
                {options.map((opt, i) => (
                  <button
                    key={`${section.id}-${opt.value}`}
                    onClick={() => handleOptionClick(opt.value)}
                    className={cn(
                      'group flex items-center gap-3 w-full rounded-xl px-4 py-3 text-left',
                      'border transition-all duration-200',
                      'border-border/40 bg-muted/20 hover:bg-primary/10 hover:border-primary/35',
                      'text-foreground/80 hover:text-foreground',
                      selectedValue === opt.value && !isFlipped && 'bg-primary/15 border-primary/40 text-foreground',
                    )}
                    style={{ backdropFilter: 'blur(4px)' }}
                  >
                    <span
                      className={cn(
                        'flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center',
                        'text-[11px] font-bold transition-colors duration-200',
                        'bg-muted/40 text-primary/70 group-hover:bg-primary/20 group-hover:text-primary/90',
                        selectedValue === opt.value && !isFlipped && 'bg-primary/25 text-primary',
                      )}
                    >
                      {OPTION_LETTERS[i]}
                    </span>
                    <span className={cn('leading-snug', slideMode ? 'text-[14px]' : 'text-[13.5px]')}>
                      {opt.label}
                    </span>
                  </button>
                ))}
              </div>

              {/* Footer hint */}
              <p className="text-center text-[11px] text-muted-foreground/45 mt-3 pt-2 border-t border-border/20">
                Tap an option to reveal the answer
              </p>
            </div>
          </div>

          {/* ── BACK FACE ── (absolute overlay; overflow-y auto if taller than front) */}
          <div
            className="absolute inset-0 rounded-2xl overflow-y-auto border"
            style={{
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              transform: 'rotateY(180deg)',
              minHeight: '100%',
              borderColor: isCorrect ? 'hsl(142 76% 36% / 0.4)' : 'hsl(0 84% 60% / 0.35)',
              background: isCorrect
                ? 'linear-gradient(145deg, hsl(142 76% 36% / 0.08) 0%, hsl(var(--card)) 100%)'
                : 'linear-gradient(145deg, hsl(0 84% 60% / 0.08) 0%, hsl(var(--card)) 100%)',
            }}
          >
            <div className={cn('flex flex-col h-full', slideMode ? 'p-5' : 'p-5')}>
              {/* Result banner */}
              <div
                className={cn(
                  'flex items-center gap-2.5 rounded-xl p-3 mb-4',
                  isCorrect ? 'bg-emerald-500/10 border border-emerald-500/25' : 'bg-red-500/10 border border-red-500/20',
                )}
              >
                {isCorrect ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                )}
                <span
                  className={cn(
                    'font-bold text-[13px]',
                    isCorrect ? 'text-emerald-400' : 'text-red-400',
                  )}
                >
                  {isCorrect ? 'Correct! Well done.' : 'Not quite — see the right answer below.'}
                </span>
              </div>

              {/* Options with correct/wrong highlights */}
              <div className="grid grid-cols-1 gap-2 flex-1">
                {options.map((opt, i) => {
                  const isThisCorrect = opt.value === correctValue;
                  const isThisSelected = opt.value === selectedValue;
                  const isWrongSelected = isThisSelected && !isThisCorrect;

                  return (
                    <div
                      key={`${section.id}-back-${opt.value}`}
                      className={cn(
                        'flex items-center gap-3 rounded-xl px-4 py-2.5',
                        'border transition-colors duration-200',
                        isThisCorrect
                          ? 'bg-emerald-500/10 border-emerald-500/35 text-emerald-300'
                          : isWrongSelected
                          ? 'bg-red-500/10 border-red-500/25 text-red-300'
                          : 'bg-muted/10 border-border/20 text-muted-foreground/50',
                      )}
                    >
                      <span
                        className={cn(
                          'flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold',
                          isThisCorrect
                            ? 'bg-emerald-500/25 text-emerald-400'
                            : isWrongSelected
                            ? 'bg-red-500/20 text-red-400'
                            : 'bg-muted/30 text-muted-foreground/40',
                        )}
                      >
                        {isThisCorrect ? '✓' : isWrongSelected ? '✗' : OPTION_LETTERS[i]}
                      </span>
                      <span className="text-[13px] leading-snug">{opt.label}</span>
                    </div>
                  );
                })}
              </div>

              {/* Explanation */}
              {section.explanation && (
                <div
                  className="mt-3 p-3 rounded-xl border border-border/30 text-[12.5px] text-muted-foreground/80 leading-relaxed"
                  style={{ background: 'hsl(var(--muted))' }}
                >
                  <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary/50 block mb-1">
                    Why?
                  </span>
                  {section.explanation}
                </div>
              )}

              {/* Try again */}
              <button
                onClick={handleReset}
                className={cn(
                  'mt-3 flex items-center justify-center gap-1.5 w-full py-2 rounded-lg',
                  'text-[12px] font-medium text-muted-foreground/60 border border-border/30',
                  'hover:bg-muted/40 hover:text-muted-foreground/80 transition-colors duration-150',
                )}
              >
                <RotateCcw className="w-3 h-3" />
                Try again
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
