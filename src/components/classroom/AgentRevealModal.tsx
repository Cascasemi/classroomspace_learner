/**
 * AgentRevealModal â€” OpenClass Learner holographic agent emergence modal
 *
 * Design language: agents materialize from glowing energy cores.
 * Slide-up emergence with staggered timing, per-agent aurora glow,
 * frosted glass cards.
 *
 * CSS-only animations (no framer-motion â€” OpenClass Learner policy).
 */

import { useEffect, useState, useRef } from 'react';
import { cn } from '@/lib/utils';
import type { AgentConfig } from '@/lib/playback/types';

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function isImageAvatar(s: string) {
  return s.startsWith('/') || s.startsWith('http') || s.startsWith('data:');
}

const ROLE_META: Record<string, { label: string; glyph: string; hue: number }> = {
  teacher:   { label: 'Lead Teacher',  glyph: 'âš¡', hue: 245 },
  assistant: { label: 'Assistant',     glyph: 'ðŸŒ¿', hue: 160 },
  student:   { label: 'Student',       glyph: 'ðŸ”®', hue: 40  },
};

// â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface AgentRevealModalProps {
  agents: AgentConfig[];
  open: boolean;
  onClose: () => void;
  onAllRevealed?: () => void;
}

// â”€â”€ Single agent card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function AgentCard({
  agent,
  index,
  emerged,
}: {
  agent: AgentConfig;
  index: number;
  emerged: boolean;
}) {
  const color = agent.color ?? '#6366f1';
  const isImg = isImageAvatar(agent.avatar);
  const meta = ROLE_META[agent.role] ?? { label: agent.role, glyph: 'âœ¦', hue: 245 };

  return (
    <div
      className="relative flex-shrink-0 w-44"
      style={{
        opacity: emerged ? 1 : 0,
        transform: emerged ? 'translateY(0) scale(1)' : 'translateY(40px) scale(0.88)',
        transition: `opacity 0.6s cubic-bezier(0.23,1,0.32,1) ${index * 0}ms, transform 0.6s cubic-bezier(0.23,1,0.32,1) ${index * 0}ms`,
      }}
    >
      {/* Outer glow halo */}
      <div
        className="absolute -inset-2 rounded-3xl blur-xl opacity-25 pointer-events-none"
        style={{ background: color }}
      />

      {/* Card */}
      <div
        className="relative rounded-2xl overflow-hidden border"
        style={{
          borderColor: `${color}35`,
          background: `linear-gradient(160deg, hsl(var(--card) / 0.95) 0%, hsl(var(--card) / 0.98) 100%)`,
          backdropFilter: 'blur(20px)',
        }}
      >
        {/* Top aurora strip */}
        <div
          className="h-20 w-full relative overflow-hidden"
          style={{
            background: `linear-gradient(160deg, ${color}22 0%, ${color}08 60%, transparent 100%)`,
          }}
        >
          {/* Corner mesh lines */}
          <svg className="absolute inset-0 w-full h-full opacity-[0.05]" aria-hidden>
            <defs>
              <pattern id={`grid-${agent.id}`} width="16" height="16" patternUnits="userSpaceOnUse">
                <path d="M 16 0 L 0 0 0 16" fill="none" stroke="white" strokeWidth="0.5"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill={`url(#grid-${agent.id})`}/>
          </svg>

          {/* Role glyph top-right */}
          <span
            className="absolute top-2.5 right-3 text-lg opacity-40"
            style={{ filter: `drop-shadow(0 0 4px ${color})` }}
          >
            {meta.glyph}
          </span>
        </div>

        {/* Avatar â€” overlaps top strip */}
        <div className="relative -mt-8 flex justify-center">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center overflow-hidden relative"
            style={{
              border: `2px solid ${color}60`,
              background: 'hsl(var(--card))',
              boxShadow: `0 0 0 4px ${color}14, 0 6px 20px ${color}35`,
            }}
          >
            {isImg ? (
              <img src={agent.avatar} alt={agent.name} className="w-full h-full object-cover" />
            ) : (
              <span className="text-2xl font-bold" style={{ color }}>
                {agent.name[0]}
              </span>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="px-4 pb-4 pt-2 space-y-1.5">
          {/* Name */}
          <h3
            className="text-sm font-bold text-center leading-tight truncate"
            style={{ color }}
          >
            {agent.name}
          </h3>

          {/* Role badge */}
          <div className="flex justify-center">
            <span
              className="inline-flex items-center gap-1 px-2.5 py-[3px] rounded-full text-[9px] font-bold uppercase tracking-wider"
              style={{
                background: `${color}14`,
                color: `${color}`,
                border: `1px solid ${color}25`,
              }}
            >
              {meta.label}
            </span>
          </div>

          {/* Divider */}
          <div
            className="h-px mx-1 my-2"
            style={{ background: `linear-gradient(to right, transparent, ${color}30, transparent)` }}
          />

          {/* Persona excerpt */}
          <p className="text-[10px] leading-[1.6] text-foreground/40 text-center line-clamp-3">
            {agent.persona?.split('.')[0] ?? meta.label}
          </p>
        </div>
      </div>
    </div>
  );
}

// â”€â”€ Aurora background strips â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function AuroraStrips() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      <div
        className="absolute inset-x-0 top-0 h-[45%] opacity-[0.07]"
        style={{
          background: 'conic-gradient(from 200deg at 50% -20%, hsl(245 78% 65%) 0deg, hsl(285 70% 60%) 60deg, hsl(210 78% 65%) 120deg, transparent 180deg)',
          filter: 'blur(32px)',
        }}
      />
      <div
        className="absolute inset-x-0 bottom-0 h-[30%] opacity-[0.05]"
        style={{
          background: 'conic-gradient(from 20deg at 50% 130%, hsl(285 70% 60%) 0deg, hsl(245 78% 55%) 90deg, transparent 150deg)',
          filter: 'blur(24px)',
        }}
      />
    </div>
  );
}

// â”€â”€ Main component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function AgentRevealModal({
  agents,
  open,
  onClose,
  onAllRevealed,
}: AgentRevealModalProps) {
  const [visible, setVisible] = useState(false);
  const [emergedCount, setEmergedCount] = useState(0);
  const onAllRevealedRef = useRef(onAllRevealed);
  onAllRevealedRef.current = onAllRevealed;
  const firedRef = useRef(false);

  // Fade in backdrop
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
      setEmergedCount(0);
      firedRef.current = false;
    }
  }, [open]);

  // Staggered agent emergence
  useEffect(() => {
    if (!open || agents.length === 0) return;
    let cancelled = false;

    const timers: ReturnType<typeof setTimeout>[] = [];

    agents.forEach((_, i) => {
      const t = setTimeout(() => {
        if (cancelled) return;
        setEmergedCount((c) => {
          const next = c + 1;
          if (next >= agents.length) {
            setTimeout(() => {
              if (!firedRef.current && !cancelled) {
                firedRef.current = true;
                onAllRevealedRef.current?.();
              }
            }, 600);
          }
          return next;
        });
      }, 350 + i * 480);
      timers.push(t);
    });

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [open, agents.length]);

  const allEmerged = emergedCount >= agents.length && agents.length > 0;

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center"
      style={{
        background: 'hsl(var(--background) / 0.94)',
        backdropFilter: 'blur(20px)',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.4s ease',
      }}
    >
      <AuroraStrips />

      {/* â”€â”€ Content â”€â”€ */}
      <div className="relative z-10 flex flex-col items-center gap-8 px-6 max-w-3xl w-full">

        {/* Header */}
        <div
          className="text-center space-y-1 transition-all duration-700"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateY(0)' : 'translateY(-12px)',
          }}
        >
          {/* OpenClass Learner wordmark line */}
          <div className="flex items-center justify-center gap-2 mb-3">
            <div
              className="w-1 h-1 rounded-full"
              style={{ background: 'hsl(245 78% 68%)', boxShadow: '0 0 8px hsl(245 78% 68%)' }}
            />
            <span className="text-[10px] font-bold tracking-[0.25em] uppercase text-primary/50">
              OpenClass Learner
            </span>
            <div
              className="w-1 h-1 rounded-full"
              style={{ background: 'hsl(285 70% 65%)', boxShadow: '0 0 8px hsl(285 70% 65%)' }}
            />
          </div>

          <h2 className="text-2xl font-bold text-foreground">
            Your Classroom is Ready
          </h2>
          <p className="text-[13px] text-muted-foreground/60">
            Meet the team that will guide your learning journey
          </p>
        </div>

        {/* Agent cards */}
        <div className="flex flex-wrap justify-center gap-3 w-full">
          {agents.map((agent, i) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              index={i}
              emerged={i < emergedCount}
            />
          ))}
        </div>

        {/* Progress indicator */}
        <div className="flex items-center gap-2">
          {agents.map((_, i) => (
            <div
              key={i}
              className="rounded-full transition-all duration-500"
              style={{
                width: i < emergedCount ? 20 : 6,
                height: 6,
                background: i < emergedCount
                  ? 'linear-gradient(90deg, hsl(245 78% 65%), hsl(285 70% 60%))'
                  : 'hsl(0 0% 100% / 0.12)',
                boxShadow: i < emergedCount ? '0 0 8px hsl(265 75% 55% / 0.5)' : 'none',
              }}
            />
          ))}
        </div>

        {/* Enter button â€” appears after all agents emerge */}
        <div
          className="transition-all duration-500"
          style={{
            opacity: allEmerged ? 1 : 0,
            transform: allEmerged ? 'translateY(0) scale(1)' : 'translateY(8px) scale(0.95)',
            pointerEvents: allEmerged ? 'auto' : 'none',
          }}
        >
          <button
            onClick={onClose}
            className="group relative overflow-hidden rounded-full px-8 py-3 text-sm font-bold text-white transition-transform active:scale-95"
            style={{
              background: 'linear-gradient(135deg, hsl(245 78% 55%) 0%, hsl(285 72% 58%) 50%, hsl(305 80% 62%) 100%)',
              boxShadow: '0 0 32px hsl(265 75% 50% / 0.45), 0 4px 16px hsl(245 78% 35% / 0.4)',
            }}
          >
            {/* Shimmer */}
            <span
              className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
              style={{
                background: 'linear-gradient(105deg, transparent 30%, white 50%, transparent 70%)',
                backgroundSize: '200% 100%',
                animation: 'ns-shimmer 1.8s linear infinite',
              }}
            />
            <span className="relative">Enter Classroom â†’</span>
          </button>
        </div>

      </div>

      {/* Keyframes */}
      <style>{`
        @keyframes ns-shimmer {
          0%   { background-position: -100% 0; opacity: 0.15; }
          50%  { opacity: 0.15; }
          100% { background-position: 200% 0; opacity: 0.15; }
        }
      `}</style>
    </div>
  );
}
