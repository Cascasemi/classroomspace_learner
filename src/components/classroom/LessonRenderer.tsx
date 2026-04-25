import { cn } from '@/lib/utils';
import type { ContentSection, MediaTask, SpotlightState, LaserState } from '@/lib/playback/types';
import { Info, AlertTriangle, Lightbulb, CheckCircle, Loader2, ImageOff, Image as ImageIcon } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { FlashCard } from '@/components/classroom/FlashCard';
import { MathPracticePanel } from '@/components/classroom/MathPracticePanel';
import type { MathCheckResult } from '@/components/classroom/MathPracticePanel';
import { KatexMath, renderMathText } from '@/components/ui/katex-math';
import { SpotlightOverlay } from '@/components/classroom/SpotlightOverlay';

interface LessonRendererProps {
  sections: ContentSection[];
  classroomId?: string;
  sceneId?: string;
  /** Display title of the current scene (passed to math-check for context). */
  sceneTitle?: string;
  mediaTasks?: MediaTask[];
  highlightedSectionId: string | null;
  revealedSectionIds: Set<string>;
  /** When true, all sections are visible (no reveal gating) */
  showAll?: boolean;
  /** When true, renders in compact presentation-slide style */
  slideMode?: boolean;
  /** Called when the student submits a math practice answer and receives a grade. */
  onMathPracticeResult?: (result: MathCheckResult) => void;
  /** Subject ID for Tier 3 diagnostic feedback (flashcard/quiz results). */
  subjectId?: string;
  /** Strand / scene title for Tier 3 feedback routing. */
  strandName?: string;
  /** Active spotlight effect from the playback engine — null when not showing */
  spotlightState?: SpotlightState | null;
  /** Active laser pointer effect from the playback engine — null when not showing */
  laserState?: LaserState | null;
}

export default function LessonRenderer({
  sections,
  classroomId,
  sceneId,
  sceneTitle,
  mediaTasks,
  highlightedSectionId,
  revealedSectionIds,
  showAll = false,
  slideMode = false,
  onMathPracticeResult,
  subjectId,
  strandName,
  spotlightState = null,
  laserState = null,
}: LessonRendererProps) {
  return (
    <>
      <SpotlightOverlay spotlightState={spotlightState} laserState={laserState} />
      <div className={cn(slideMode ? 'space-y-4' : 'space-y-5 max-w-3xl mx-auto')}>
      {sections.map((section) => {
        const isVisible = showAll || revealedSectionIds.has(section.id);
        const isHighlighted = highlightedSectionId === section.id;

        return (
          <div
            key={section.id}
            id={`section-${section.id}`}
            className={cn(
              'transition-all duration-500',
              isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none h-0 overflow-hidden',
              isHighlighted && 'ring-2 ring-primary/50 rounded-xl shadow-lg shadow-primary/10',
            )}
          >
            <SectionContent
              section={section}
              classroomId={classroomId}
              sceneId={sceneId}
              sceneTitle={sceneTitle}
              slideMode={slideMode}
              mediaTasks={mediaTasks}
              onMathPracticeResult={onMathPracticeResult}
              subjectId={subjectId}
              strandName={strandName}
            />
          </div>
        );
      })}
    </div>
    </>
  );
}

function SectionContent({
  section,
  classroomId,
  sceneId,
  sceneTitle,
  slideMode = false,
  mediaTasks,
  onMathPracticeResult,
  subjectId,
  strandName,
}: {
  section: ContentSection;
  classroomId?: string;
  sceneId?: string;
  sceneTitle?: string;
  slideMode?: boolean;
  mediaTasks?: MediaTask[];
  onMathPracticeResult?: (result: MathCheckResult) => void;
  subjectId?: string;
  strandName?: string;
}) {
  switch (section.type) {
    case 'heading':
      return <HeadingSection section={section} slideMode={slideMode} />;
    case 'text':
      return <TextSection section={section} slideMode={slideMode} />;
    case 'callout':
      return <CalloutSection section={section} slideMode={slideMode} />;
    case 'formula':
      return <FormulaSection section={section} slideMode={slideMode} />;
    case 'list':
      return <ListSection section={section} slideMode={slideMode} />;
    case 'definition':
      return <DefinitionSection section={section} />;
    case 'example':
      return <ExampleSection section={section} slideMode={slideMode} />;
    case 'code':
      return <CodeSection section={section} slideMode={slideMode} />;
    case 'image_placeholder':
      return <ImagePlaceholder section={section} sceneId={sceneId} mediaTasks={mediaTasks} />;
    case 'flashcard':
      return (
        <FlashCard
          key={`${sceneId ?? 'scene'}:${section.id}`}
          section={section}
          classroomId={classroomId}
          sceneId={sceneId}
          slideMode={slideMode}
          subjectId={subjectId}
          strandName={strandName}
        />
      );
    case 'math_practice':
      return (
        <MathPracticePanel
          key={`${sceneId ?? 'scene'}:${section.id}`}
          section={section}
          sceneTitle={sceneTitle}
          onResult={onMathPracticeResult}
        />
      );
    default:
      return <TextSection section={section} slideMode={slideMode} />;
  }
}

// renderInlineRichText is now an alias for the full math-aware renderer
const renderInlineRichText = renderMathText;

// ==================== Section Renderers ====================

function HeadingSection({ section, slideMode = false }: { section: ContentSection; slideMode?: boolean }) {
  const level = section.level || 1;
  const Tag = level === 1 ? 'h2' : level === 2 ? 'h3' : 'h4';

  if (level === 1) {
    return (
      <div className={cn('space-y-1', slideMode && 'text-center')}>
        <div className={cn('flex items-center gap-2', slideMode && 'justify-center')}>
          <div className={cn('h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent', slideMode ? 'w-12' : 'hidden')} />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary/60">Chapter</span>
          <div className={cn('h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent', slideMode ? 'w-12' : 'flex-1 from-primary/20 to-transparent')} />
        </div>
        <Tag className={cn(
          'font-bold text-foreground leading-tight',
          slideMode ? 'text-3xl md:text-4xl' : 'text-2xl md:text-3xl',
        )}>
          {renderInlineRichText(section.content)}
        </Tag>
      </div>
    );
  }

  return (
    <Tag
      className={cn(
        level === 2
          ? slideMode ? 'text-2xl md:text-[1.6rem] font-semibold' : 'text-xl md:text-2xl font-semibold'
          : slideMode ? 'text-xl md:text-2xl font-medium' : 'text-lg md:text-xl font-medium',
        'text-foreground leading-snug',
      )}
    >
      {level === 2 && <span className="text-primary mr-2 font-bold">§</span>}
      {renderInlineRichText(section.content)}
    </Tag>
  );
}

function TextSection({ section, slideMode = false }: { section: ContentSection; slideMode?: boolean }) {
  return (
    <p className={cn(
      'leading-[1.75] text-muted-foreground/90 whitespace-pre-line',
      slideMode ? 'text-base md:text-[1.05rem]' : 'text-[15px]',
    )}>
      {renderInlineRichText(section.content)}
    </p>
  );
}

const CALLOUT_VARIANTS: Record<string, { icon: React.ReactNode; accent: string; bg: string; label: string }> = {
  info: {
    icon: <Info className="w-4 h-4" />,
    accent: 'border-blue-500/50 shadow-blue-500/5',
    bg: 'bg-blue-500/5',
    label: 'Note',
  },
  warning: {
    icon: <AlertTriangle className="w-4 h-4" />,
    accent: 'border-amber-500/50 shadow-amber-500/5',
    bg: 'bg-amber-500/5',
    label: 'Warning',
  },
  tip: {
    icon: <Lightbulb className="w-4 h-4" />,
    accent: 'border-emerald-500/50 shadow-emerald-500/5',
    bg: 'bg-emerald-500/5',
    label: 'Tip',
  },
  success: {
    icon: <CheckCircle className="w-4 h-4" />,
    accent: 'border-green-500/50 shadow-green-500/5',
    bg: 'bg-green-500/5',
    label: 'Success',
  },
};

const CALLOUT_ICON_COLORS: Record<string, string> = {
  info: 'text-blue-400 bg-blue-500/10',
  warning: 'text-amber-400 bg-amber-500/10',
  tip: 'text-emerald-400 bg-emerald-500/10',
  success: 'text-green-400 bg-green-500/10',
};

function CalloutSection({ section, slideMode = false }: { section: ContentSection; slideMode?: boolean }) {
  const key = section.variant || 'info';
  const v = CALLOUT_VARIANTS[key] ?? CALLOUT_VARIANTS.info;
  const iconColor = CALLOUT_ICON_COLORS[key] ?? CALLOUT_ICON_COLORS.info;

  return (
    <div className={cn('rounded-xl border shadow-sm overflow-hidden', v.accent, v.bg)}>
      <div className={cn('flex items-start gap-3', slideMode ? 'px-5 py-4' : 'px-4 py-3')}>
        <div className={cn('flex-shrink-0 rounded-lg flex items-center justify-center mt-0.5', iconColor, slideMode ? 'w-8 h-8' : 'w-7 h-7')}>
          {v.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] mb-1 text-foreground/50">{v.label}</div>
          <div className={cn('leading-relaxed text-foreground/80', slideMode ? 'text-[15px]' : 'text-[14px]')}>
            {renderInlineRichText(section.content)}
          </div>
        </div>
      </div>
    </div>
  );
}

function FormulaSection({ section, slideMode = false }: { section: ContentSection; slideMode?: boolean }) {
  const mathSrc = section.latex || section.content || '';
  return (
    <div
      className="rounded-xl border border-primary/20 overflow-hidden"
      style={{ background: 'linear-gradient(135deg, hsl(245 78% 60% / 0.06) 0%, transparent 100%)' }}
    >
      <div className="px-2 py-1.5 border-b border-primary/10 flex items-center gap-1.5">
        <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-primary/50">∑ Formula</span>
      </div>
      <div className={cn('text-center text-foreground overflow-x-auto', slideMode ? 'p-6 md:p-8' : 'p-5')}>
        <KatexMath
          math={mathSrc}
          displayMode
          className={cn(
            '[&_.katex]:!text-foreground',
            slideMode ? 'text-2xl' : 'text-xl',
          )}
        />
        {section.content && section.latex && (
          <p className="text-xs text-muted-foreground/60 mt-3 border-t border-primary/10 pt-3">
            {renderInlineRichText(section.content)}
          </p>
        )}
      </div>
    </div>
  );
}

function ListSection({ section, slideMode = false }: { section: ContentSection; slideMode?: boolean }) {
  return (
    <ul className={cn('pl-1', slideMode ? 'space-y-3' : 'space-y-2.5')}>
      {section.items?.map((item, i) => (
        <li key={i} className={cn('flex gap-3', slideMode ? 'text-base' : 'text-[15px]')}>
          <span
            className={cn(
              'flex-shrink-0 rounded-full font-bold flex items-center justify-center mt-0.5',
              slideMode ? 'w-7 h-7 text-[12px]' : 'w-6 h-6 text-[11px]',
            )}
            style={{ background: 'hsl(245 78% 60% / 0.12)', color: 'hsl(245 78% 70%)' }}
          >
            {i + 1}
          </span>
          <span className="text-muted-foreground/85 leading-[1.7]">{renderInlineRichText(item)}</span>
        </li>
      ))}
    </ul>
  );
}

function DefinitionSection({ section }: { section: ContentSection }) {
  return (
    <div
      className="relative pl-5 pr-4 py-4 rounded-r-xl border-l-[3px]"
      style={{
        borderColor: 'hsl(245 78% 60% / 0.5)',
        background: 'linear-gradient(90deg, hsl(245 78% 60% / 0.06) 0%, transparent 60%)',
      }}
    >
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary/60 mb-1.5">Definition</div>
      <dt className="font-semibold text-foreground text-[15px] mb-1">{renderInlineRichText(section.term)}</dt>
      <dd className="text-[14px] text-muted-foreground/80 leading-relaxed">{renderInlineRichText(section.definition)}</dd>
    </div>
  );
}

function ExampleSection({ section, slideMode = false }: { section: ContentSection; slideMode?: boolean }) {
  return (
    <div className="rounded-xl border border-border/20 overflow-hidden" style={{ background: 'hsl(var(--card))' }}>
      <div className="px-4 py-2 border-b border-border/15 flex items-center gap-2">
        <div className="flex gap-1">
          <span className="w-2 h-2 rounded-full bg-red-400/50" />
          <span className="w-2 h-2 rounded-full bg-amber-400/50" />
          <span className="w-2 h-2 rounded-full bg-green-400/50" />
        </div>
        <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground/40">Example</span>
      </div>
      <div className={cn('text-muted-foreground/80 leading-relaxed', slideMode ? 'px-5 py-4 text-[15px]' : 'px-4 py-3.5 text-[14px]')}>
        {renderInlineRichText(section.content)}
      </div>
    </div>
  );
}

function CodeSection({ section, slideMode = false }: { section: ContentSection; slideMode?: boolean }) {
  return (
    <div className="rounded-xl overflow-hidden border border-border/20" style={{ background: 'hsl(220 15% 10%)' }}>
      {/* Title bar */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/15">
        <div className="flex gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-red-400/60" />
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400/60" />
          <span className="w-2.5 h-2.5 rounded-full bg-green-400/60" />
        </div>
        {section.language && (
          <span className="ml-2 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/40">
            {section.language}
          </span>
        )}
      </div>
      <pre className={cn('overflow-x-auto text-emerald-300/80 font-mono leading-[1.65]', slideMode ? 'p-5 text-[13.5px]' : 'p-4 text-[13px]')}>
        <code>{section.content}</code>
      </pre>
    </div>
  );
}

function resolveMediaState(section: ContentSection, mediaTasks?: MediaTask[], sceneId?: string) {
  const task = (section.mediaElementId
    ? mediaTasks?.find((entry) => entry.elementId === section.mediaElementId)
    : undefined)
    || (sceneId
      ? mediaTasks?.find((entry) => entry.sceneId === sceneId && entry.sectionId === section.id)
      : undefined);
  const isPlaceholderUrl = typeof section.imageUrl === 'string' && section.imageUrl.startsWith('media://');
  const imageUrl = task?.imageUrl || (!isPlaceholderUrl ? section.imageUrl : undefined);
  const status = task?.status || section.mediaStatus || (imageUrl ? 'done' : 'pending');

  return {
    task,
    imageUrl,
    status,
  } as const;
}

function ImagePlaceholder({
  section,
  sceneId,
  mediaTasks,
}: {
  section: ContentSection;
  sceneId?: string;
  mediaTasks?: MediaTask[];
}) {
  const { task, imageUrl, status } = resolveMediaState(section, mediaTasks, sceneId);
  const slotLabel = section.mediaSlot || task?.slot || 'supporting';
  // Track whether the <img> returned a load error (e.g. 404 after server restart
  // cleared the cache). Falls through to the placeholder UI until images regenerate.
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [imageUrl]);

  return (
    <div
      className="rounded-xl border border-primary/15 overflow-hidden"
      style={{ background: 'hsl(245 78% 60% / 0.03)' }}
    >
      {imageUrl && !imgError ? (
        <img
          src={imageUrl}
          alt={section.caption || section.content || 'Lesson visual'}
          className="w-full aspect-video object-cover"
          onError={() => setImgError(true)}
        />
      ) : status === 'failed' ? (
        <div className="flex aspect-video flex-col items-center justify-center gap-3 px-6 text-center">
          <ImageOff className="h-10 w-10 text-destructive/60" />
          <div>
            <div className="text-sm font-semibold text-foreground/85">Visual unavailable</div>
            <div className="mt-1 text-xs text-muted-foreground/70">{task?.error || 'The image could not be generated for this section.'}</div>
          </div>
        </div>
      ) : status === 'disabled' ? (
        <div className="flex aspect-video flex-col items-center justify-center gap-3 px-6 text-center">
          <ImageOff className="h-10 w-10 text-muted-foreground/40" />
          <div>
            <div className="text-sm font-semibold text-foreground/80">Visual skipped</div>
            <div className="mt-1 text-xs text-muted-foreground/70">Image generation is disabled for this classroom.</div>
          </div>
        </div>
      ) : (
        <div className="flex aspect-video flex-col items-center justify-center gap-3 px-6 text-center">
          {status === 'generating' ? (
            <Loader2 className="h-10 w-10 animate-spin text-primary/70" />
          ) : (
            <ImageIcon className="h-10 w-10 text-primary/35" />
          )}
          <div>
            <div className="text-sm font-semibold text-foreground/85">
              {status === 'generating' ? 'Generating visual…' : 'Visual planned'}
            </div>
            <div className="mt-1 text-xs text-muted-foreground/70">
              {task?.prompt || section.imagePrompt || 'A classroom illustration will appear here when ready.'}
            </div>
          </div>
        </div>
      )}
      <div className="px-4 py-3 border-t border-primary/10 bg-black/10">
        <div className="flex items-center justify-between gap-3 mb-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/55">Visual focus</div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary/45">{slotLabel}</div>
        </div>
        <div className="text-[13px] text-muted-foreground/85 leading-relaxed">
          {renderInlineRichText(section.caption || section.content || 'Image')}
        </div>
      </div>
    </div>
  );
}
