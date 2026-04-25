/**
 * ClassChatPanel — Combined Notes + In-Class Chat sidebar
 *
 * Two tabs:
 *   1. Notes  — per-scene lecture notes (same as old LectureNotesPanel)
 *   2. Chat   — live Q&A where students ask questions mid-lecture and
 *               agents answer in-role before class continues
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { BookOpen, MessageSquare, X, Send, Mic, MicOff, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Scene, AgentConfig } from '@/lib/playback/types';
import type { ClassroomChatMessage as ChatMessage } from '@/lib/classroom-runtime/store';
import type { Action, SpeechAction, DiscussionAction } from '@/lib/types/action';
import InlineActionTag from '@/components/classroom/InlineActionTag';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ClassChatPanelProps {
  // Notes tab
  scenes: Scene[];
  currentSceneIndex: number;
  // Chat tab
  messages: ChatMessage[];
  isQaLoading: boolean;
  micActive?: boolean;
  agentConfigs: AgentConfig[];
  onAskQuestion: (question: string) => void;
  onMicToggle?: () => void;
  /** Latest interim ASR transcript (shown in input while user is speaking) */
  interimTranscript?: string | null;
  /**
   * Incrementing counter — whenever this changes the panel auto-switches to
   * the Chat tab. Used by ClassroomPage after the post-scene "I have a question" button.
   */
  chatTabTrigger?: number;
  // Panel state
  isOpen: boolean;
  onClose: () => void;
}

// ─── Notes helpers ────────────────────────────────────────────────────────────

const VISIBLE_ACTION_TYPES = new Set([
  'speech', 'spotlight', 'laser', 'discussion',
  'wb_open', 'wb_close', 'wb_clear', 'wb_delete',
  'wb_draw_text', 'wb_draw_shape', 'wb_draw_chart',
  'wb_draw_latex', 'wb_draw_table', 'wb_draw_line',
]);

function getVisibleActions(scene: Scene): Action[] {
  return (scene.actions ?? []).filter((a) => VISIBLE_ACTION_TYPES.has(a.type));
}

function scenePageLabel(scene: Scene, index: number): string {
  return scene.type === 'quiz' ? 'Quiz' : `Slide ${index + 1}`;
}

function ActionRow({ action, isCurrent }: { action: Action; isCurrent: boolean }) {
  if (action.type === 'speech') {
    const s = action as SpeechAction;
    return (
      <p className={cn('text-[11px] leading-[1.75]', isCurrent ? 'text-foreground/65' : 'text-muted-foreground/40')}>
        {s.text}
      </p>
    );
  }
  if (action.type === 'discussion') {
    const d = action as DiscussionAction;
    return (
      <div className="flex items-start gap-2 px-2.5 py-2 rounded-lg border border-amber-500/20" style={{ background: 'hsl(38 95% 55% / 0.07)' }}>
        <MessageSquare className="w-3 h-3 text-amber-400/70 mt-[2px] flex-shrink-0" />
        <div className="min-w-0">
          <InlineActionTag actionType="discussion" />
          {d.topic && (
            <p className="mt-0.5 text-[10px] leading-[1.6] text-amber-300/55 break-words">{d.topic}</p>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1">
      <InlineActionTag actionType={action.type} />
    </div>
  );
}

// ─── Chat helpers ─────────────────────────────────────────────────────────────

function AgentBubble({ msg, agentConfigs }: { msg: ChatMessage; agentConfigs: AgentConfig[] }) {
  const agent = agentConfigs.find((a) => a.id === msg.agentId);
  const color = msg.agentColor ?? agent?.color ?? '#6366f1';
  const initial = (msg.agentName ?? agent?.name ?? '?')[0];
  const avatarSrc = msg.agentAvatar ?? agent?.avatar;
  const roleBadge: Record<string, string> = {
    teacher: 'Teacher',
    assistant: 'TA',
    student: 'Student',
  };

  return (
    <div className="flex items-start gap-2.5 animate-fade-in">
      {/* Avatar */}
      <div
        className="flex-shrink-0 w-7 h-7 rounded-lg overflow-hidden flex items-center justify-center text-[11px] font-bold mt-0.5"
        style={{ backgroundColor: color + '22', boxShadow: `0 0 0 1.5px ${color}44` }}
      >
        {avatarSrc?.startsWith('/') || avatarSrc?.startsWith('http') ? (
          <img src={avatarSrc} alt={msg.agentName} className="w-full h-full object-cover" />
        ) : (
          <span style={{ color }}>{initial}</span>
        )}
      </div>
      {/* Bubble */}
      <div className="flex-1 max-w-[calc(100%-40px)]">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-[10px] font-bold" style={{ color }}>{msg.agentName}</span>
          {msg.agentRole && (
            <span
              className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-[1px] rounded-full"
              style={{ backgroundColor: color + '20', color }}
            >
              {roleBadge[msg.agentRole] ?? msg.agentRole}
            </span>
          )}
        </div>
        <div
          className="px-3 py-2 rounded-2xl rounded-tl-sm"
          style={{ background: color + '0e', border: `1px solid ${color}22` }}
        >
          <p className="text-[12px] text-foreground/80 leading-[1.65] break-words">{msg.text}</p>
        </div>
      </div>
    </div>
  );
}

function UserBubble({ msg }: { msg: ChatMessage }) {
  return (
    <div className="flex justify-end animate-fade-in">
      <div
        className="max-w-[80%] px-3 py-2.5 rounded-2xl rounded-br-sm"
        style={{ background: 'hsl(245 78% 60% / 0.18)', border: '1px solid hsl(245 78% 60% / 0.3)' }}
      >
        <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-primary/60 mb-0.5">You</p>
        <p className="text-[12px] text-foreground/80 leading-[1.65] break-words">{msg.text}</p>
      </div>
    </div>
  );
}

function ThinkingBubble() {
  return (
    <div className="flex items-center gap-2 py-1 text-muted-foreground/40 text-[12px] animate-fade-in">
      <Loader2 className="w-3.5 h-3.5 animate-spin" />
      <span>Agents are thinking…</span>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ClassChatPanel({
  scenes,
  currentSceneIndex,
  messages,
  isQaLoading,
  micActive = false,
  agentConfigs,
  onAskQuestion,
  onMicToggle,
  interimTranscript,
  chatTabTrigger,
  isOpen,
  onClose,
}: ClassChatPanelProps) {
  const [activeTab, setActiveTab] = useState<'notes' | 'chat'>('notes');
  const [inputText, setInputText] = useState('');
  const currentSceneRef = useRef<HTMLDivElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Count unread chat messages to show a dot on the Notes tab
  const [readCount, setReadCount] = useState(0);
  const unreadCount = messages.filter((m) => m.type === 'agent').length - readCount;
  const hasUnread = unreadCount > 0 && activeTab === 'notes';

  // Mark all as read when switching to chat
  useEffect(() => {
    if (activeTab === 'chat') {
      setReadCount(messages.filter((m) => m.type === 'agent').length);
    }
  }, [activeTab, messages]);

  // Switch to Chat tab when caller increments chatTabTrigger (e.g. post-scene Q&A prompt)
  useEffect(() => {
    if (!chatTabTrigger) return;
    setActiveTab('chat');
    // Also open the panel if it happened to be collapsed
  }, [chatTabTrigger]);

  // Auto-scroll notes to current scene
  useEffect(() => {
    if (!isOpen || activeTab !== 'notes') return;
    currentSceneRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [currentSceneIndex, isOpen, activeTab]);

  // Auto-scroll chat to latest message
  useEffect(() => {
    if (activeTab === 'chat') {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isQaLoading, activeTab]);

  // Fill input with ASR interim transcript
  useEffect(() => {
    if (micActive && interimTranscript) {
      setInputText(interimTranscript);
    }
  }, [interimTranscript, micActive]);

  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text || isQaLoading) return;
    onAskQuestion(text);
    setInputText('');
  }, [inputText, isQaLoading, onAskQuestion]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  if (!isOpen) return null;

  return (
    <aside
      className="w-[280px] flex-shrink-0 flex flex-col border-l border-border/20 overflow-hidden"
      style={{ background: 'hsl(var(--card))' }}
      aria-label="Classroom panel"
    >
      {/* ── Header with tabs ── */}
      <div
        className="h-11 flex items-center px-2 gap-1 flex-shrink-0 border-b border-border/20"
        style={{ background: 'hsl(var(--card))' }}
      >
        {/* Tab buttons */}
        <div className="flex-1 flex items-center gap-0.5">
          <button
            onClick={() => setActiveTab('notes')}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-[0.12em] transition-colors',
              activeTab === 'notes'
                ? 'bg-primary/15 text-primary/80'
                : 'text-muted-foreground/35 hover:text-muted-foreground/60 hover:bg-muted/40',
            )}
          >
            <BookOpen className="w-3 h-3" />
            Notes
          </button>

          <button
            onClick={() => setActiveTab('chat')}
            className={cn(
              'relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-[0.12em] transition-colors',
              activeTab === 'chat'
                ? 'bg-primary/15 text-primary/80'
                : 'text-muted-foreground/35 hover:text-muted-foreground/60 hover:bg-muted/40',
            )}
          >
            <MessageSquare className="w-3 h-3" />
            Chat
            {/* Amber pulse dot when agents replied and user is on Notes */}
            {(hasUnread || isQaLoading) && (
              <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
              </span>
            )}
          </button>
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground/35 hover:text-foreground/60 hover:bg-muted/40 transition-colors"
          aria-label="Close panel"
        >
          <X className="w-3 h-3" />
        </button>
      </div>

      {/* ── Notes Tab ── */}
      {activeTab === 'notes' && (
        <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin', paddingBottom: 180 }}>
          {scenes.map((scene, i) => {
            const actions = getVisibleActions(scene);
            if (actions.length === 0 && scene.type !== 'quiz') return null;
            const isCurrent = i === currentSceneIndex;
            const pageLabel = scenePageLabel(scene, i);

            return (
              <div
                key={scene.id}
                ref={isCurrent ? currentSceneRef : undefined}
                className={cn(
                  'border-b border-border/10 transition-colors duration-300',
                  isCurrent ? 'bg-primary/[0.06]' : 'hover:bg-muted/30',
                )}
              >
                {/* Scene header row */}
                <div className="flex items-center gap-2 px-3 pt-3 pb-1">
                  <div
                    className={cn(
                      'w-1.5 h-1.5 rounded-full flex-shrink-0 transition-all duration-300',
                      isCurrent ? 'bg-primary scale-125' : 'bg-muted-foreground/20',
                    )}
                  />
                  <span
                    className={cn(
                      'text-[9px] font-bold uppercase tracking-[0.15em] px-1.5 py-[2px] rounded-full',
                      isCurrent
                        ? 'bg-primary/15 text-primary/70'
                        : 'bg-muted/40 text-muted-foreground/30',
                    )}
                  >
                    {pageLabel}
                  </span>
                </div>

                <p
                  className={cn(
                    'text-[11px] font-semibold px-3 pb-1.5 leading-tight',
                    isCurrent ? 'text-foreground/75' : 'text-muted-foreground/45',
                  )}
                >
                  {scene.title}
                </p>

                {scene.type === 'quiz' && actions.length === 0 && (
                  <div className="mx-3 mb-3 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary/8 border border-primary/15">
                    <MessageSquare className="w-3 h-3 text-primary/50 flex-shrink-0" />
                    <span className="text-[10px] text-primary/60">Interactive quiz</span>
                  </div>
                )}

                {actions.length > 0 && (
                  <div className="px-3 pb-3 space-y-2">
                    {actions.map((action) => (
                      <ActionRow key={action.id} action={action} isCurrent={isCurrent} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {scenes.every((s) => getVisibleActions(s).length === 0) && (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-center px-4">
              <BookOpen className="w-8 h-8 text-muted-foreground/15" />
              <p className="text-[11px] text-muted-foreground/30 leading-relaxed">
                Lecture notes will appear here as the lesson plays.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Chat Tab ── */}
      {activeTab === 'chat' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Messages area */}
          <div
            className="flex-1 overflow-y-auto px-3 py-3 space-y-3"
            style={{ scrollbarWidth: 'thin', paddingBottom: 12 }}
          >
            {messages.length === 0 && !isQaLoading ? (
              <div className="h-full flex flex-col items-center justify-center text-center py-10 gap-3 opacity-60">
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center mb-1"
                  style={{ background: 'hsl(245 78% 60% / 0.12)', border: '1px solid hsl(245 78% 60% / 0.2)' }}
                >
                  <MessageSquare className="w-5 h-5 text-primary/50" />
                </div>
                <p className="text-[11px] font-semibold text-muted-foreground/50">Ask a question</p>
                <p className="text-[10px] text-muted-foreground/30 leading-relaxed max-w-[180px]">
                  Type or speak your question below and the teachers will answer before continuing.
                </p>
              </div>
            ) : (
              <>
                {/* System hint at top */}
                <div className="py-1">
                  <p className="text-[9px] text-center text-muted-foreground/25 uppercase tracking-widest">
                    In-class Q&amp;A — playback pauses while agents answer
                  </p>
                </div>

                {messages.map((msg) => {
                  if (msg.type === 'user') return <UserBubble key={msg.id} msg={msg} />;
                  if (msg.type === 'thinking') return <ThinkingBubble key={msg.id} />;
                  if (msg.type === 'agent') return <AgentBubble key={msg.id} msg={msg} agentConfigs={agentConfigs} />;
                  if (msg.type === 'system') {
                    return (
                      <div key={msg.id} className="py-1">
                        <p className="text-[9px] text-center text-muted-foreground/30 italic">{msg.text}</p>
                      </div>
                    );
                  }
                  return null;
                })}

                {isQaLoading && messages[messages.length - 1]?.type !== 'thinking' && <ThinkingBubble />}

                <div ref={chatBottomRef} />
              </>
            )}
          </div>

          {/* Input area */}
          <div
            className="flex-shrink-0 border-t border-border/20 p-3"
            style={{ background: 'hsl(var(--card))' }}
          >
            <div
              className="flex items-end gap-1.5 rounded-xl px-3 py-2"
              style={{ background: 'hsl(var(--background))', border: '1px solid hsl(var(--border) / 0.5)' }}
            >
              <textarea
                ref={inputRef}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={micActive ? 'Listening…' : 'Ask a question…'}
                disabled={isQaLoading}
                rows={1}
                style={{ resize: 'none', scrollbarWidth: 'none', minHeight: 24, maxHeight: 80 }}
                className={cn(
                  'flex-1 bg-transparent text-[12px] text-foreground/80 placeholder:text-muted-foreground/30 outline-none leading-snug py-0.5',
                  isQaLoading && 'opacity-50 cursor-not-allowed',
                )}
              />

              {/* Mic button */}
              {onMicToggle && (
                <button
                  onClick={onMicToggle}
                  disabled={isQaLoading}
                  className={cn(
                    'w-7 h-7 rounded-lg flex items-center justify-center transition-colors flex-shrink-0',
                    micActive
                      ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                      : 'text-muted-foreground/35 hover:text-primary/60 hover:bg-primary/10',
                  )}
                  title={micActive ? 'Stop listening' : 'Speak your question'}
                >
                  {micActive ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                </button>
              )}

              {/* Send button */}
              <button
                onClick={handleSend}
                disabled={!inputText.trim() || isQaLoading}
                className={cn(
                  'w-7 h-7 rounded-lg flex items-center justify-center transition-all flex-shrink-0',
                  inputText.trim() && !isQaLoading
                    ? 'bg-primary/80 text-white hover:bg-primary'
                    : 'bg-muted/30 text-muted-foreground/20 cursor-not-allowed',
                )}
              >
                {isQaLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
            <p className="text-[9px] text-muted-foreground/20 text-center mt-1.5">
              ↵ Enter to send · Shift+Enter for new line
            </p>
          </div>
        </div>
      )}
    </aside>
  );
}
