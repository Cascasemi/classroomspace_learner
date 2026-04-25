/**
 * KaTeX Math — NeuroSpace
 *
 * Provides:
 *  - <KatexMath>  — renders a single LaTeX string (inline or display mode)
 *  - renderMathText()  — parses mixed text containing $inline$ / $$display$$ / **bold**
 *    and returns a ReactNode array that can be dropped anywhere in the UI.
 */

import { useMemo, type ReactNode } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { cn } from '@/lib/utils';

// ─── KatexMath Component ──────────────────────────────────────────────────────

export interface KatexMathProps {
  /** The LaTeX source string (do NOT include outer $ delimiters) */
  math: string;
  /** true → \displaystyle block; false (default) → inline */
  displayMode?: boolean;
  className?: string;
}

/**
 * Renders a single LaTeX expression using KaTeX.
 * Falls back to the raw string if KaTeX cannot parse it.
 *
 * Uses `dangerouslySetInnerHTML` with trust:false so KaTeX HTML
 * is sandboxed — arbitrary HTML injection is not possible.
 */
export function KatexMath({ math, displayMode = false, className }: KatexMathProps) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(math, {
        throwOnError: false,
        displayMode,
        output: 'html',
        trust: false,
      });
    } catch {
      return math;
    }
  }, [math, displayMode]);

  return (
    <span
      className={cn(
        // force correct font color on dark and light backgrounds
        '[&_.katex]:text-inherit [&_.katex-display]:text-inherit',
        displayMode ? 'block my-2' : 'inline',
        className,
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

// ─── renderMathText ───────────────────────────────────────────────────────────

/**
 * Parses a string that may contain:
 *   $$...$$   → display-mode KaTeX block
 *   $...$     → inline KaTeX
 *   **...**   → bold text
 *   __...__   → bold text (normalised to **)
 *
 * Returns a `ReactNode` that can be rendered directly in JSX.
 *
 * @example
 * // In a component:
 * <p>{renderMathText("The area is $\\pi r^2$, where **r** is the radius.")}</p>
 */
export function renderMathText(text?: string): ReactNode {
  if (!text) return null;

  // Normalise __bold__ → **bold**
  const normalized = text.replace(/__(.*?)__/gs, '**$1**');

  // Match $$ ... $$, $ ... $, or ** ... ** (in priority order, longest first)
  const TOKEN = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|\*\*[^*]+\*\*)/g;
  const parts = normalized.split(TOKEN).filter(Boolean);

  return parts.map((part, idx) => {
    // $$display$$
    if (part.startsWith('$$') && part.endsWith('$$')) {
      const latex = part.slice(2, -2).trim();
      return (
        <KatexMath key={idx} math={latex} displayMode className="text-foreground" />
      );
    }
    // $inline$
    if (part.startsWith('$') && part.endsWith('$') && part.length > 2) {
      const latex = part.slice(1, -1).trim();
      return <KatexMath key={idx} math={latex} />;
    }
    // **bold**
    const boldMatch = part.match(/^\*\*(.+)\*\*$/s);
    if (boldMatch) {
      return (
        <strong key={idx} className="font-semibold text-foreground">
          {boldMatch[1]}
        </strong>
      );
    }
    // plain text
    return <span key={idx}>{part.replace(/\*\*/g, '')}</span>;
  });
}
