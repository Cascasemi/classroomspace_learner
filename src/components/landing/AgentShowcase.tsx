import { useFadeIn } from "./useFadeIn";

const agents = [
  {
    name: "Prof. Nova",
    role: "AI Teacher",
    desc: "Delivers personalized lessons and adjusts in real time.",
    height: "min-h-[260px]",
  },
  {
    name: "Sage",
    role: "Teaching Assistant",
    desc: "Provides hints, worked examples, and clarification.",
    height: "min-h-[280px]",
  },
  {
    name: "Echo",
    role: "Peer Learner",
    desc: "Asks questions alongside you, models curiosity and discussion.",
    height: "min-h-[240px]",
  },
];

const AgentShowcase = () => {
  const ref = useFadeIn();

  return (
    <section className="py-24 md:py-32">
      <div ref={ref} className="fade-in-section max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-section-title text-foreground">Three AI Agents. One Classroom.</h2>
        </div>

        <div className="grid sm:grid-cols-3 gap-5 items-end">
          {agents.map((agent) => (
            <div
              key={agent.name}
              className={`card-surface card-hover rounded-xl p-6 flex flex-col justify-end gap-5 ${agent.height}`}
            >
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <h3 className="text-lg font-semibold text-foreground">{agent.name}</h3>
                  <span className="text-[11px] px-2.5 py-0.5 rounded-full border border-primary/30 text-primary font-medium">
                    {agent.role}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">{agent.desc}</p>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--agent-active))] animate-pulse-dot" />
                Active in session
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default AgentShowcase;
