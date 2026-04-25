/**
 * SceneNav — PPT-style slide thumbnail strip (left sidebar)
 *
 * - 16:9 thumbnail card per scene
 * - Lesson scenes: CSS-rendered mini-slide preview (sections as tiny visual rows)
 * - Quiz scenes:   question-bar + 2×2 option-grid preview
 * - Resizable via drag handle on right edge (min 160 px / max 380 px)
 * - Collapsible: width animates to 0, re-open via floating ChevronRight button
 * - Active: primary ring + accent bar; Completed: green checkmark overlay
 */
import { useCallback, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Lock,
  PanelLeftClose,
} from 'lucide-react';
import type { Scene, ContentSection, LessonContent, QuizContent } from '@/lib/playback/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_WIDTH = 200;
const MIN_WIDTH     = 160;
const MAX_WIDTH     = 380;

// ─── Props ────────────────────────────────────────────────────────────────────

interface SceneNavProps {
  scenes: Scene[];
  currentSceneIndex: number;
  completedSceneIds: string[];
  onSceneClick: (index: number) => void;
}

// ─── Lesson thumbnail ─────────────────────────────────────────────────────────

/** Maps a section type to a tiny visual row for the mini-slide preview. */
function SectionRow({ section }: { section: ContentSection }) {
  switch (section.type) {
    case 'heading':
      return (
        <div className="flex items-center gap-1">
          <div
            className="w-0.5 rounded-full flex-shrink-0 self-stretch"
            style={{ background: 'hsl(245 78% 70%/0.7)', minHeight: 5 }}
          />
          <div
            className="rounded-[1px]"
            style={{
              height: 3,
              width: section.level === 1 ? '72%' : section.level === 2 ? '58%' : '44%',
              background: 'hsl(245 78% 75%/0.8)',
            }}
          />
        </div>
      );

    case 'text':
      return (
        <div className="space-y-[2px]">
          <div className="rounded-[1px]" style={{ height: 2, width: '90%', background: 'hsl(0 0% 100%/0.22)' }} />
          <div className="rounded-[1px]" style={{ height: 2, width: '80%', background: 'hsl(0 0% 100%/0.16)' }} />
          <div className="rounded-[1px]" style={{ height: 2, width: '65%', background: 'hsl(0 0% 100%/0.10)' }} />
        </div>
      );

    case 'callout': {
      const accent =
        section.variant === 'warning' ? 'hsl(38 92% 60%/0.7)'
        : section.variant === 'tip'   ? 'hsl(142 72% 55%/0.7)'
        : section.variant === 'success' ? 'hsl(160 84% 45%/0.7)'
        : 'hsl(217 91% 65%/0.7)'; // info / default
      return (
        <div
          className="flex gap-0.5 items-stretch rounded-[2px] overflow-hidden"
          style={{ height: 7, background: 'hsl(0 0% 100%/0.07)' }}
        >
          <div className="w-[2px] flex-shrink-0" style={{ background: accent }} />
          <div className="flex-1 m-[1px]">
            <div className="rounded-[1px]" style={{ height: 2, width: '70%', background: 'hsl(0 0% 100%/0.18)' }} />
          </div>
        </div>
      );
    }

    case 'formula':
      return (
        <div
          className="flex items-center justify-center rounded-[2px]"
          style={{ height: 8, background: 'hsl(245 78% 60%/0.12)', border: '0.5px solid hsl(245 78% 70%/0.25)' }}
        >
          <div className="rounded-[1px]" style={{ height: 2, width: '55%', background: 'hsl(245 78% 75%/0.45)' }} />
        </div>
      );

    case 'list':
      return (
        <div className="space-y-[2px]">
          {[0.85, 0.75, 0.6].map((w, k) => (
            <div key={k} className="flex items-center gap-1">
              <div
                className="w-1 h-1 rounded-full flex-shrink-0"
                style={{ background: 'hsl(245 78% 70%/0.6)' }}
              />
              <div
                className="rounded-[1px]"
                style={{ height: 1.5, width: `${w * 100}%`, background: 'hsl(0 0% 100%/0.18)' }}
              />
            </div>
          ))}
        </div>
      );

    case 'definition':
      return (
        <div
          className="rounded-[2px]"
          style={{ height: 10, padding: '2px 3px', background: 'hsl(0 0% 100%/0.06)', border: '0.5px solid hsl(0 0% 100%/0.12)' }}
        >
          <div className="rounded-[1px] mb-[2px]" style={{ height: 2, width: '40%', background: 'hsl(245 78% 70%/0.6)' }} />
          <div className="rounded-[1px]" style={{ height: 1.5, width: '80%', background: 'hsl(0 0% 100%/0.16)' }} />
        </div>
      );

    case 'example':
      return (
        <div
          className="rounded-[2px]"
          style={{ height: 9, padding: '2px 3px', background: 'hsl(38 92% 60%/0.10)', border: '0.5px solid hsl(38 92% 60%/0.2)' }}
        >
          <div className="rounded-[1px]" style={{ height: 2, width: '65%', background: 'hsl(38 92% 70%/0.45)' }} />
        </div>
      );

    case 'code':
      return (
        <div
          className="rounded-[2px]"
          style={{ height: 12, padding: '2px 3px', background: 'hsl(220 50% 10%/0.9)', border: '0.5px solid hsl(0 0% 100%/0.08)' }}
        >
          {[0.5, 0.7, 0.4].map((w, k) => (
            <div
              key={k}
              className="rounded-[1px] mb-[1.5px]"
              style={{
                height: 1.5,
                width: `${w * 100}%`,
                background: k === 1 ? 'hsl(142 72% 55%/0.5)' : 'hsl(217 91% 65%/0.4)',
              }}
            />
          ))}
        </div>
      );

    case 'image_placeholder':
      return (
        <div
          className="rounded-[2px] flex items-center justify-center"
          style={{ height: 14, background: 'hsl(0 0% 100%/0.05)', border: '0.5px dashed hsl(0 0% 100%/0.15)' }}
        >
          <div className="rounded-full" style={{ width: 5, height: 5, background: 'hsl(0 0% 100%/0.12)' }} />
        </div>
      );

    default:
      return (
        <div className="rounded-[1px]" style={{ height: 2, width: '75%', background: 'hsl(0 0% 100%/0.14)' }} />
      );
  }
}

/** Mini lesson "slide" preview — renders up to 6 sections as visual rows. */
function LessonSlideThumbnail({ scene }: { scene: Scene }) {
  const sections = (scene.content as LessonContent | undefined)?.sections ?? [];
  const preview = sections.slice(0, 7);

  return (
    <div
      className="w-full h-full flex flex-col"
      style={{
        background: 'linear-gradient(155deg, hsl(245 60% 9%) 0%, hsl(220 50% 7%) 100%)',
        padding: '6px 7px 5px',
        gap: 3,
      }}
    >
      {/* Slide title strip */}
      <div
        className="font-semibold flex-shrink-0 truncate"
        style={{
          fontSize: 5.5,
          lineHeight: 1.3,
          color: 'hsl(0 0% 100%/0.85)',
          marginBottom: 2,
          maxWidth: '100%',
        }}
      >
        {scene.title}
      </div>

      {/* Divider */}
      <div
        className="flex-shrink-0"
        style={{ height: 0.5, background: 'hsl(245 78% 70%/0.25)', marginBottom: 2 }}
      />

      {/* Section rows */}
      <div className="flex-1 flex flex-col gap-[3px] overflow-hidden">
        {preview.length > 0 ? (
          preview.map((section) => (
            <SectionRow key={section.id} section={section} />
          ))
        ) : (
          /* Empty lesson placeholder */
          <div className="flex-1 flex items-center justify-center">
            <BookOpen
              style={{ width: 10, height: 10, color: 'hsl(245 78% 70%/0.3)' }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/** Mini quiz preview — question bar + 2×2 option grid. */
function QuizSlideThumbnail() {
  return (
    <div
      className="w-full h-full flex flex-col"
      style={{ background: 'linear-gradient(155deg, hsl(38 60% 9%) 0%, hsl(30 50% 7%) 100%)', padding: '6px 7px 5px' }}
    >
      {/* Question bar */}
      <div
        className="rounded-full flex-shrink-0"
        style={{ height: 3, width: '78%', background: 'hsl(38 92% 60%/0.55)', marginBottom: 4 }}
      />
      <div
        className="rounded-full flex-shrink-0"
        style={{ height: 2, width: '55%', background: 'hsl(38 92% 60%/0.28)', marginBottom: 6 }}
      />
      {/* 2×2 option grid */}
      <div className="flex-1 grid grid-cols-2 gap-[3px]">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-[2px] flex items-center gap-[2px] px-[3px]"
            style={{
              background:
                i === 1 ? 'hsl(38 92% 60%/0.18)' : 'hsl(0 0% 100%/0.05)',
              border: `0.5px solid ${i === 1 ? 'hsl(38 92% 60%/0.35)' : 'hsl(0 0% 100%/0.08)'}`,
            }}
          >
            <div
              className="rounded-full flex-shrink-0"
              style={{
                width: 3,
                height: 3,
                background: i === 1 ? 'hsl(38 92% 60%/0.8)' : 'hsl(0 0% 100%/0.2)',
              }}
            />
            <div
              className="rounded-[1px] flex-1"
              style={{
                height: 1.5,
                background: i === 1 ? 'hsl(38 92% 60%/0.45)' : 'hsl(0 0% 100%/0.12)',
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function SceneNav({
  scenes,
  currentSceneIndex,
  completedSceneIds,
  onSceneClick,
}: SceneNavProps) {
  const completedCount = completedSceneIds.length;
  const progressPct =
    scenes.length > 1 ? Math.round((completedCount / scenes.length) * 100) : 0;

  const [collapsed, setCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_WIDTH);
  const isDraggingRef = useRef(false);

  /** Right-edge drag handle for resizing */
  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDraggingRef.current = true;
      const startX     = e.clientX;
      const startWidth = sidebarWidth;

      const onMove = (me: MouseEvent) => {
        const newW = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + (me.clientX - startX)));
        setSidebarWidth(newW);
      };
      const onUp = () => {
        isDraggingRef.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };

      document.body.style.cursor     = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [sidebarWidth],
  );

  return (
    <>
      {/* ── Slide-strip sidebar ── */}
      <div
        style={{
          width: collapsed ? 0 : sidebarWidth,
          transition: isDraggingRef.current ? 'none' : 'width 0.28s ease',
          background: 'hsl(var(--card))',
        }}
        className="hidden lg:flex flex-shrink-0 flex-col border-r border-border/15 overflow-visible relative z-20"
      >
        <div className={cn('flex flex-col w-full h-full overflow-hidden', collapsed && 'invisible')}>

          {/* ── Header: course progress + collapse button ── */}
          <div className="px-3 pt-4 pb-3 border-b border-border/15 flex-shrink-0">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground/40">
                Slides
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-semibold text-primary/80">{progressPct}%</span>
                <button
                  onClick={() => setCollapsed(true)}
                  className="w-5 h-5 rounded-md flex items-center justify-center text-muted-foreground/30 hover:text-foreground/60 hover:bg-muted/40 transition-colors"
                  title="Collapse slide panel"
                >
                  <PanelLeftClose className="w-3 h-3" />
                </button>
              </div>
            </div>
            {/* Progress bar */}
            <div className="h-0.5 rounded-full bg-muted/60 overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          {/* ── Scrollable thumbnail list ── */}
          <div className="flex-1 overflow-y-auto py-2 px-2 space-y-2" style={{ scrollbarWidth: 'thin' }}>
            {scenes.map((scene, i) => {
              const isCurrent   = i === currentSceneIndex;
              const isCompleted = completedSceneIds.includes(scene.id);
              const isQuiz      = scene.type === 'quiz';
              // Locked if this isn't scene 0 AND the previous scene hasn't been completed yet
              const isLocked    = i > 0 && !completedSceneIds.includes(scenes[i - 1].id);

              return (
                <button
                  key={scene.id}
                  onClick={() => !isLocked && onSceneClick(i)}
                  disabled={isLocked}
                  title={isLocked ? `Complete "${scenes[i - 1].title}" to unlock` : scene.title}
                  className={cn(
                    'group relative w-full text-left rounded-lg p-1.5 flex flex-col gap-1 transition-all duration-200',
                    isLocked
                      ? 'opacity-40 cursor-not-allowed'
                      : isCurrent
                      ? 'bg-primary/10 ring-1 ring-primary/35'
                      : isQuiz
                      ? 'hover:bg-amber-400/[0.06] ring-1 ring-transparent hover:ring-amber-400/20'
                      : 'hover:bg-muted/30 ring-1 ring-transparent hover:ring-border/30',
                  )}
                >
                  {/* ── Slide number + scene type label ── */}
                  <div className="flex items-center justify-between px-0.5">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          'text-[9px] font-black w-3.5 h-3.5 rounded-full flex items-center justify-center flex-shrink-0',
                          isCurrent
                            ? 'bg-primary text-white shadow-sm shadow-primary/40'
                            : isCompleted
                            ? 'bg-green-500/80 text-white'
                            : isQuiz
                            ? 'bg-amber-400/15 text-amber-400/80'
                            : 'bg-muted/60 text-muted-foreground/50',
                        )}
                      >
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span
                        className={cn(
                          'text-[8px] font-semibold uppercase tracking-[0.14em]',
                          isCurrent
                            ? isQuiz ? 'text-amber-400/80' : 'text-primary/70'
                            : isQuiz
                            ? 'text-amber-400/40'
                            : 'text-muted-foreground/28',
                        )}
                      >
                        {isQuiz ? 'Quiz' : 'Lesson'}
                      </span>
                    </div>

                    {isCompleted && !isCurrent && (
                      <CheckCircle2 className="w-2.5 h-2.5 text-green-400/60 flex-shrink-0" />
                    )}
                  </div>

                  {/* ── 16:9 thumbnail card ── */}
                  <div
                    className={cn(
                      'relative w-full overflow-hidden rounded-md ring-1 transition-all duration-200',
                      isCurrent
                        ? isQuiz
                          ? 'ring-amber-400/45 shadow-md shadow-amber-400/10'
                          : 'ring-primary/45 shadow-md shadow-primary/10'
                        : 'ring-white/8',
                    )}
                    style={{ aspectRatio: '16/9' }}
                  >
                    {isQuiz ? (
                      <QuizSlideThumbnail />
                    ) : (
                      <LessonSlideThumbnail scene={scene} />
                    )}

                    {/* Completed checkmark overlay */}
                    {isCompleted && !isLocked && (
                      <div className="absolute top-1 right-1">
                        <div
                          className="w-3.5 h-3.5 rounded-full flex items-center justify-center"
                          style={{ background: 'hsl(142 72% 35%/0.85)' }}
                        >
                          <CheckCircle2 className="w-2.5 h-2.5 text-green-300" />
                        </div>
                      </div>
                    )}

                    {/* Lock overlay */}
                    {isLocked && (
                      <div className="absolute inset-0 flex items-center justify-center rounded-md bg-black/30">
                        <div
                          className="w-5 h-5 rounded-full flex items-center justify-center"
                          style={{ background: 'hsl(var(--card) / 0.90)' }}
                        >
                          <Lock className="w-2.5 h-2.5 text-muted-foreground/60" />
                        </div>
                      </div>
                    )}

                    {/* Hover overlay */}
                    {!isCurrent && (
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/12 transition-colors duration-150" />
                    )}

                    {/* Active left accent bar (inside thumbnail) */}
                    {isCurrent && (
                      <div
                        className="absolute left-0 inset-y-0 w-[3px] rounded-r-sm"
                        style={{ background: isQuiz ? 'hsl(38 92% 60%)' : 'hsl(245 78% 65%)' }}
                      />
                    )}
                  </div>

                  {/* ── Scene title ── */}
                  <p
                    className={cn(
                      'text-[10px] font-medium leading-snug px-0.5 truncate',
                      isCurrent
                        ? 'text-foreground/90'
                        : isCompleted
                        ? 'text-muted-foreground/50'
                        : 'text-muted-foreground/65',
                    )}
                  >
                    {scene.title}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Drag resize handle (right edge) ── */}
        {!collapsed && (
          <div
            onMouseDown={handleDragStart}
            className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize z-50 group"
          >
            <div className="absolute right-[1px] top-1/2 -translate-y-1/2 w-0.5 h-8 rounded-full bg-border/20 group-hover:bg-primary/40 transition-colors" />
          </div>
        )}
      </div>

      {/* ── Re-open button (when collapsed) ── */}
      {collapsed && (
        <button
          onClick={() => setCollapsed(false)}
          className="hidden lg:flex flex-shrink-0 w-7 flex-col items-center justify-center gap-1 border-r border-border/15 text-muted-foreground/30 hover:text-primary hover:bg-primary/5 transition-colors"
          title="Open slide panel"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      )}
    </>
  );
}
