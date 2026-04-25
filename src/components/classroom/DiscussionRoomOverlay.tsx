/**
 * DiscussionRoomOverlay
 *
 * Full-screen discussion room:
 *   1. Teacher gives intro speech + steps back (intro phase)
 *   2. User and peer agents (assistant + student) hold a multi-turn discussion
 *   3. User clicks "End Discussion → Return to class" to resume the lesson
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import {
  ArrowLeft,
  Mic,
  MicOff,
  Send,
  Loader2,
  MessageSquare,
  BookOpen,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import type { DiscussionAgentResponse } from '@/lib/api';
import type { AgentConfig } from '@/lib/playback/types';
import { speakText, stopTTS } from '@/lib/audio/tts';
import { resolveVoiceHint } from '@/lib/audio/tts';
import { useUserProfile } from '@/hooks/use-user-profile';
import { applyWBAction, createEmptyWhiteboard } from '@/lib/whiteboard/reducer';
import type { WhiteboardState, WBAction } from '@/lib/whiteboard/types';
import Whiteboard from '@/components/classroom/Whiteboard';

// ── Types ─────────────────────────────────────────────────────────────────────

interface HistoryEntry {
  id: string;
  role: 'user' | 'agent';
  agentId?: string;
  agentName?: string;
  agentRole?: string;
  content: string;
}

interface DiscussionRoomOverlayProps {
  topic: string;
  prompt?: string;
  classroomId: string;
  agentConfigs: AgentConfig[];
  onClose: () => void;            // called when user ends the discussion
}

// ── Avatar helper ─────────────────────────────────────────────────────────────

function AgentAvatar({
  agent,
  size = 'sm',
  isActive = false,
}: {
  agent: AgentConfig;
  size?: 'sm' | 'md';
  isActive?: boolean;
}) {
  const dim = size === 'md' ? 'w-10 h-10' : 'w-7 h-7';
  const color = agent.color ?? '#6366f1';
  return (
    <div
      className={cn(
        dim,
        'rounded-xl overflow-hidden flex items-center justify-center text-xs font-bold flex-shrink-0 transition-all duration-200',
      )}
      style={{
        backgroundColor: color + '22',
        boxShadow: isActive
          ? `0 0 0 2px ${color}, 0 0 10px ${color}55`
          : `0 0 0 1px ${color}33`,
      }}
    >
      {agent.avatar?.startsWith('/') || agent.avatar?.startsWith('http') ? (
        <img src={agent.avatar} alt={agent.name} className="w-full h-full object-cover" />
      ) : (
        <span style={{ color }}>{agent.avatar || agent.name[0]}</span>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function DiscussionRoomOverlay({
  topic,
  prompt,
  classroomId,
  agentConfigs,
  onClose,
}: DiscussionRoomOverlayProps) {
  const { nickname: profileNickname, bio: profileBio } = useUserProfile();

  // 'intro' while teacher is speaking, 'discussion' once the room is open
  const [phase, setPhase] = useState<'intro' | 'discussion'>('intro');

  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [speakingAgentId, setSpeakingAgentId] = useState<string | null>(null);
  const [wbState, setWbState] = useState<WhiteboardState>(createEmptyWhiteboard());

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef(false);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [history]);

  const agentMap = new Map(agentConfigs.map((a) => [a.id, a]));
  const nonTeacherAgents = agentConfigs.filter((a) => a.role !== 'teacher');

  // ── TTS helper  ──────────────────────────────────────────────────────────

  const speakResponse = useCallback(
    async (responses: DiscussionAgentResponse[]) => {
      for (const resp of responses) {
        if (abortRef.current) break;
        if (!resp.speech) continue;
        const agent = agentMap.get(resp.agentId);
        setSpeakingAgentId(resp.agentId);
        const hint = resolveVoiceHint(agent?.role, agent?.voiceHint);
        await speakText(resp.speech, hint).catch(() => {});
      }
      if (!abortRef.current) setSpeakingAgentId(null);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [agentConfigs],
  );

  // ── Intro phase — teacher gives opening speech ────────────────────────────

  useEffect(() => {
    let cancelled = false;
    abortRef.current = false;

    async function runIntro() {
      setIsLoading(true);
      const collectedResponses: DiscussionAgentResponse[] = [];

      try {
        await api.discussionRoom({
          classroomId,
          topic,
          prompt,
          mode: 'intro',
          userProfile: {
            nickname: profileNickname || undefined,
            bio: profileBio || undefined,
          },
          onAgentStart: (agentId) => {
            if (!cancelled) setSpeakingAgentId(agentId);
          },
          onAgentResponse: (resp) => {
            if (cancelled) return;
            collectedResponses.push(resp);
            setHistory((prev) => [
              ...prev,
              {
                id: `${resp.agentId}-intro-${Date.now()}`,
                role: 'agent',
                agentId: resp.agentId,
                agentName: resp.agentName,
                agentRole: resp.agentRole,
                content: resp.speech,
              },
            ]);
            // Apply whiteboard actions
            if (resp.whiteboardActions?.length) {
              setWbState((prev) => {
                let next = prev;
                for (const act of resp.whiteboardActions) {
                  next = applyWBAction(next, act as WBAction);
                }
                return next;
              });
            }
          },
        });
      } catch (err) {
        console.error('[DiscussionRoom intro]', err);
      }

      if (!cancelled) {
        setIsLoading(false);
        // Speak intro then open discussion
        await speakResponse(collectedResponses);
        if (!cancelled) {
          setSpeakingAgentId(null);
          setPhase('discussion');
          inputRef.current?.focus();
        }
      }
    }

    runIntro();
    return () => { cancelled = true; abortRef.current = true; stopTTS(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Send a user message ───────────────────────────────────────────────────

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || isLoading || phase !== 'discussion') return;

    setInputText('');
    setIsLoading(true);

    const userEntry: HistoryEntry = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
    };
    setHistory((prev) => [...prev, userEntry]);

    // Build history for server (last 10 entries mapped to server format)
    const serverHistory = history.slice(-10).map((h) => ({
      role: h.role,
      agentName: h.agentName,
      content: h.content,
    }));

    const collectedResponses: DiscussionAgentResponse[] = [];
    const newEntries: HistoryEntry[] = [];

    try {
      await api.discussionRoom({
        classroomId,
        topic,
        mode: 'turn',
        history: serverHistory,
        userMessage: text,
        userProfile: {
          nickname: profileNickname || undefined,
          bio: profileBio || undefined,
        },
        onAgentStart: (agentId) => setSpeakingAgentId(agentId),
        onAgentResponse: (resp) => {
          collectedResponses.push(resp);
          const entry: HistoryEntry = {
            id: `${resp.agentId}-${Date.now()}-${Math.random()}`,
            role: 'agent',
            agentId: resp.agentId,
            agentName: resp.agentName,
            agentRole: resp.agentRole,
            content: resp.speech,
          };
          newEntries.push(entry);
          setHistory((prev) => [...prev, entry]);
          // Apply whiteboard actions
          if (resp.whiteboardActions?.length) {
            setWbState((prev) => {
              let next = prev;
              for (const act of resp.whiteboardActions) {
                next = applyWBAction(next, act as WBAction);
              }
              return next;
            });
          }
        },
      });
    } catch (err) {
      console.error('[DiscussionRoom turn]', err);
    }

    setIsLoading(false);
    await speakResponse(collectedResponses);
  }, [inputText, isLoading, phase, history, classroomId, topic, profileNickname, profileBio, speakResponse]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleEndDiscussion = () => {
    abortRef.current = true;
    stopTTS();
    onClose();
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: 'hsl(var(--background))' }}
    >
      {/* ── Header ── */}
      <div
        className="h-14 flex items-center px-4 gap-3 flex-shrink-0 border-b border-border/15"
        style={{ background: 'hsl(var(--background) / 0.9)', backdropFilter: 'blur(16px)' }}
      >
        {/* Topic pill */}
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-full"
          style={{ background: 'hsl(245 78% 60% / 0.12)', border: '1px solid hsl(245 78% 60% / 0.2)' }}
        >
          <Users className="w-3.5 h-3.5 text-primary/70" />
          <span className="text-[11px] font-semibold text-primary/80 max-w-[320px] truncate">
            {topic}
          </span>
        </div>

        {/* Phase badge */}
        <div
          className={cn(
            'text-[9px] font-bold uppercase tracking-[0.18em] px-2 py-1 rounded-full',
            phase === 'intro'
              ? 'bg-amber-500/15 text-amber-400/80 border border-amber-500/20'
              : 'bg-emerald-500/15 text-emerald-400/80 border border-emerald-500/20',
          )}
        >
          {phase === 'intro' ? 'Teacher intro' : 'Discussion open'}
        </div>

        {/* Agent strip */}
        <div className="flex -space-x-1.5 ml-1">
          {agentConfigs.slice(0, 4).map((a) => (
            <div
              key={a.id}
              className="w-7 h-7 rounded-full border-[1.5px] border-background"
              style={{ backgroundColor: (a.color ?? '#6366f1') + '33' }}
              title={a.name}
            >
              {a.avatar?.startsWith('/') || a.avatar?.startsWith('http') ? (
                <img src={a.avatar} alt={a.name} className="w-full h-full rounded-full object-cover" />
              ) : (
                <div className="w-full h-full rounded-full flex items-center justify-center text-[10px] font-bold" style={{ color: a.color ?? '#6366f1' }}>
                  {a.name[0]}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex-1" />

        {/* End button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleEndDiscussion}
          className="h-8 gap-2 text-xs text-muted-foreground/60 hover:text-foreground hover:bg-muted/50"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          End Discussion
        </Button>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 flex overflow-hidden relative">

        {/* ── Message thread ── */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Scrollable messages */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-4 py-5 space-y-4"
            style={{ scrollbarWidth: 'thin', paddingBottom: 32 }}
          >
            {/* Intro hint */}
            {phase === 'intro' && history.length === 0 && (
              <div className="flex flex-col items-center justify-center h-48 gap-3 text-center">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <BookOpen className="w-6 h-6 text-primary/50" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground/70">Your teacher is introducing the topic…</p>
                  <p className="text-xs text-muted-foreground/40 mt-1">The discussion will open once the intro is done.</p>
                </div>
                <div className="flex gap-1 mt-1">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="w-1.5 h-1.5 rounded-full bg-primary/50 animate-bounce"
                      style={{ animationDelay: `${i * 120}ms` }}
                    />
                  ))}
                </div>
              </div>
            )}

            {history.map((entry) => {
              if (entry.role === 'user') {
                return (
                  <div key={entry.id} className="flex justify-end animate-fade-in">
                    <div
                      className="max-w-[72%] rounded-2xl rounded-br-sm px-4 py-3"
                      style={{
                        background: 'hsl(245 78% 60% / 0.15)',
                        border: '1px solid hsl(245 78% 60% / 0.25)',
                      }}
                    >
                      <div className="text-[9px] font-bold uppercase tracking-[0.15em] text-primary/50 mb-1">You</div>
                      <p className="text-[13px] text-foreground/85 leading-relaxed">{entry.content}</p>
                    </div>
                  </div>
                );
              }

              const agent = entry.agentId ? agentMap.get(entry.agentId) : undefined;
              const color = agent?.color ?? '#6366f1';
              const isCurrentlySpeaking = speakingAgentId === entry.agentId;

              return (
                <div key={entry.id} className="flex items-start gap-3 animate-fade-in">
                  {agent && (
                    <AgentAvatar
                      agent={agent}
                      size="md"
                      isActive={isCurrentlySpeaking}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    {/* Name + role badge */}
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-[11px] font-bold" style={{ color }}>
                        {entry.agentName}
                      </span>
                      {entry.agentRole && (
                        <span
                          className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-[1px] rounded-full"
                          style={{ backgroundColor: color + '20', color }}
                        >
                          {entry.agentRole}
                        </span>
                      )}
                      {/* Live waveform when speaking */}
                      {isCurrentlySpeaking && (
                        <div className="flex items-center gap-[2px] ml-1">
                          {[10, 14, 8, 16, 10].map((h, i) => (
                            <div
                              key={i}
                              className="w-[2px] rounded-full"
                              style={{
                                height: h,
                                backgroundColor: color,
                                animation: `wave-bar ${0.5 + i * 0.04}s ${i * 30}ms ease-in-out infinite`,
                              }}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                    {/* Message bubble */}
                    <div
                      className="rounded-2xl rounded-tl-sm px-4 py-3"
                      style={{
                        background: color + '0e',
                        border: `1px solid ${color}22`,
                      }}
                    >
                      <p className="text-[13px] text-foreground/85 leading-[1.65]">{entry.content}</p>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Loading indicator */}
            {isLoading && (
              <div className="flex items-center gap-2 text-muted-foreground/40 text-[12px] animate-fade-in">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>
                  {phase === 'intro'
                    ? 'Teacher is preparing the intro…'
                    : 'Agents are thinking…'}
                </span>
              </div>
            )}
          </div>

          {/* ── Input bar ── */}
          <div
            className="flex-shrink-0 border-t border-border/15 px-4 py-3"
            style={{ background: 'hsl(var(--background))' }}
          >
            {phase === 'intro' ? (
              <div className="flex items-center gap-2 text-muted-foreground/35 text-[12px]">
                <MessageSquare className="w-4 h-4" />
                <span>Chat opens once the teacher's intro finishes…</span>
              </div>
            ) : (
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  rows={1}
                  value={inputText}
                  onChange={(e) => {
                    setInputText(e.target.value);
                    // Auto-grow
                    e.target.style.height = 'auto';
                    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="Share your thoughts, ask a question, push back…"
                  disabled={isLoading}
                  className="flex-1 resize-none rounded-xl bg-background border border-border/20 px-4 py-3 text-[13px] text-foreground/85 placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all leading-relaxed disabled:opacity-40"
                  style={{ minHeight: 44 }}
                />
                <Button
                  onClick={handleSend}
                  disabled={isLoading || !inputText.trim()}
                  size="icon"
                  className="h-11 w-11 rounded-xl flex-shrink-0"
                  style={{
                    background: inputText.trim() && !isLoading
                      ? 'linear-gradient(135deg, hsl(245 78% 58%), hsl(265 70% 55%))'
                      : undefined,
                    boxShadow: inputText.trim() && !isLoading
                      ? '0 4px 12px hsl(245 78% 40% / 0.3)'
                      : undefined,
                  }}
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </Button>
              </div>
            )}

            {/* Non-teacher participants indicator */}
            {phase === 'discussion' && (
              <div className="flex items-center gap-2 mt-2">
                <div className="flex -space-x-1">
                  {nonTeacherAgents.map((a) => (
                    <div
                      key={a.id}
                      className="w-4 h-4 rounded-full border border-background"
                      style={{ backgroundColor: (a.color ?? '#6366f1') + '44' }}
                      title={a.name}
                    />
                  ))}
                </div>
                <span className="text-[10px] text-muted-foreground/30">
                  {nonTeacherAgents.map((a) => a.name).join(' & ')} are in the room
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ── Whiteboard overlay (OpenMAIC-style) ── */}
        {wbState.isOpen && (
          <div
            className="absolute inset-4 z-20"
            style={{ bottom: 20 }}
          >
            <Whiteboard
              state={wbState}
              agentLabel={
                speakingAgentId
                  ? agentMap.get(speakingAgentId)?.name
                  : undefined
              }
              onClose={() => setWbState((prev) => ({ ...prev, isOpen: false }))}
              onStateChange={setWbState}
              historyScopeKey={topic}
            />
          </div>
        )}
      </div>
    </div>
  );
}
