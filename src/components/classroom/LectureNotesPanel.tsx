/**
 * LectureNotesPanel — right-side collapsible panel
 *
 * Shows per-scene speech text as running lecture notes, with the current
 * scene highlighted and auto-scrolled into view.
 *
 * Renders ALL action types in document order:
 *   speech      → readable text paragraph
 *   spotlight / laser / highlight / reveal → InlineActionTag badge
 *   discussion  → amber discussion card
 *   wb_*        → violet whiteboard InlineActionTag
 */
import { useEffect, useRef } from 'react';
import { BookOpen, X, MessageCircle, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Scene } from '@/lib/playback/types';
import type { Action, SpeechAction, DiscussionAction } from '@/lib/types/action';
import InlineActionTag from '@/components/classroom/InlineActionTag';

interface LectureNotesPanelProps {
  scenes: Scene[];
  currentSceneIndex: number;
  isOpen: boolean;
  onClose: () => void;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Actions worth showing in the notes panel (excludes pure-playback ones like pause/reveal) */
const VISIBLE_ACTION_TYPES = new Set([
  'speech', 'spotlight', 'laser', 'discussion',
  'wb_open', 'wb_close', 'wb_clear', 'wb_delete',
  'wb_draw_text', 'wb_draw_shape', 'wb_draw_chart',
  'wb_draw_latex', 'wb_draw_table', 'wb_draw_line',
]);

function getVisibleActions(scene: Scene): Action[] {
  return (scene.actions ?? []).filter((a) => VISIBLE_ACTION_TYPES.has(a.type));
}

function hasSpeech(scene: Scene): boolean {
  return (scene.actions ?? []).some((a) => a.type === 'speech');
}

function scenePageLabel(scene: Scene, index: number): string {
  return scene.type === 'quiz' ? 'Quiz' : `Slide ${index + 1}`;
}

// ─── Action row renderer ─────────────────────────────────────────────────────

function ActionRow({ action, isCurrent }: { action: Action; isCurrent: boolean }) {
  if (action.type === 'speech') {
    const s = action as SpeechAction;
    return (
      <p
        className={cn(
          'text-[11px] leading-[1.75]',
          isCurrent ? 'text-foreground/65' : 'text-muted-foreground/40',
        )}
      >
        {s.text}
      </p>
    );
  }

  if (action.type === 'discussion') {
    const d = action as DiscussionAction;
    return (
      <div
        className="flex items-start gap-2 px-2.5 py-2 rounded-lg border border-amber-500/20"
        style={{ background: 'hsl(38 95% 55% / 0.07)' }}
      >
        <MessageSquare className="w-3 h-3 text-amber-400/70 mt-[2px] flex-shrink-0" />
        <div className="min-w-0">
          <InlineActionTag actionType="discussion" />
          {d.topic && (
            <p className="mt-0.5 text-[10px] leading-[1.6] text-amber-300/55 break-words">
              {d.topic}
            </p>
          )}
        </div>
      </div>
    );
  }

  // All other action types — render as inline tag
  return (
    <div className="flex items-center gap-1">
      <InlineActionTag actionType={action.type} />
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function LectureNotesPanel({
  scenes,
  currentSceneIndex,
  isOpen,
  onClose,
}: LectureNotesPanelProps) {
  const currentSceneRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the current scene whenever the index changes
  useEffect(() => {
    if (!isOpen) return;
    if (currentSceneRef.current) {
      currentSceneRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [currentSceneIndex, isOpen]);

  if (!isOpen) return null;

  return (
    <aside
      className="w-[280px] flex-shrink-0 flex flex-col border-l border-border/20 overflow-hidden"
      style={{ background: 'hsl(var(--card))' }}
      aria-label="Lecture notes"
    >
      {/* ── Header ── */}
      <div
        className="h-10 flex items-center justify-between px-3 flex-shrink-0 border-b border-border/20"
        style={{ background: 'hsl(var(--card))' }}
      >
        <div className="flex items-center gap-2">
          <BookOpen className="w-3.5 h-3.5 text-primary/50" />
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/45">
            Lecture Notes
          </span>
        </div>

        <button
          onClick={onClose}
          className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground/35 hover:text-foreground/60 hover:bg-muted/40 transition-colors"
          aria-label="Close lecture notes"
        >
          <X className="w-3 h-3" />
        </button>
      </div>

      {/* ── Scrollable notes list ── */}
      <div
        className="flex-1 overflow-y-auto"
        style={{ scrollbarWidth: 'thin', paddingBottom: 180 }}
      >
        {scenes.map((scene, i) => {
          const actions = getVisibleActions(scene);
          if (actions.length === 0 && scene.type !== 'quiz') return null;

          const isCurrent = i === currentSceneIndex;
          const pageLabel = scenePageLabel(scene, i);

          return (
            <div
              key={scene.id}
              ref={isCurrent ? currentSceneRef : undefined}
              className={cn(
                'border-b border-border/10 transition-colors duration-300',
                isCurrent
                  ? 'bg-primary/[0.06]'
                  : 'hover:bg-muted/30',
              )}
            >
              {/* Scene header row */}
              <div className="flex items-center gap-2 px-3 pt-3 pb-1">
                {/* Active indicator dot */}
                <div
                  className={cn(
                    'w-1.5 h-1.5 rounded-full flex-shrink-0 transition-all duration-300',
                    isCurrent ? 'bg-primary scale-125' : 'bg-muted-foreground/20',
                  )}
                />

                {/* Page label badge */}
                <span
                  className={cn(
                    'text-[9px] font-bold uppercase tracking-[0.15em] px-1.5 py-[2px] rounded-full',
                    isCurrent
                      ? 'bg-primary/15 text-primary/70'
                      : 'bg-muted/40 text-muted-foreground/30',
                  )}
                >
                  {pageLabel}
                </span>
              </div>

              {/* Scene title */}
              <p
                className={cn(
                  'text-[11px] font-semibold px-3 pb-1.5 leading-tight',
                  isCurrent ? 'text-foreground/75' : 'text-muted-foreground/45',
                )}
              >
                {scene.title}
              </p>

              {/* Quiz notice when no actions */}
              {scene.type === 'quiz' && actions.length === 0 && (
                <div className="mx-3 mb-3 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary/8 border border-primary/15">
                  <MessageCircle className="w-3 h-3 text-primary/50 flex-shrink-0" />
                  <span className="text-[10px] text-primary/60">Interactive quiz</span>
                </div>
              )}

              {/* All visible actions in document order */}
              {actions.length > 0 && (
                <div className="px-3 pb-3 space-y-2">
                  {actions.map((action) => (
                    <ActionRow key={action.id} action={action} isCurrent={isCurrent} />
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Empty state */}
        {scenes.every((s) => !hasSpeech(s)) && (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-center px-4">
            <BookOpen className="w-8 h-8 text-muted-foreground/15" />
            <p className="text-[11px] text-muted-foreground/30 leading-relaxed">
              Lecture notes will appear here as the lesson plays.
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}
