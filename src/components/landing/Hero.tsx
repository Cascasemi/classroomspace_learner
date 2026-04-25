import { Play } from "lucide-react";
import SimulatedChat from "./SimulatedChat";

const avatars = [
  "bg-primary/60",
  "bg-primary/40",
  "bg-primary/80",
  "bg-muted",
  "bg-primary/50",
];

const Hero = () => {

  return (
    <section className="relative pt-32 pb-24 md:pt-44 md:pb-32 overflow-hidden">
      {/* Glow */}
      <div className="absolute inset-0 glow-radial pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left */}
          <div className="flex flex-col gap-8">
            {/* Badge */}
            <div className="inline-flex self-start items-center gap-2 px-4 py-1.5 rounded-full border border-primary/30 text-primary text-xs font-medium tracking-wide">
              <span>✦</span> AI-Powered Classroom
            </div>

            <h1 className="text-hero">
              Your AI Classroom Adapts to How You Think
            </h1>

            <p className="text-muted-foreground text-lg leading-relaxed max-w-lg">
              OpenClass Learner combines multi-agent AI, Socratic tutoring, and spaced repetition to create a learning experience that's uniquely yours.
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap items-center gap-4">
              <button className="bg-primary text-primary-foreground px-7 py-3 rounded-full font-medium text-sm hover:opacity-90 transition-opacity">
                Start Learning Free
              </button>
              <button className="flex items-center gap-2 px-6 py-3 rounded-full border border-muted text-sm text-muted-foreground hover:text-foreground transition-colors">
                <Play size={14} className="text-primary" />
                Watch Demo
              </button>
            </div>

            {/* Social proof */}
            <div className="flex items-center gap-3 pt-2">
              <div className="flex -space-x-2">
                {avatars.map((bg, i) => (
                  <div key={i} className={`w-7 h-7 rounded-full ${bg} border-2 border-background`} />
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Trusted by <span className="text-foreground font-medium">4,200+</span> learners in 38 countries
              </p>
            </div>
          </div>

          {/* Right — Simulated Chat */}
          <div className="hidden lg:block">
            <SimulatedChat />
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
