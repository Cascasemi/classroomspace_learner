import { useFadeIn } from "./useFadeIn";
import { Cpu, TrendingUp, MessageCircle, CalendarClock, Users, Trophy } from "lucide-react";

const features = [
  { icon: Cpu, title: "Diagnostic Engine", desc: "Maps your knowledge gaps before lesson one." },
  { icon: TrendingUp, title: "Adaptive Difficulty", desc: "Problems that grow harder as you master them." },
  { icon: MessageCircle, title: "Socratic AI Tutor", desc: "Guided questions, not handed answers." },
  { icon: CalendarClock, title: "Spaced Repetition", desc: "Smart review scheduling to fight forgetting." },
  { icon: Users, title: "Multi-Agent Classroom", desc: "Teacher, TA, and peer agents simulate real class." },
  { icon: Trophy, title: "Gamification Layer", desc: "XP, levels, and achievements that reward real progress." },
];

const Features = () => {
  const ref = useFadeIn();

  return (
    <section id="features" className="py-24 md:py-32">
      <div ref={ref} className="fade-in-section max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-4">How It Works</p>
          <h2 className="text-section-title text-foreground">Six Systems Working Together</h2>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="card-surface card-hover rounded-xl p-6 flex flex-col gap-4">
              <Icon size={22} className="text-primary" />
              <h3 className="text-base font-semibold text-foreground">{title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Features;
