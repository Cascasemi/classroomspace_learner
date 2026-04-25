/**
 * ParticipantBar — always-visible bottom bar
 *
 * Replaces the floating SpeechBubble with a persistent bar that shows:
 *   LEFT  — teacher / current-speaking agent avatar  (with active glow ring)
 *   CENTER — typewriter speech text  (idle placeholder when silent)
 *   RIGHT  — student agent avatars + "You" user slot  (with per-agent active ring)

 */
import { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import type { AgentConfig } from '@/lib/playback/types';
import { useTypewriter } from '@/lib/audio/use-typewriter';
import { getFallbackAvatar } from '@/lib/constants/avatar-map';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ParticipantBarProps {
  /** Currently-spoken text (null = idle) */
  text: string | null;
  /** True while the engine / TTS is actively playing */
  isPlaying: boolean;
  /** Resolved agent that is currently speaking (teacher or student) */
  agent?: AgentConfig;
  /** All classroom agent configs (teacher + students) */
  allAgents: AgentConfig[];
  /** ID of the currently-speaking agent (for highlight ring) */
  activeAgentId?: string | null;
  /** Called when the user clicks "Skip ›" */
  onSkip?: () => void;
  playbackSpeed?: number;
  /** The logged-in user’s avatar path (from profile) */
  userAvatar?: string;
  /** The logged-in user’s display name */
  userName?: string;  /** When true the server signalled cue_user — student's turn to respond */
  awaitingCue?: boolean;}

// ─── Animation constants ─────────────────────────────────────────────────────

const WAVE_BARS = [
  { h: 10, delay: '0ms' },
  { h: 18, delay: '80ms' },
  { h: 8,  delay: '40ms' },
  { h: 16, delay: '120ms' },
  { h: 22, delay: '60ms' },
  { h: 10, delay: '100ms' },
  { h: 16, delay: '20ms' },
  { h: 12, delay: '140ms' },
] as const;

// ─── Sub-components ───────────────────────────────────────────────────────────

interface AvatarProps {
  agent: AgentConfig;
  isActive: boolean;
  size?: number;
  label?: boolean;
}

function AgentAvatar({ agent, isActive, size = 36, label = true }: AvatarProps) {
  const color = agent.color ?? '#6366f1';
  const isImg = agent.avatar.startsWith('/') || agent.avatar.startsWith('http');

  return (
    <div className="flex flex-col items-center gap-0.5 flex-shrink-0" title={agent.name}>
      <div className="relative">
        <div
          className="rounded-full overflow-hidden flex items-center justify-center text-sm font-bold"
          style={{
            width: size,
            height: size,
            backgroundColor: isImg ? undefined : color + '22',
            boxShadow: isActive
              ? `0 0 0 2px ${color}, 0 0 10px ${color}60`
              : `0 0 0 1.5px ${color}30`,
            transition: 'box-shadow 0.35s ease',
          }}
        >
          {isImg ? (
            <img
              src={agent.avatar}
              alt={agent.name}
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = getFallbackAvatar(agent.name, agent.role);
              }}
            />
          ) : (
            <span style={{ color }}>{agent.avatar || agent.name[0]}</span>
          )}
        </div>

        {/* Active indicator badge */}
        {isActive && (
          <span className="absolute -top-[2px] -right-[2px] w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-background block" />
        )}
      </div>

      {label && (
        <span className="text-[8px] font-semibold text-foreground/60 max-w-[44px] truncate text-center leading-tight">
          {agent.name}
        </span>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ParticipantBar({
  text,
  isPlaying,
  agent,
  allAgents,
  activeAgentId,
  onSkip,
  playbackSpeed = 1,
  userAvatar,
  userName = 'You',
  awaitingCue = false,
}: ParticipantBarProps) {
  const [avatarError, setAvatarError] = useState(false);
  // Reset error state whenever the avatar URL changes
  useEffect(() => { setAvatarError(false); }, [userAvatar]);
  const textRef = useRef<HTMLDivElement>(null);
  const { revealed } = useTypewriter(text, 50 * playbackSpeed);

  // Keep speech text scrolled to bottom as it reveals
  useEffect(() => {
    if (textRef.current) textRef.current.scrollTop = textRef.current.scrollHeight;
  }, [revealed]);

  // Teacher is always the first teacher-role agent; fall back to first agent
  const teacherAgent = allAgents.find((a) => a.role === 'teacher') ?? allAgents[0];
  const nonTeacherAgents = allAgents.filter((a) => a !== teacherAgent);

  // Resolve active speaker for left column ring
  const activeSpeaker = agent;
  const isTeacherActive = !!activeSpeaker && activeSpeaker.id === teacherAgent?.id;

  // Colour to drive bar border / accents  (falls back to primary)
  const accentColor = activeSpeaker?.color ?? teacherAgent?.color ?? '#6366f1';

  return (
    <div className="absolute bottom-[96px] left-0 right-0 z-30 px-3 pointer-events-none">
      <div
        className="max-w-[min(880px,calc(100vw-1.5rem))] mx-auto flex items-stretch pointer-events-auto overflow-hidden"
        style={{
          background: 'hsl(var(--card) / 0.96)',
          border: `1px solid ${accentColor}22`,
          boxShadow: `0 -4px 32px rgba(0,0,0,0.45), 0 0 0 1px ${accentColor}15`,
          backdropFilter: 'blur(24px)',
          borderRadius: 16,
          minHeight: 80,
        }}
      >
        {/* ── Left accent stripe ── */}
        <div
          className="absolute left-0 inset-y-0 w-[3px] rounded-l-[15px]"
          style={{
            background: `linear-gradient(180deg, ${accentColor} 0%, ${accentColor}40 100%)`,
          }}
        />

        {/* ── LEFT: Teacher / current speaker ── */}
        {teacherAgent && (
          <div
            className="flex flex-col items-center justify-center gap-1 pl-5 pr-3 py-3 flex-shrink-0 border-r border-border/20"
            style={{
              minWidth: 76,
              background: `linear-gradient(135deg, ${teacherAgent.color ?? '#6366f1'}14 0%, transparent 100%)`,
            }}
          >
            <AgentAvatar agent={teacherAgent} isActive={isTeacherActive} size={44} />
          </div>
        )}

        {/* ── CENTER: Speech text ── */}
        <div className="flex-1 flex items-center gap-3 px-4 py-3 min-w-0 relative">
          {/* Voice waveform — only when actively playing */}
          {isPlaying && text && (
            <div className="flex items-end gap-[2px] flex-shrink-0">
              {WAVE_BARS.map((bar, i) => (
                <div
                  key={i}
                  className="w-[2px] rounded-full origin-bottom"
                  style={{
                    height: bar.h,
                    backgroundColor: accentColor,
                    animation: `wave-bar 0.65s ${bar.delay} ease-in-out infinite`,
                  }}
                />
              ))}
            </div>
          )}

          {/* Text area */}
          <div
            ref={textRef}
            className="flex-1 text-[13px] leading-[1.65] text-foreground/85 overflow-y-auto"
            style={{ maxHeight: 68, scrollbarWidth: 'none' }}
          >
            {text ? (
              <>
                {revealed}
                {isPlaying && revealed.length < (text.length) && (
                  <span
                    className="inline-block w-[2px] h-[13px] ml-0.5 rounded-full opacity-80 animate-pulse align-middle"
                    style={{ backgroundColor: accentColor }}
                  />
                )}
              </>
            ) : awaitingCue ? (
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-primary animate-ping flex-shrink-0" />
                <span className="text-[12px] font-semibold text-primary/90 tracking-wide">Your turn to respond</span>
              </span>
            ) : (
              <span className="text-muted-foreground/25 text-[12px] italic">
                Waiting to start…
              </span>
            )}
          </div>

          {/* Skip button */}
          {isPlaying && onSkip && (
            <button
              onClick={onSkip}
              className={cn(
                'absolute top-2 right-2',
                'text-[9px] font-bold uppercase tracking-widest',
                'px-2 py-[3px] rounded-full border',
                'text-muted-foreground/40 border-border/30',
                'hover:text-foreground/70 hover:border-border/60 hover:bg-muted/40 transition-all',
              )}
            >
              Skip ›
            </button>
          )}
        </div>

        {/* ── RIGHT: Student agents + You ── */}
        {(nonTeacherAgents.length > 0) && (
          <div
            className="flex items-center gap-2.5 px-3 py-3 border-l border-border/20 flex-shrink-0"
            style={{
              background: 'linear-gradient(225deg, hsl(245 78% 60% / 0.08) 0%, transparent 80%)',
            }}
          >
            {nonTeacherAgents.slice(0, 4).map((a) => (
              <AgentAvatar
                key={a.id}
                agent={a}
                isActive={activeAgentId === a.id}
                size={34}
              />
            ))}

            {/* "You" user indicator */}
            <div className="flex flex-col items-center gap-0.5 flex-shrink-0" title={userName}>
              <div
                className="rounded-full overflow-hidden flex items-center justify-center text-[10px] font-bold"
                style={{
                  width: 34,
                  height: 34,
                  background: userAvatar ? undefined : 'hsl(245 78% 60% / 0.12)',
                  boxShadow: awaitingCue
                    ? '0 0 0 2px hsl(245 78% 60%), 0 0 12px hsl(245 78% 60% / 0.5)'
                    : '0 0 0 1.5px hsl(245 78% 60% / 0.35)',
                  transition: 'box-shadow 0.3s ease',
                }}
              >
                {userAvatar && !avatarError ? (
                  <img
                    src={userAvatar}
                    alt={userName}
                    className="w-full h-full object-cover"
                    onError={() => setAvatarError(true)}
                  />
                ) : (
                  <span className="text-primary/70 text-[9px] font-bold">
                    {(userName?.[0] ?? 'Y').toUpperCase()}
                  </span>
                )}
              </div>
              <span className="text-[8px] font-semibold text-foreground/60 max-w-[44px] truncate text-center leading-tight">
                {userName}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
