import { cn } from "@/lib/utils";
import {
  Play, Pause, SkipForward, SkipBack,
  RotateCcw, Mic, MicOff, ChevronRight,
} from "lucide-react";
import type { PlaybackState } from "@/lib/playback/types";
import { isASRSupported } from "@/lib/audio/asr";

const SPEED_STEPS = [0.75, 1, 1.5, 2] as const;
type SpeedStep = (typeof SPEED_STEPS)[number];

interface PlaybackControlsProps {
  playbackState: PlaybackState;
  currentSceneIndex: number;
  totalScenes: number;
  playbackSpeed?: number;
  discussionActive?: boolean;
  micActive?: boolean;
  onPlay: () => void;
  onPause: () => void;
  onResume: () => void;
  onNextScene: () => void;
  onPrevScene: () => void;
  onRestart: () => void;
  onSpeedChange?: (speed: SpeedStep) => void;
  onMicToggle?: () => void;
}

export default function PlaybackControls({
  playbackState,
  currentSceneIndex,
  totalScenes,
  playbackSpeed = 1,
  discussionActive = false,
  micActive = false,
  onPlay,
  onPause,
  onResume,
  onNextScene,
  onPrevScene,
  onRestart,
  onSpeedChange,
  onMicToggle,
}: PlaybackControlsProps) {
  const isPlaying = playbackState === "playing";
  const isPaused = playbackState === "paused";
  const isIdle = playbackState === "idle";
  const isFinished = playbackState === "finished";
  const isSceneComplete = playbackState === "scene-complete";

  /** Scene progress 01 */
  const progress = totalScenes > 1 ? currentSceneIndex / (totalScenes - 1) : 1;

  function cycleSpeed() {
    const idx = SPEED_STEPS.indexOf(playbackSpeed as SpeedStep);
    const next = SPEED_STEPS[(idx + 1) % SPEED_STEPS.length];
    onSpeedChange?.(next);
  }

  function handlePrimary() {
    if (isIdle) return onPlay();
    if (isPlaying) return onPause();
    if (isPaused) return onResume();
    if (isSceneComplete) return onNextScene();
    if (isFinished) return onRestart();
  }

  const primaryLabel = isIdle ? "Start"
    : isPlaying ? "Pause"
    : isPaused ? "Resume"
    : isSceneComplete ? "Next"
    : "Restart";

  const PrimaryIcon = isPlaying ? Pause
    : isFinished ? RotateCcw
    : isSceneComplete ? ChevronRight
    : Play;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 flex flex-col items-center pb-4 pt-0 px-4 pointer-events-none">
      {/*  Scene progress track  */}
      <div className="w-[min(640px,calc(100vw-2rem))] mb-2 pointer-events-auto">
        <div className="relative h-0.5 rounded-full overflow-hidden bg-muted/60">
          <div
            className="absolute inset-y-0 left-0 bg-primary rounded-full transition-all duration-700 ease-out"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        {/* Scene dots */}
        <div className="flex justify-between mt-1.5 px-0.5">
          {Array.from({ length: totalScenes }).map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-1 rounded-full transition-all duration-300",
                totalScenes > 12 ? "w-1" : "flex-1 mx-0.5",
                i < currentSceneIndex
                  ? "bg-primary/70"
                  : i === currentSceneIndex
                  ? "bg-primary scale-y-[1.5] origin-center"
                  : "bg-muted/40",
              )}
            />
          ))}
        </div>
      </div>

      {/*  Main control pill  */}
      <div
        className="pointer-events-auto w-[min(640px,calc(100vw-2rem))] rounded-2xl overflow-hidden"
        style={{
          background: "hsl(var(--card) / 0.94)",
          backdropFilter: "blur(24px)",
          border: "1px solid hsl(var(--border) / 0.5)",
          boxShadow: "0 -4px 32px rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.1)",
        }}
      >
        <div className="flex items-center px-4 py-3 gap-3">

          {/*  Left  scene info  */}
          <div className="flex-1 min-w-0 hidden sm:block">
            <div className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-[0.15em]">
              Scene
            </div>
            <div className="text-xs font-medium text-foreground/70 tabular-nums">
              {currentSceneIndex + 1}
              <span className="text-muted-foreground/40"> / {totalScenes}</span>
            </div>
          </div>

          {/*  Centre  transport controls  */}
          <div className="flex items-center gap-1.5">
            {/* Prev */}
            <button
              onClick={onPrevScene}
              disabled={currentSceneIndex === 0}
              className={cn(
                "w-9 h-9 rounded-xl flex items-center justify-center transition-all",
                "hover:bg-muted/50 text-muted-foreground hover:text-foreground",
                "disabled:opacity-25 disabled:cursor-not-allowed",
              )}
            >
              <SkipBack className="w-4 h-4" />
            </button>

            {/* Primary play/pause/etc */}
            <button
              onClick={handlePrimary}
              className={cn(
                "h-11 px-6 rounded-xl flex items-center gap-2 font-semibold text-sm transition-all select-none",
                isFinished
                  ? "bg-muted/50 text-foreground hover:bg-muted"
                  : "bg-primary text-primary-foreground hover:opacity-90 shadow-lg shadow-primary/30",
              )}
            >
              <PrimaryIcon className="w-4 h-4" fill={isPlaying || isIdle || isPaused ? "currentColor" : undefined} />
              <span>{primaryLabel}</span>
            </button>

            {/* Next */}
            <button
              onClick={onNextScene}
              disabled={currentSceneIndex >= totalScenes - 1 && !isSceneComplete}
              className={cn(
                "w-9 h-9 rounded-xl flex items-center justify-center transition-all",
                "hover:bg-muted/50 text-muted-foreground hover:text-foreground",
                "disabled:opacity-25 disabled:cursor-not-allowed",
              )}
            >
              <SkipForward className="w-4 h-4" />
            </button>
          </div>

          {/*  Right  extras  */}
          <div className="flex-1 flex items-center justify-end gap-2">
            {/* Mic  only during discussion + ASR available */}
            {discussionActive && isASRSupported() && onMicToggle && (
              <button
                onClick={onMicToggle}
                className={cn(
                  "w-9 h-9 rounded-xl flex items-center justify-center transition-all",
                  micActive
                    ? "bg-red-500 text-white shadow-lg shadow-red-500/40 animate-pulse"
                    : "bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted",
                )}
                title={micActive ? "Stop recording" : "Speak your answer"}
              >
                {micActive ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>
            )}

            {/* Speed */}
            <button
              onClick={cycleSpeed}
              className={cn(
                "h-9 px-2.5 rounded-xl text-[11px] font-bold tabular-nums transition-all select-none",
                playbackSpeed !== 1
                  ? "bg-primary/15 text-primary"
                  : "bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted/60",
              )}
              title="Cycle playback speed"
            >
              {playbackSpeed === 1 ? "1" : `${playbackSpeed}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
