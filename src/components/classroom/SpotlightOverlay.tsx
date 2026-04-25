/**
 * SpotlightOverlay — full-viewport SVG effect layer
 *
 * Renders spotlight (dim-everything-except-target) and laser (red dot)
 * effects driven by the playback engine's spotlightState / laserState.
 *
 * Mounted inside LessonRenderer but uses position:fixed so it always covers
 * the full viewport regardless of the scroll position of the slide container.
 * pointer-events:none guarantees it never interferes with user interaction.
 *
 * Element targeting: queries `document.getElementById("section-{elementId}")`
 * and converts the resulting getBoundingClientRect() to viewport coordinates.
 * If the element is not found (e.g. not yet revealed), the effect is silently
 * suppressed rather than crashing or rendering a misplaced overlay.
 */

import { useEffect, useState } from 'react';
import type { SpotlightState, LaserState } from '@/lib/playback/types';

interface SpotlightOverlayProps {
  spotlightState: SpotlightState | null;
  laserState: LaserState | null;
}

/** Viewport-relative bounding box in pixels */
interface ViewportRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Query a section element and return its viewport-relative bounding box. */
function measureSection(elementId: string): ViewportRect | null {
  const el = document.getElementById(`section-${elementId}`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return null;
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

/** Padding added around the target element so the cutout isn't flush with the content edge */
const CUTOUT_PADDING = 14; // px

export function SpotlightOverlay({ spotlightState, laserState }: SpotlightOverlayProps) {
  const [vw, setVw] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1280));
  const [vh, setVh] = useState(() => (typeof window !== 'undefined' ? window.innerHeight : 800));
  const [spotRect, setSpotRect] = useState<ViewportRect | null>(null);
  const [laserRect, setLaserRect] = useState<ViewportRect | null>(null);
  const [visible, setVisible] = useState(false);

  // Track viewport dimensions (for window resize)
  useEffect(() => {
    const onResize = () => {
      setVw(window.innerWidth);
      setVh(window.innerHeight);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Measure spotlight target element whenever spotlightState changes.
  // A rAF delay lets the engine's setState flush so the element is painted
  // at its final position before we measure.
  useEffect(() => {
    if (!spotlightState) {
      setSpotRect(null);
      setVisible(false);
      return;
    }
    const raf = requestAnimationFrame(() => {
      const rect = measureSection(spotlightState.elementId);
      setSpotRect(rect);
      setVisible(rect !== null);
    });
    return () => cancelAnimationFrame(raf);
  }, [spotlightState]);

  // Measure laser target element
  useEffect(() => {
    if (!laserState) {
      setLaserRect(null);
      return;
    }
    const raf = requestAnimationFrame(() => {
      setLaserRect(measureSection(laserState.elementId));
    });
    return () => cancelAnimationFrame(raf);
  }, [laserState]);

  // Nothing to render
  if (!spotlightState && !laserState) return null;
  if (!spotRect && !laserRect) return null;

  return (
    <svg
      aria-hidden
      className="fixed inset-0 pointer-events-none"
      style={{
        width: vw,
        height: vh,
        zIndex: 40,
        opacity: visible || laserRect ? 1 : 0,
        transition: 'opacity 200ms ease',
      }}
      viewBox={`0 0 ${vw} ${vh}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {spotRect && (
          <mask id="spotlight-cutout">
            {/*
              White covers the whole viewport → these pixels get the dim overlay.
              The black rect is the cutout — it removes the dim from the target
              element region, letting it appear at full brightness.
            */}
            <rect x={0} y={0} width={vw} height={vh} fill="white" />
            <rect
              x={spotRect.x - CUTOUT_PADDING}
              y={spotRect.y - CUTOUT_PADDING}
              width={spotRect.w + CUTOUT_PADDING * 2}
              height={spotRect.h + CUTOUT_PADDING * 2}
              rx={10}
              fill="black"
            />
          </mask>
        )}
      </defs>

      {/* Spotlight: semi-transparent dark layer with an element-shaped hole */}
      {spotlightState && spotRect && (
        <rect
          x={0}
          y={0}
          width={vw}
          height={vh}
          fill="black"
          fillOpacity={0.55}
          mask="url(#spotlight-cutout)"
        />
      )}

      {/* Laser: pulsing dot centred on the target element */}
      {laserState && laserRect && (
        <circle
          cx={laserRect.x + laserRect.w / 2}
          cy={laserRect.y + laserRect.h / 2}
          r={9}
          fill={laserState.color}
          fillOpacity={0.88}
        />
      )}
    </svg>
  );
}
