/**
 * GenerationProgressScreen � NeuroSpace generation loading experience
 *
 * Full-page immersive loading UI while the AI pipeline runs.
 * Design language: "neural network coming alive" � nodes pulse, beams of
 * light sweep, agents fade in one by one from glowing orbs.
 *
 * Pipeline stages:
 *   0-12   Reading source material / preparing context
 *   12-30  Building lesson outline
 *   30-92  Generating opening scenes + background scenes
 *   60+    Classroom can open while the rest continues in background
 *   100    Done
 */

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import type { AgentConfig } from '@/lib/playback/types';

// -- Helpers -------------------------------------------------------------------

function isImageAvatar(s: string) {
  return s.startsWith('/') || s.startsWith('http') || s.startsWith('data:');
}

type StepStatus = 'waiting' | 'active' | 'done';

interface PipelineStep {
  id: string;
  label: string;
  emoji: string;
  startAt: number;
  doneAt: number;
}

const BASE_PIPELINE_STEPS: Omit<PipelineStep, 'label' | 'emoji'>[] = [
  { id: 'source',    startAt: 0,  doneAt: 12  },
  { id: 'outline',   startAt: 12, doneAt: 30  },
  { id: 'content',   startAt: 30, doneAt: 60  },
  { id: 'classroom', startAt: 60, doneAt: 100 },
];

function buildPipelineSteps(hasPdf: boolean): PipelineStep[] {
  return [
    { ...BASE_PIPELINE_STEPS[0], label: hasPdf ? 'Reading your source material' : 'Analysing your topic', emoji: hasPdf ? '📘' : '🔍' },
    { ...BASE_PIPELINE_STEPS[1], label: 'Building the lesson outline',  emoji: '🧭' },
    { ...BASE_PIPELINE_STEPS[2], label: 'Generating opening scenes',    emoji: '✨' },
    { ...BASE_PIPELINE_STEPS[3], label: 'Opening the classroom',        emoji: '🚪' },
  ];
}

function getStepStatus(step: PipelineStep, progress: number): StepStatus {
  if (progress >= step.doneAt) return 'done';
  if (progress >= step.startAt) return 'active';
  return 'waiting';
}

// -- Step row ------------------------------------------------------------------

function StepRow({
  step,
  status,
  sceneLabel,
}: {
  step: PipelineStep;
  status: StepStatus;
  sceneLabel?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-2.5 rounded-xl border transition-all duration-500',
        status === 'waiting' && 'border-transparent opacity-30',
        status === 'active'  && 'border-primary/20 bg-primary/[0.06]',
        status === 'done'    && 'border-transparent opacity-55',
      )}
    >
      <span className="flex-shrink-0 text-[15px] leading-none">
        {status === 'done' ? '?' : step.emoji}
      </span>
      <span
        className={cn(
          'flex-1 text-[13px] font-medium',
          status === 'active' ? 'text-foreground' : 'text-foreground/60',
        )}
      >
        {(step.id === 'content' || step.id === 'classroom') && sceneLabel
          ? `${step.label} (${sceneLabel})`
          : step.label}
      </span>
      {status === 'active' && (
        <span className="flex items-center gap-[3px]">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-1 h-1 rounded-full bg-primary/60 animate-pulse"
              style={{ animationDelay: `${i * 200}ms` }}
            />
          ))}
        </span>
      )}
      {status === 'done' && (
        <span className="text-[10px] font-bold tracking-widest text-emerald-400/70">DONE</span>
      )}
    </div>
  );
}

// -- Agent pill ----------------------------------------------------------------

function AgentPill({ agent, delay }: { agent: AgentConfig; delay: number }) {
  const [visible, setVisible] = useState(false);
  const color = agent.color ?? '#6366f1';
  const isImg = isImageAvatar(agent.avatar);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  const roleClass: Record<string, string> = {
    teacher:   'bg-blue-500/10 text-blue-600 dark:text-blue-300',
    assistant: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
    student:   'bg-amber-500/10 text-amber-600 dark:text-amber-300',
  };

  return (
    <div
      className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border transition-all duration-700"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(10px)',
        borderColor: `${color}22`,
        background: `linear-gradient(145deg, ${color}09 0%, transparent 100%)`,
        transitionTimingFunction: 'cubic-bezier(0.23,1,0.32,1)',
      }}
    >
      <div
        className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center overflow-hidden"
        style={{
          border: `1.5px solid ${color}45`,
          boxShadow: `0 0 8px ${color}25`,
        }}
      >
        {isImg ? (
          <img src={agent.avatar} alt={agent.name} className="w-full h-full object-cover" />
        ) : (
          <span className="text-xs font-bold" style={{ color }}>{agent.name[0]}</span>
        )}
      </div>
      <div className="min-w-0">
        <p className="text-[12px] font-semibold text-foreground truncate">{agent.name}</p>
        <span
          className={cn(
            'text-[9px] font-bold uppercase tracking-wider px-1.5 py-px rounded-full',
            roleClass[agent.role] ?? 'bg-primary/10 text-primary',
          )}
        >
          {agent.role}
        </span>
      </div>
    </div>
  );
}

// -- Main component ------------------------------------------------------------

interface GenerationProgressScreenProps {
  progress: number;
  message: string;
  scenesCompleted: number;
  totalScenes: number;
  agentConfigs: AgentConfig[];
  title?: string;
  /** True when the classroom was generated from an uploaded document / PDF curriculum.
   *  When false (topic-based custom classroom), the first step shows
   *  "Analysing your topic" instead of "Reading your source material". */
  hasPdf?: boolean;
}

export default function GenerationProgressScreen({
  progress,
  message,
  scenesCompleted,
  totalScenes,
  agentConfigs,
  title,
  hasPdf = false,
}: GenerationProgressScreenProps) {
  const hasAgents = agentConfigs.length > 0;
  const showAgents = hasAgents && progress >= 18;
  const sceneLabel = totalScenes > 0 ? `${scenesCompleted}/${totalScenes}` : undefined;
  const pipelineSteps = buildPipelineSteps(hasPdf);

  return (
    <div className="relative min-h-screen bg-background flex items-center justify-center px-4 overflow-hidden">

      {/* -- Ambient gradient orbs (pure CSS, no JS) -- */}
      <div
        className="pointer-events-none absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full opacity-[0.12]"
        style={{ background: 'radial-gradient(circle, hsl(245 78% 58%) 0%, transparent 65%)', animation: 'ns-orb-a 9s ease-in-out infinite alternate' }}
      />
      <div
        className="pointer-events-none absolute bottom-0 right-0 w-[380px] h-[380px] rounded-full opacity-[0.09]"
        style={{ background: 'radial-gradient(circle, hsl(285 70% 60%) 0%, transparent 65%)', animation: 'ns-orb-b 11s ease-in-out 2s infinite alternate' }}
      />

      {/* -- Main card -- */}
      <div
        className="relative w-full max-w-md rounded-3xl border border-border bg-card overflow-hidden z-10"
        style={{ boxShadow: '0 30px 80px hsl(245 78% 15% / 0.3), 0 0 0 0.5px hsl(245 78% 30% / 0.10)' }}
      >
        {/* Sweep beam */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-3xl">
          <div
            className="absolute inset-x-0 h-[2px] opacity-0"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, hsl(265 78% 75% / 0.35) 50%, transparent 100%)',
              animation: 'ns-sweep 4s ease-in-out infinite',
            }}
          />
        </div>

        <div className="relative z-10 p-7 space-y-6">

          {/* -- Header -- */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="relative w-7 h-7">
                <div className="absolute inset-0 rounded-full animate-ping opacity-15" style={{ background: 'hsl(245 78% 58%)' }} />
                <div
                  className="absolute inset-[3px] rounded-full"
                  style={{
                    background: 'linear-gradient(135deg, hsl(245 78% 65%), hsl(285 70% 60%))',
                    boxShadow: '0 0 10px hsl(265 75% 55% / 0.5)',
                  }}
                />
              </div>
              <span className="text-[10px] font-bold tracking-[0.22em] uppercase text-primary/55">
                NeuroSpace AI
              </span>
            </div>

            <h1 className="text-[22px] font-bold text-foreground leading-tight">
              {title ? (
                <>
                  <span className="text-foreground/40 font-normal text-lg">Building </span>
                  <br />
                  {title}
                </>
              ) : (
                'Building Your Classroom'
              )}
            </h1>
            <p className="mt-1 text-[12px] text-muted-foreground/50">
              AI is crafting lessons personalised to your learning style
            </p>
          </div>

          {/* -- Progress bar -- */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted-foreground/40">
                Progress
              </span>
              <span
                className="text-sm font-bold tabular-nums"
                style={{ color: `hsl(${245 + progress * 0.4} 78% 72%)` }}
              >
                {progress}%
              </span>
            </div>
            <div className="relative h-[3px] rounded-full overflow-hidden bg-muted">
              <div
                className="absolute inset-y-0 left-0 rounded-full transition-all duration-1000 ease-out"
                style={{
                  width: `${progress}%`,
                  background: 'linear-gradient(90deg, hsl(245 78% 55%) 0%, hsl(285 72% 62%) 55%, hsl(315 80% 68%) 100%)',
                  boxShadow: '0 0 10px hsl(265 75% 60% / 0.7)',
                }}
              />
              {/* Leading sparkle dot */}
              {progress > 0 && progress < 100 && (
                <div
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2 h-2 rounded-full transition-all duration-1000 ease-out"
                  style={{
                    left: `${progress}%`,
                    background: 'white',
                    boxShadow: '0 0 6px 2px hsl(265 75% 70% / 0.9)',
                  }}
                />
              )}
            </div>
          </div>

          {/*  Live status message  */}
          <div className="flex items-center gap-2 px-3.5 py-2 rounded-lg border border-border bg-muted/60">
            <span className="w-1.5 h-1.5 rounded-full bg-primary/70 animate-pulse flex-shrink-0" />
            <span className="text-[11px] font-mono text-foreground/50 truncate">{message}</span>
          </div>

          {/*  Pipeline steps  */}
          <div className="space-y-1">
            {pipelineSteps.map((step) => (
              <StepRow
                key={step.id}
                step={step}
                status={getStepStatus(step, progress)}
                sceneLabel={sceneLabel}
              />
            ))}
          </div>

          {/*  Meet your teachers  */}
          {showAgents && (
            <div className="space-y-3 pt-1">
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
                <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-foreground/30 whitespace-nowrap">
                  Your Teaching Team
                </span>
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                {agentConfigs.map((agent, i) => (
                  <AgentPill key={agent.id} agent={agent} delay={i * 150} />
                ))}
              </div>
            </div>
          )}

        </div>
      </div>

      {/*  Keyframes  */}
      <style>{`
        @keyframes ns-sweep {
          0%   { top: -2px; opacity: 0; }
          8%   { opacity: 1; }
          92%  { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
        @keyframes ns-orb-a {
          from { transform: translate(0, 0) scale(1); }
          to   { transform: translate(20px, 24px) scale(1.08); }
        }
        @keyframes ns-orb-b {
          from { transform: translate(0, 0) scale(1); }
          to   { transform: translate(-16px, -20px) scale(1.05); }
        }
      `}</style>
    </div>
  );
}
