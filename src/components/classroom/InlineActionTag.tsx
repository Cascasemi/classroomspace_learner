/**
 * InlineActionTag — tiny typed badge for action events in lecture notes
 *
 * Shows a colour-coded pill for every action type rendered inside the
 * LectureNotesPanel (spotlight, laser, discussion, whiteboard family).
 * No framer-motion — pure Tailwind + CSS.
 */

import { cn } from '@/lib/utils';
import {
  Flashlight,
  MousePointer2,
  MessageSquare,
  BarChart3,
  Sigma,
  Table2,
  Type,
  Shapes,
  PanelLeftOpen,
  PanelLeftClose,
  Eraser,
  Trash2,
  Minus,
  PenLine,
  Play,
  Zap,
  Loader2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// ── Style tokens ──────────────────────────────────────────────────────────────

const WB_STYLE =
  'bg-violet-500/10 border-violet-500/25 text-violet-600 dark:text-violet-300';
const WB_ACCENT = 'bg-violet-500';

const SPOTLIGHT_STYLE =
  'bg-yellow-500/10 border-yellow-500/25 text-yellow-600 dark:text-yellow-300';
const LASER_STYLE =
  'bg-red-500/10 border-red-500/25 text-red-600 dark:text-red-300';
const DISCUSS_STYLE =
  'bg-amber-500/10 border-amber-500/25 text-amber-600 dark:text-amber-300';
const DEFAULT_STYLE =
  'bg-muted/30 border-border/30 text-muted-foreground/60';

// ── Action config map ─────────────────────────────────────────────────────────

interface ActionCfg {
  label: string;
  Icon: LucideIcon;
  style: string;
  wb?: boolean;
}

const ACTION_CONFIG: Record<string, ActionCfg> = {
  // Slide effects
  spotlight:     { label: 'Spotlight', Icon: Flashlight,    style: SPOTLIGHT_STYLE },
  laser:         { label: 'Laser',     Icon: MousePointer2, style: LASER_STYLE     },
  play_video:    { label: 'Video',     Icon: Play,          style: SPOTLIGHT_STYLE },

  // Discussion
  discussion:    { label: 'Discuss',   Icon: MessageSquare, style: DISCUSS_STYLE   },

  // Whiteboard lifecycle
  wb_open:       { label: 'Open',      Icon: PanelLeftOpen,  style: WB_STYLE, wb: true },
  wb_close:      { label: 'Close',     Icon: PanelLeftClose, style: WB_STYLE, wb: true },
  wb_clear:      { label: 'Clear',     Icon: Eraser,         style: WB_STYLE, wb: true },
  wb_delete:     { label: 'Delete',    Icon: Trash2,         style: WB_STYLE, wb: true },

  // Whiteboard drawing
  wb_draw_text:  { label: 'Text',    Icon: Type,      style: WB_STYLE, wb: true },
  wb_draw_shape: { label: 'Shape',   Icon: Shapes,    style: WB_STYLE, wb: true },
  wb_draw_chart: { label: 'Chart',   Icon: BarChart3, style: WB_STYLE, wb: true },
  wb_draw_latex: { label: 'Formula', Icon: Sigma,     style: WB_STYLE, wb: true },
  wb_draw_table: { label: 'Table',   Icon: Table2,    style: WB_STYLE, wb: true },
  wb_draw_line:  { label: 'Line',    Icon: Minus,     style: WB_STYLE, wb: true },
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface InlineActionTagProps {
  /** Action type string, e.g. 'spotlight', 'discussion', 'wb_draw_chart' */
  actionType: string;
  /** Optional label override */
  label?: string;
  /** Shows a spinning loader inside the tag (running action) */
  running?: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function InlineActionTag({ actionType, label, running = false }: InlineActionTagProps) {
  const cfg = ACTION_CONFIG[actionType];
  const Icon = cfg?.Icon ?? Zap;
  const displayLabel = label ?? cfg?.label ?? actionType;
  const style = cfg?.style ?? DEFAULT_STYLE;
  const isWb = cfg?.wb ?? false;

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border align-middle leading-none whitespace-nowrap',
        'text-[9px] font-bold tracking-wide uppercase',
        isWb ? 'pl-0.5 pr-1.5 py-px' : 'px-1.5 py-px',
        style,
        running && 'animate-pulse',
      )}
    >
      {/* Whiteboard accent chip — tiny PenLine pill on the left */}
      {isWb && (
        <span
          className={cn(
            'inline-flex items-center justify-center rounded-full mr-0.5 w-3 h-3 shrink-0',
            WB_ACCENT,
          )}
        >
          <PenLine className="w-[7px] h-[7px] text-white" strokeWidth={2.5} />
        </span>
      )}

      {/* Icon */}
      {running ? (
        <Loader2 className="w-2.5 h-2.5 animate-spin shrink-0 mr-0.5" />
      ) : (
        <Icon className="w-2.5 h-2.5 shrink-0 mr-0.5" />
      )}

      {displayLabel}
    </span>
  );
}
