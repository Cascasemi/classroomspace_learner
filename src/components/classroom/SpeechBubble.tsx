import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { AgentConfig } from "@/lib/playback/types";
import { useTypewriter } from "@/lib/audio/use-typewriter";
import { getFallbackAvatar } from "@/lib/constants/avatar-map";

interface SpeechBubbleProps {
  text: string | null;
  isPlaying: boolean;
  onSkip?: () => void;
  agent?: AgentConfig;
  /** Engine playback speed multiplier  scales typewriter rate */
  playbackSpeed?: number;
}

const ROLE_LABELS: Record<string, string> = {
  teacher: "Teacher",
  assistant: "Assistant",
  student: "Student",
};

/** 12 voice-waveform bars  staggered delays, varying peak heights */
const WAVE_BARS = [
  { h: 20, dur: "0.55s", delay: "0ms" },
  { h: 28, dur: "0.72s", delay: "40ms" },
  { h: 16, dur: "0.63s", delay: "80ms" },
  { h: 32, dur: "0.68s", delay: "120ms" },
  { h: 24, dur: "0.80s", delay: "60ms" },
  { h: 36, dur: "0.78s", delay: "100ms" },
  { h: 20, dur: "0.61s", delay: "20ms" },
  { h: 30, dur: "0.74s", delay: "140ms" },
  { h: 18, dur: "0.58s", delay: "50ms" },
  { h: 26, dur: "0.70s", delay: "90ms" },
  { h: 14, dur: "0.53s", delay: "30ms" },
  { h: 22, dur: "0.66s", delay: "110ms" },
] as const;

function isImageAvatar(avatar: string): boolean {
  return avatar.startsWith("/") || avatar.startsWith("http");
}

function AgentAvatar({ avatar, name, color, size = 56 }: { avatar: string; name: string; color: string; size?: number }) {
  const sizeStyle = { width: size, height: size };
  const ringStyle = { boxShadow: `0 0 0 2px ${color}66, 0 0 0 4px ${color}22` };

  if (isImageAvatar(avatar)) {
    return (
      <div className="rounded-2xl overflow-hidden flex-shrink-0" style={{ ...sizeStyle, ...ringStyle }}>
        <img
          src={avatar}
          alt={name}
          className="w-full h-full object-cover"
          loading="eager"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src = getFallbackAvatar(name);
          }}
        />
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl flex items-center justify-center flex-shrink-0 text-2xl select-none"
      style={{ ...sizeStyle, ...ringStyle, backgroundColor: color + "33" }}
    >
      {avatar}
    </div>
  );
}

export default function SpeechBubble({ text, isPlaying, onSkip, agent, playbackSpeed = 1 }: SpeechBubbleProps) {
  const textRef = useRef<HTMLDivElement>(null);
  const { revealed } = useTypewriter(text, 50 * playbackSpeed);

  useEffect(() => {
    if (textRef.current) textRef.current.scrollTop = textRef.current.scrollHeight;
  }, [revealed]);

  if (!text) return null;

  const color = agent?.color ?? "#6366f1";
  const avatar = agent?.avatar ?? "/avatars/teacher_lady.jpg";
  const agentName = agent?.name ?? "Ms. Nova";
  const roleLabel = agent ? (ROLE_LABELS[agent.role] ?? agent.role) : "Teacher";

  const cardGlow = `0 0 0 1px ${color}33, 0 8px 40px -4px ${color}1a, 0 2px 12px rgba(0,0,0,0.5)`;

  return (
    <div className={cn("fixed bottom-[76px] left-1/2 -translate-x-1/2 z-30 w-[min(800px,calc(100vw-2rem))] animate-slide-up")}>
      <div
        className="relative flex items-stretch overflow-hidden rounded-2xl"
        style={{
          background: "hsl(var(--card) / 0.97)",
          boxShadow: cardGlow,
          backdropFilter: "blur(20px)",
          border: `1px solid ${color}2e`,
        }}
      >
        {/* Colored left accent stripe */}
        <div
          className="absolute left-0 inset-y-0 w-[3px] rounded-l-2xl"
          style={{ background: `linear-gradient(180deg, ${color} 0%, ${color}44 100%)` }}
        />

        {/*  Agent identity column  */}
        <div
          className="flex flex-col items-center justify-center gap-2 pl-[18px] pr-4 py-4 w-[116px] flex-shrink-0 border-r border-border/20"
          style={{ background: `linear-gradient(135deg, ${color}18 0%, transparent 100%)` }}
        >
          <AgentAvatar avatar={avatar} name={agentName} color={color} size={50} />
          <div className="text-center space-y-0.5">
            <div className="text-[11px] font-semibold text-foreground/90 leading-tight truncate max-w-[90px]">{agentName}</div>
            <div
              className="inline-block text-[8px] font-bold uppercase tracking-widest px-1.5 py-[2px] rounded-full"
              style={{ backgroundColor: color + "28", color }}
            >
              {roleLabel}
            </div>
          </div>
        </div>

        {/*  Voice waveform column  */}
        <div className="flex items-center justify-center w-10 flex-shrink-0 border-r border-border/20">
          <div className="flex items-end justify-center gap-[2.5px]" style={{ height: 36 }}>
            {WAVE_BARS.map((bar, i) =>
              isPlaying ? (
                <div
                  key={i}
                  className="w-[2.5px] rounded-full origin-bottom"
                  style={{
                    height: bar.h,
                    backgroundColor: color,
                    animation: `wave-bar ${bar.dur} ${bar.delay} ease-in-out infinite`,
                  }}
                />
              ) : (
                <div
                  key={i}
                  className="w-[2.5px] rounded-full opacity-15"
                  style={{ height: Math.max(bar.h * 0.22, 3), backgroundColor: color }}
                />
              ),
            )}
          </div>
        </div>

        {/*  Speech text  */}
        <div
          ref={textRef}
          className="flex-1 py-4 px-5 overflow-y-auto text-[14px] leading-[1.65] text-foreground/90"
          style={{ maxHeight: 120, scrollbarWidth: "none" }}
        >
          {revealed}
          {isPlaying && revealed.length < (text?.length ?? 0) && (
            <span
              className="inline-block w-0.5 h-[14px] ml-0.5 rounded-full opacity-80 animate-pulse align-middle"
              style={{ backgroundColor: color }}
            />
          )}
        </div>

        {/*  Skip button  */}
        {isPlaying && onSkip && (
          <button
            onClick={onSkip}
            className={cn(
              "absolute top-3 right-3",
              "text-[9px] font-bold uppercase tracking-widest",
              "px-2 py-[3px] rounded-full border transition-all",
              "text-muted-foreground/40 border-border/30",
              "hover:text-foreground/70 hover:border-border/60 hover:bg-muted/40",
            )}
          >
            Skip 
          </button>
        )}
      </div>
    </div>
  );
}
