/**
 * ResumeModal — Phase 3
 *
 * Shown when a learner clicks a course card and a previous session is found.
 * Two options:
 *   - Continue (resumes at the saved scene/offset)
 *   - Start Fresh (deletes the session, starts a new generation)
 */

import { Loader2, PlayCircle, RotateCcw } from 'lucide-react';
import type { ResumePayload } from '@/lib/api';

interface ResumeModalProps {
  courseId: string;
  resume: ResumePayload;
  onContinue: (resume: ResumePayload) => void;
  onStartFresh: () => Promise<void>;
  isLoading: boolean;
}

export function ResumeModal({ resume, onContinue, onStartFresh, isLoading }: ResumeModalProps) {
  const sceneLabel = `Scene ${resume.sceneIndex + 1}`;
  const timeLabel =
    resume.progressMs > 0 ? ` at ${Math.round(resume.progressMs / 1000)}s` : '';

  return (
    /* Backdrop */
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl bg-card border border-border shadow-2xl p-6 space-y-5">
        {/* Icon + heading */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <PlayCircle size={20} className="text-primary" />
          </div>
          <div>
            <h2 className="font-semibold text-base">Resume where you left off?</h2>
            <p className="text-xs text-muted-foreground">
              Last saved: {sceneLabel}{timeLabel}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3">
          {/* Continue */}
          <button
            disabled={isLoading}
            onClick={() => onContinue(resume)}
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {isLoading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <PlayCircle size={16} />
            )}
            Continue learning
          </button>

          {/* Start fresh */}
          <button
            disabled={isLoading}
            onClick={onStartFresh}
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-border bg-background text-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors disabled:opacity-50"
          >
            <RotateCcw size={14} />
            Start fresh
          </button>
        </div>
      </div>
    </div>
  );
}
