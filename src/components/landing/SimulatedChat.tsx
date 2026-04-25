/**
 * SimulatedChat — Hero section classroom preview
 *
 * Mirrors the REAL OpenClass Learner classroom generation flow:
 *   1. User types lesson topic & sends
 *   2. GenerationProgressScreen — progress bar, pipeline steps, agent pills
 *   3. AgentRevealModal — "Your Classroom is Ready", holographic agent cards
 *   4. Classroom — slide sections + participant bar dialogue
 */
import { useEffect, useRef, useState } from "react";
import { Paperclip, SendHorizonal } from "lucide-react";

// ─── Data ─────────────────────────────────────────────────────────────────────

const PROMPT = "Teach me quantum superposition";

const AGENTS = [
  { id: "teacher", name: "Prof. Anya", role: "teacher",   color: "#6366f1", avatar: "/avatars/females/Prof_Naa.png",    persona: "Expert physicist who makes abstract ideas tangible." },
  { id: "s1",      name: "Maya",       role: "assistant", color: "#10b981", avatar: "/avatars/females/Assistant1.svg", persona: "Adds real-world examples and fills gaps." },
  { id: "s2",      name: "Sam",        role: "student",   color: "#f59e0b", avatar: "/avatars/males/Brian.svg",        persona: "Curious learner who asks probing questions." },
  { id: "s3",      name: "Emily",      role: "student",   color: "#ec4899", avatar: "/avatars/females/Amaya.svg",      persona: "Connects theory to real-world applications." },
] as const;

type AgentId = (typeof AGENTS)[number]["id"];

const PIPELINE_STEPS = [
  { id: "source",    label: "Analysing your topic",          emoji: "🔍", startAt: 0,  doneAt: 12 },
  { id: "outline",   label: "Building the lesson outline",   emoji: "🧭", startAt: 12, doneAt: 30 },
  { id: "content",   label: "Generating opening scenes",     emoji: "✨", startAt: 30, doneAt: 60 },
  { id: "classroom", label: "Opening the classroom",         emoji: "🚪", startAt: 60, doneAt: 100 },
] as const;

const GEN_MESSAGES = [
  [0,  "Initialising AI pipeline…"],
  [8,  "Analysing quantum superposition…"],
  [18, "Building lesson outline…"],
  [30, "Generating opening scenes…"],
  [50, "Assembling classroom environment…"],
  [62, "Classroom ready — opening…"],
] as [number, string][];

type SectionType = "heading" | "text" | "bullets" | "callout";
interface SlideSection { id: string; type: SectionType; content: string | string[] }

const SECTIONS: SlideSection[] = [
  { id: "s0", type: "heading",  content: "Wave Function & Probability" },
  { id: "s1", type: "text",     content: "A quantum system is described by its wave function ψ — encoding the probability of finding the particle in any state before measurement." },
  { id: "s2", type: "bullets",  content: ["Particle exists in all states simultaneously", "Measurement collapses the wave function", "Probability = |ψ|² for each outcome"] },
  { id: "s3", type: "callout",  content: "Key Insight: Measurement doesn't reveal a pre-existing value — it actively creates the outcome." },
];

interface DialogueStep { agent: AgentId; text: string; reveal?: number; highlight?: string }

const SCRIPT: DialogueStep[] = [
  { agent: "teacher", text: "Quantum superposition is one of the most counterintuitive ideas in physics. Let's unpack the wave function.", reveal: 0 },
  { agent: "teacher", text: "Before observation, a particle has no definite position — spread across all possibilities, described by ψ.", reveal: 1, highlight: "s1" },
  { agent: "s2",      text: "So it's literally in multiple places at the same time? Not just unknown?" },
  { agent: "teacher", text: "Exactly right, Sam. Superposition is a physical reality, not hidden information.", reveal: 2, highlight: "s2" },
  { agent: "s1",      text: "That connects to qubits — they hold 0 and 1 simultaneously until you read them!" },
  { agent: "teacher", text: "Perfect, Maya. Qubits exploit superposition to process many states in parallel.", reveal: 3, highlight: "s3" },
];

const WAVE_BARS = [
  { h: 10, delay: "0ms" }, { h: 18, delay: "80ms" }, { h: 8, delay: "40ms" },
  { h: 16, delay: "120ms" }, { h: 22, delay: "60ms" }, { h: 10, delay: "100ms" },
] as const;

const ROLE_META: Record<string, { label: string; glyph: string }> = {
  teacher:   { label: "Lead Teacher", glyph: "⚡" },
  assistant: { label: "Assistant",    glyph: "🌿" },
  student:   { label: "Student",      glyph: "🔮" },
};

// ─── Phase ────────────────────────────────────────────────────────────────────

type Phase = "typing" | "sent" | "generating" | "reveal" | "enter-classroom" | "classroom";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function agentById(id: AgentId) { return AGENTS.find((a) => a.id === id)!; }

function useTypewriter(text: string | null, speedMs = 26) {
  const [revealed, setRevealed] = useState("");
  const [done, setDone] = useState(false);
  useEffect(() => {
    setRevealed(""); setDone(false);
    if (!text) return;
    let i = 0;
    let handle: ReturnType<typeof setTimeout>;
    const tick = () => { i++; setRevealed(text.slice(0, i)); if (i >= text.length) { setDone(true); return; } handle = setTimeout(tick, speedMs); };
    handle = setTimeout(tick, speedMs);
    return () => clearTimeout(handle);
  }, [text, speedMs]);
  return { revealed, done };
}

// ─── AgentPill (Generation screen — agent appearing in list) ─────────────────

function AgentPill({ agent, visible }: { agent: (typeof AGENTS)[number]; visible: boolean }) {
  const isImg = agent.avatar.startsWith("/");
  const roleClass: Record<string, string> = {
    teacher:   "bg-blue-500/10 text-blue-400",
    assistant: "bg-emerald-500/10 text-emerald-400",
    student:   "bg-amber-500/10 text-amber-400",
  };
  return (
    <div
      className="flex items-center gap-2 px-2.5 py-2 rounded-xl border transition-all duration-700"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(8px)",
        borderColor: `${agent.color}22`,
        background: `linear-gradient(145deg, ${agent.color}09 0%, transparent 100%)`,
        transitionTimingFunction: "cubic-bezier(0.23,1,0.32,1)",
      }}
    >
      <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center overflow-hidden"
        style={{ border: `1.5px solid ${agent.color}45`, boxShadow: `0 0 8px ${agent.color}25` }}>
        {isImg
          ? <img src={agent.avatar} alt={agent.name} className="w-full h-full object-cover" />
          : <span className="text-xs font-bold" style={{ color: agent.color }}>{agent.name[0]}</span>}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold text-foreground truncate">{agent.name}</p>
        <span className={`text-[8px] font-bold uppercase tracking-wider px-1.5 py-px rounded-full ${roleClass[agent.role] ?? "bg-primary/10 text-primary"}`}>
          {agent.role}
        </span>
      </div>
    </div>
  );
}

// ─── AgentRevealCard ──────────────────────────────────────────────────────────

function AgentRevealCard({ agent, emerged }: { agent: (typeof AGENTS)[number]; emerged: boolean }) {
  const isImg = agent.avatar.startsWith("/");
  const meta = ROLE_META[agent.role] ?? { label: agent.role, glyph: "✦" };
  return (
    <div
      className="relative w-[100px]"
      style={{
        opacity: emerged ? 1 : 0,
        transform: emerged ? "translateY(0) scale(1)" : "translateY(28px) scale(0.88)",
        transition: "opacity 0.55s cubic-bezier(0.23,1,0.32,1), transform 0.55s cubic-bezier(0.23,1,0.32,1)",
      }}
    >
      {/* glow halo */}
      <div className="absolute -inset-2 rounded-2xl blur-lg opacity-20 pointer-events-none" style={{ background: agent.color }} />
      {/* card */}
      <div className="relative rounded-2xl overflow-hidden border" style={{ borderColor: `${agent.color}35`, background: "hsl(var(--card)/0.97)" }}>
        {/* aurora top */}
        <div className="h-12 w-full relative overflow-hidden"
          style={{ background: `linear-gradient(160deg, ${agent.color}22 0%, transparent 100%)` }}>
          <span className="absolute top-2 right-2.5 text-[12px] opacity-40">{meta.glyph}</span>
        </div>
        {/* avatar */}
        <div className="relative -mt-6 flex justify-center">
          <div className="w-12 h-12 rounded-full flex items-center justify-center overflow-hidden"
            style={{ border: `2px solid ${agent.color}60`, background: "hsl(var(--card))", boxShadow: `0 0 0 3px ${agent.color}14` }}>
            {isImg
              ? <img src={agent.avatar} alt={agent.name} className="w-full h-full object-cover" />
              : <span className="text-lg font-bold" style={{ color: agent.color }}>{agent.name[0]}</span>}
          </div>
        </div>
        {/* text */}
        <div className="px-2.5 pb-3 pt-2 space-y-1">
          <h3 className="text-[10px] font-bold text-center truncate" style={{ color: agent.color }}>{agent.name}</h3>
          <div className="flex justify-center">
            <span className="text-[8px] font-bold uppercase tracking-wide px-1.5 py-[2px] rounded-full"
              style={{ background: `${agent.color}14`, color: agent.color, border: `1px solid ${agent.color}25` }}>
              {meta.label}
            </span>
          </div>
          <p className="text-[8px] leading-[1.5] text-foreground/35 text-center line-clamp-2 mt-1">{agent.persona.split(".")[0]}</p>
        </div>
      </div>
    </div>
  );
}

// ─── AgentAvatar (participant bar) ───────────────────────────────────────────

function AgentAvatar({ id, size = 36, active = false }: { id: AgentId; size?: number; active?: boolean }) {
  const agent = agentById(id);
  const [imgErr, setImgErr] = useState(false);
  return (
    <div className="flex flex-col items-center gap-0.5 shrink-0">
      <div className="relative">
        <div className="rounded-full overflow-hidden flex items-center justify-center font-bold"
          style={{ width: size, height: size, boxShadow: active ? `0 0 0 2px ${agent.color}, 0 0 8px ${agent.color}60` : `0 0 0 1.5px ${agent.color}30`, transition: "box-shadow 0.3s" }}>
          {!imgErr
            ? <img src={agent.avatar} alt={agent.name} className="w-full h-full object-cover" onError={() => setImgErr(true)} />
            : <span style={{ color: agent.color, fontSize: size * 0.36 }}>{agent.name[0]}</span>}
        </div>
        {active && <span className="absolute -top-[2px] -right-[2px] w-2 h-2 rounded-full bg-green-500 border-2 border-background block" />}
      </div>
      <span className="text-[7.5px] font-semibold max-w-[40px] truncate text-center leading-tight" style={{ color: "hsl(var(--foreground)/0.55)" }}>{agent.name}</span>
    </div>
  );
}

// ─── SlideSectionEl ───────────────────────────────────────────────────────────

function SlideSectionEl({ section, visible, highlighted }: { section: SlideSection; visible: boolean; highlighted: boolean }) {
  return (
    <div className="transition-all duration-500" style={{ opacity: visible ? 1 : 0, transform: visible ? "none" : "translateY(6px)", height: visible ? undefined : 0, overflow: visible ? undefined : "hidden" }}>
      <div style={{ borderRadius: 10, padding: "6px 8px", outline: highlighted ? "2px solid hsl(var(--primary)/0.45)" : "none", boxShadow: highlighted ? "0 0 12px hsl(var(--primary)/0.15)" : "none", transition: "outline 0.3s, box-shadow 0.3s" }}>
        {section.type === "heading" && <h2 className="font-bold leading-tight" style={{ fontSize: 13, color: "hsl(var(--foreground))" }}>{section.content as string}</h2>}
        {section.type === "text" && <p className="leading-relaxed" style={{ fontSize: 9.5, color: "hsl(var(--foreground)/0.75)" }}>{section.content as string}</p>}
        {section.type === "bullets" && (
          <ul className="space-y-[3px]">
            {(section.content as string[]).map((item, i) => (
              <li key={i} className="flex items-start gap-1.5" style={{ fontSize: 9, color: "hsl(var(--foreground)/0.75)" }}>
                <span className="mt-[3px] w-1 h-1 rounded-full shrink-0" style={{ background: "hsl(var(--primary))" }} />
                {item}
              </li>
            ))}
          </ul>
        )}
        {section.type === "callout" && (
          <div className="rounded-lg px-2.5 py-2" style={{ background: "hsl(var(--primary)/0.08)", borderLeft: "3px solid hsl(var(--primary)/0.6)" }}>
            <p className="leading-snug font-medium" style={{ fontSize: 9, color: "hsl(var(--primary)/0.9)" }}>{section.content as string}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SimulatedChat() {
  // ── Pre-classroom
  const [phase, setPhase] = useState<Phase>("typing");
  const [typedChars, setTypedChars] = useState(0);

  // ── Generation progress (0–65)
  const [genProgress, setGenProgress] = useState(0);

  // ── Reveal
  const [emergedCount, setEmergedCount] = useState(0);

  // ── Classroom
  const [stepIndex, setStepIndex] = useState(0);
  const [revealedSections, setRevealedSections] = useState<Set<number>>(new Set());
  const [highlightedSection, setHighlightedSection] = useState<string | null>(null);
  const [speechPlaying, setSpeechPlaying] = useState(false);

  const holdRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = () => { if (holdRef.current) clearTimeout(holdRef.current); };

  // ── Typewriter for classroom dialogue
  const classroomText = phase === "classroom" ? SCRIPT[stepIndex].text : null;
  const { revealed: speechRevealed, done: speechDone } = useTypewriter(classroomText, 26);

  // ═══ TYPING ══════════════════════════════════════════════════════════════════

  useEffect(() => {
    if (phase !== "typing") return;
    if (typedChars >= PROMPT.length) { clear(); holdRef.current = setTimeout(() => setPhase("sent"), 400); return clear; }
    holdRef.current = setTimeout(() => setTypedChars((c) => c + 1), 52);
    return clear;
  }, [phase, typedChars]);

  // ═══ SENT → GENERATING ═══════════════════════════════════════════════════════

  useEffect(() => {
    if (phase !== "sent") return;
    holdRef.current = setTimeout(() => { setGenProgress(0); setPhase("generating"); }, 600);
    return clear;
  }, [phase]);

  // ═══ GENERATING: progress 0 → 65 ════════════════════════════════════════════

  useEffect(() => {
    if (phase !== "generating") return;
    if (genProgress >= 65) {
      holdRef.current = setTimeout(() => { setEmergedCount(0); setPhase("reveal"); }, 500);
      return clear;
    }
    holdRef.current = setTimeout(() => setGenProgress((p) => p + 1), 72);
    return clear;
  }, [phase, genProgress]);

  // ═══ REVEAL: agents emerge one by one ═══════════════════════════════════════

  useEffect(() => {
    if (phase !== "reveal") return;
    if (emergedCount >= AGENTS.length) return; // wait for "Enter" click simulation
    holdRef.current = setTimeout(() => setEmergedCount((c) => c + 1), 480);
    return clear;
  }, [phase, emergedCount]);

  // auto-advance after all agents emerged
  useEffect(() => {
    if (phase !== "reveal" || emergedCount < AGENTS.length) return;
    holdRef.current = setTimeout(() => setPhase("enter-classroom"), 2200);
    return clear;
  }, [phase, emergedCount]);

  // ═══ ENTER CLASSROOM ═════════════════════════════════════════════════════════

  useEffect(() => {
    if (phase !== "enter-classroom") return;
    holdRef.current = setTimeout(() => {
      setStepIndex(0);
      setRevealedSections(new Set());
      setHighlightedSection(null);
      setSpeechPlaying(true);
      setPhase("classroom");
    }, 800);
    return clear;
  }, [phase]);

  // ═══ CLASSROOM ═══════════════════════════════════════════════════════════════

  useEffect(() => {
    if (phase !== "classroom") return;
    const step = SCRIPT[stepIndex];
    if (step.reveal !== undefined) {
      setRevealedSections((prev) => {
        const next = new Set(prev);
        for (let i = 0; i <= step.reveal!; i++) next.add(i);
        return next;
      });
    }
    setHighlightedSection(step.highlight ?? null);
    setSpeechPlaying(true);
  }, [phase, stepIndex]);

  useEffect(() => {
    if (phase !== "classroom" || !speechDone) return;
    setSpeechPlaying(false);
    const isLast = stepIndex === SCRIPT.length - 1;
    holdRef.current = setTimeout(() => {
      if (isLast) {
        setTypedChars(0);
        setGenProgress(0);
        setEmergedCount(0);
        setPhase("typing");
      } else {
        setStepIndex((i) => i + 1);
      }
    }, isLast ? 2800 : 900);
    return clear;
  }, [speechDone, phase, stepIndex]);

  // ─── Derived ───────────────────────────────────────────────────────────────

  const isClassroom  = phase === "classroom";
  const isEntering   = phase === "enter-classroom";
  const isGenerating = phase === "generating";
  const isReveal     = phase === "reveal";
  const showInput    = phase === "typing" || phase === "sent";

  // pipeline step status
  type StepStatus = "waiting" | "active" | "done";
  const stepStatus = (startAt: number, doneAt: number): StepStatus => {
    if (genProgress >= doneAt) return "done";
    if (genProgress >= startAt) return "active";
    return "waiting";
  };

  // live message
  const genMessage = GEN_MESSAGES.reduce((m, [t, s]) => genProgress >= t ? s : m, GEN_MESSAGES[0][1]);

  const showAgentPills = genProgress >= 18;

  const step         = SCRIPT[stepIndex];
  const speakerAgent = agentById(step.agent);
  const accentColor  = isClassroom ? speakerAgent.color : "#6366f1";
  const teacher      = agentById("teacher");
  const students     = AGENTS.filter((a) => a.role !== "teacher");

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="rounded-2xl overflow-hidden border flex flex-col"
      style={{ height: 460, background: "hsl(var(--card))", borderColor: "hsl(var(--border)/0.5)", boxShadow: "0 8px 40px rgba(0,0,0,0.18)" }}>

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b shrink-0"
        style={{ background: "hsl(var(--muted)/0.3)", borderColor: "hsl(var(--border))" }}>
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
            <span className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
          </div>
          <span className="text-[11px] font-medium ml-2 tracking-wide" style={{ color: "hsl(var(--muted-foreground))" }}>
            {isClassroom || isEntering ? "OpenClass Learner · Quantum Superposition" : "OpenClass Learner · New Classroom"}
          </span>
        </div>
        <span className="flex items-center gap-1.5 text-[11px]" style={{ color: "hsl(var(--primary))" }}>
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "hsl(var(--primary))" }} />
          {isClassroom ? "Live" : isGenerating || isReveal ? "Generating" : "AI"}
        </span>
      </div>

      {/* ── Body ── */}
      <div className="relative flex-1 min-h-0 overflow-hidden">

        {/* ── INPUT phase: typing UI ── */}
        {showInput && (
          <div className="absolute inset-0 flex flex-col justify-end p-3">
            {phase === "sent" && (
              <div className="flex justify-end">
                <div className="bg-gradient-to-br from-purple-600 to-purple-700 text-white px-3 py-2 rounded-xl rounded-tr-sm text-[11.5px] leading-relaxed max-w-[82%] shadow-sm shadow-purple-900/40 ring-1 ring-purple-500/20">
                  {PROMPT}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── GENERATING: GenerationProgressScreen (compact) ── */}
        {isGenerating && (
          <div className="absolute inset-0 overflow-y-auto px-4 py-4" style={{ scrollbarWidth: "none" }}>
            {/* sweep beam */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-b-2xl">
              <div className="absolute inset-x-0 h-[1.5px] opacity-0"
                style={{ background: "linear-gradient(90deg, transparent 0%, hsl(265 78% 75% / 0.35) 50%, transparent 100%)", animation: "schat-sweep 4s ease-in-out infinite" }} />
            </div>

            <div className="relative z-10 space-y-3">
              {/* Header */}
              <div className="flex items-center gap-2">
                <div className="relative w-5 h-5">
                  <div className="absolute inset-0 rounded-full animate-ping opacity-15" style={{ background: "hsl(245 78% 58%)" }} />
                  <div className="absolute inset-[2px] rounded-full" style={{ background: "linear-gradient(135deg, hsl(245 78% 65%), hsl(285 70% 60%))", boxShadow: "0 0 8px hsl(265 75% 55% / 0.5)" }} />
                </div>
                <span className="text-[9px] font-bold tracking-[0.2em] uppercase text-primary/55">OpenClass Learner AI</span>
              </div>

              <div>
                <h2 className="text-[15px] font-bold text-foreground">Building Your Classroom</h2>
                <p className="text-[10px] text-muted-foreground/50 mt-0.5">AI crafting lessons for your learning style</p>
              </div>

              {/* Progress bar */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-bold tracking-[0.15em] uppercase text-muted-foreground/40">Progress</span>
                  <span className="text-[11px] font-bold tabular-nums" style={{ color: "hsl(265 78% 72%)" }}>{genProgress}%</span>
                </div>
                <div className="relative h-[3px] rounded-full overflow-hidden bg-muted">
                  <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${genProgress}%`, background: "linear-gradient(90deg, hsl(245 78% 55%) 0%, hsl(285 72% 62%) 55%, hsl(315 80% 68%) 100%)", boxShadow: "0 0 8px hsl(265 75% 60% / 0.7)" }} />
                  {genProgress > 0 && genProgress < 100 && (
                    <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full transition-all duration-300 ease-out"
                      style={{ left: `${genProgress}%`, background: "white", boxShadow: "0 0 5px 2px hsl(265 75% 70% / 0.9)" }} />
                  )}
                </div>
              </div>

              {/* Status message */}
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-muted/60">
                <span className="w-1 h-1 rounded-full bg-primary/70 animate-pulse flex-shrink-0" />
                <span className="text-[10px] font-mono text-foreground/50 truncate">{genMessage}</span>
              </div>

              {/* Pipeline steps */}
              <div className="space-y-1">
                {PIPELINE_STEPS.map((s) => {
                  const st = stepStatus(s.startAt, s.doneAt);
                  return (
                    <div key={s.id} className="flex items-center gap-2.5 px-3 py-2 rounded-xl border transition-all duration-500"
                      style={{
                        borderColor: st === "active" ? "hsl(var(--primary)/0.2)" : "transparent",
                        background: st === "active" ? "hsl(var(--primary)/0.06)" : "transparent",
                        opacity: st === "waiting" ? 0.28 : st === "done" ? 0.5 : 1,
                      }}>
                      <span className="text-[12px] leading-none">{st === "done" ? "✓" : s.emoji}</span>
                      <span className="flex-1 text-[11px] font-medium" style={{ color: st === "active" ? "hsl(var(--foreground))" : "hsl(var(--foreground)/0.6)" }}>{s.label}</span>
                      {st === "active" && (
                        <span className="flex items-center gap-[3px]">
                          {[0, 1, 2].map((i) => (
                            <span key={i} className="w-1 h-1 rounded-full bg-primary/60 animate-pulse" style={{ animationDelay: `${i * 200}ms` }} />
                          ))}
                        </span>
                      )}
                      {st === "done" && <span className="text-[8px] font-bold tracking-widest text-emerald-400/70">DONE</span>}
                    </div>
                  );
                })}
              </div>

              {/* Agent pills */}
              {showAgentPills && (
                <div className="space-y-2 pt-1">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
                    <span className="text-[9px] font-bold tracking-[0.15em] uppercase text-foreground/30 whitespace-nowrap">Your Teaching Team</span>
                    <div className="flex-1 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {AGENTS.map((agent, i) => (
                      <AgentPill key={agent.id} agent={agent} visible={genProgress >= 18 + i * 5} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── REVEAL: AgentRevealModal (compact) ── */}
        {(isReveal || isEntering) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center px-3 py-4 z-20"
            style={{ background: "hsl(var(--background)/0.94)", backdropFilter: "blur(20px)" }}>
            {/* aurora */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-[40%] opacity-[0.07]"
                style={{ background: "conic-gradient(from 200deg at 50% -20%, hsl(245 78% 65%) 0deg, hsl(285 70% 60%) 60deg, hsl(210 78% 65%) 120deg, transparent 180deg)", filter: "blur(28px)" }} />
            </div>

            <div className="relative z-10 flex flex-col items-center gap-3 w-full">
              {/* wordmark */}
              <div className="flex items-center gap-1.5">
                <div className="w-1 h-1 rounded-full" style={{ background: "hsl(245 78% 68%)", boxShadow: "0 0 6px hsl(245 78% 68%)" }} />
                <span className="text-[9px] font-bold tracking-[0.22em] uppercase text-primary/50">OpenClass Learner</span>
                <div className="w-1 h-1 rounded-full" style={{ background: "hsl(285 70% 65%)", boxShadow: "0 0 6px hsl(285 70% 65%)" }} />
              </div>

              <div className="text-center">
                <h2 className="text-[16px] font-bold text-foreground">Your Classroom is Ready</h2>
                <p className="text-[10px] text-muted-foreground/60 mt-0.5">Meet the team guiding your journey</p>
              </div>

              {/* agent cards */}
              <div className="flex justify-center gap-2 flex-wrap">
                {AGENTS.map((agent, i) => (
                  <AgentRevealCard key={agent.id} agent={agent} emerged={i < emergedCount} />
                ))}
              </div>

              {/* dot progress */}
              <div className="flex items-center gap-1.5">
                {AGENTS.map((_, i) => (
                  <div key={i} className="rounded-full transition-all duration-500"
                    style={{
                      width: i < emergedCount ? 16 : 5,
                      height: 5,
                      background: i < emergedCount
                        ? "linear-gradient(90deg, hsl(245 78% 65%), hsl(285 70% 60%))"
                        : "hsl(0 0% 100% / 0.12)",
                      boxShadow: i < emergedCount ? "0 0 6px hsl(265 75% 55% / 0.5)" : "none",
                    }} />
                ))}
              </div>

              {/* enter button (auto-advances) */}
              {emergedCount >= AGENTS.length && (
                <button
                  className="relative overflow-hidden rounded-full px-6 py-2 text-[12px] font-bold text-white transition-all duration-500"
                  style={{
                    background: "linear-gradient(135deg, hsl(245 78% 55%) 0%, hsl(285 72% 58%) 50%, hsl(305 80% 62%) 100%)",
                    boxShadow: "0 0 24px hsl(265 75% 50% / 0.45), 0 4px 12px hsl(245 78% 35% / 0.4)",
                    opacity: isEntering ? 0.5 : 1,
                  }}
                >
                  Enter Classroom →
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── CLASSROOM: slide content ── */}
        {isClassroom && (
          <div className="absolute inset-0 overflow-y-auto px-5 pt-4 pb-2" style={{ scrollbarWidth: "none" }}>
            <div className="space-y-2">
              {SECTIONS.map((section, i) => (
                <SlideSectionEl key={section.id} section={section} visible={revealedSections.has(i)} highlighted={highlightedSection === section.id} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Bottom bars ── */}

      {/* Input bar — typing / sent */}
      {showInput && (
        <div className="shrink-0 border-t border-border bg-muted/10 px-3 py-2.5 flex items-center gap-2">
          <button className="text-muted-foreground/40 shrink-0"><Paperclip size={13} /></button>
          <div className="flex-1 rounded-lg bg-background/60 border border-border px-3 py-1.5 text-[11px] min-h-[28px] flex items-center overflow-hidden">
            {phase === "typing" ? (
              <span className="text-foreground/80">
                {PROMPT.slice(0, typedChars)}
                {typedChars < PROMPT.length && <span className="inline-block w-[1.5px] h-[11px] bg-primary ml-px align-middle animate-pulse" />}
              </span>
            ) : (
              <span className="text-muted-foreground/50">Ask your classroom anything…</span>
            )}
          </div>
          <button className="w-7 h-7 rounded-full bg-primary flex items-center justify-center shrink-0">
            <SendHorizonal size={11} className="text-primary-foreground" />
          </button>
        </div>
      )}

      {/* Participant bar — classroom */}
      {isClassroom && (
        <div className="shrink-0 px-3 pb-3">
          <div className="flex items-stretch overflow-hidden"
            style={{ background: "hsl(var(--card)/0.96)", border: `1px solid ${accentColor}22`, boxShadow: `0 -4px 24px rgba(0,0,0,0.35), 0 0 0 1px ${accentColor}15`, backdropFilter: "blur(20px)", borderRadius: 14, minHeight: 74, position: "relative", transition: "border-color 0.4s, box-shadow 0.4s" }}>

            {/* accent stripe */}
            <div className="absolute left-0 inset-y-0 w-[3px] rounded-l-[13px]"
              style={{ background: `linear-gradient(180deg,${accentColor},${accentColor}40)`, transition: "background 0.4s" }} />

            {/* teacher */}
            <div className="flex flex-col items-center justify-center gap-1 pl-4 pr-3 py-3 shrink-0 border-r"
              style={{ minWidth: 66, background: `linear-gradient(135deg,${teacher.color}14,transparent)`, borderColor: "hsl(var(--border)/0.2)" }}>
              <AgentAvatar id="teacher" size={42} active={step.agent === "teacher"} />
            </div>

            {/* wave + typewriter */}
            <div className="flex-1 flex items-center gap-2.5 px-3 py-3 min-w-0">
              {speechPlaying && (
                <div className="flex items-end gap-[2px] shrink-0">
                  {WAVE_BARS.map((bar, i) => (
                    <div key={i} className="w-[2px] rounded-full origin-bottom"
                      style={{ height: bar.h, backgroundColor: accentColor, animation: `wave-bar 0.65s ${bar.delay} ease-in-out infinite` }} />
                  ))}
                </div>
              )}
              <div className="flex-1 leading-relaxed overflow-y-auto"
                style={{ fontSize: 11.5, maxHeight: 60, scrollbarWidth: "none", color: "hsl(var(--foreground)/0.85)" }}>
                {speechRevealed}
                {speechPlaying && speechRevealed.length < step.text.length && (
                  <span className="inline-block w-[2px] h-[11px] ml-0.5 rounded-full opacity-80 align-middle animate-pulse" style={{ backgroundColor: accentColor }} />
                )}
              </div>
            </div>

            {/* students + you */}
            <div className="flex items-center gap-2 px-3 py-3 border-l shrink-0"
              style={{ borderColor: "hsl(var(--border)/0.2)", background: "linear-gradient(225deg,hsl(245 78% 60%/0.07),transparent)" }}>
              {students.map((s) => <AgentAvatar key={s.id} id={s.id} size={32} active={step.agent === s.id} />)}
              <div className="flex flex-col items-center gap-0.5 shrink-0">
                <div className="rounded-full flex items-center justify-center"
                  style={{ width: 32, height: 32, background: "hsl(245 78% 60%/0.12)", boxShadow: "0 0 0 1.5px hsl(245 78% 60%/0.35)", fontSize: 9, fontWeight: 700, color: "hsl(var(--primary)/0.7)" }}>Y</div>
                <span className="text-[7.5px] font-semibold leading-tight" style={{ color: "hsl(var(--foreground)/0.55)" }}>You</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Keyframes */}
      <style>{`
        @keyframes schat-sweep {
          0%   { top: -2px; opacity: 0; }
          8%   { opacity: 1; }
          92%  { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
      `}</style>
    </div>
  );
}
