import { useFadeIn } from "./useFadeIn";

const steps = [
  { num: "01", title: "Diagnostic Assessment", desc: "We map your strengths and gaps." },
  { num: "02", title: "Personalized Pathway", desc: "A curriculum built just for you." },
  { num: "03", title: "Adaptive Sessions", desc: "Learn at your pace with AI agents." },
  { num: "04", title: "Progress & Retention", desc: "Continuous review locks in mastery." },
];

const HowItWorks = () => {
  const ref = useFadeIn();

  return (
    <section id="how-it-works" className="py-24 md:py-32">
      <div ref={ref} className="fade-in-section max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-4">The Process</p>
          <h2 className="text-section-title text-foreground">From First Login to Mastery</h2>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {steps.map((step, i) => (
            <div key={step.num} className="relative flex flex-col items-center text-center gap-4">
              {/* Connector line (hidden on first and mobile) */}
              {i > 0 && (
                <div className="hidden lg:block absolute top-5 -left-4 w-8 h-px bg-muted" />
              )}

              <div className="w-10 h-10 rounded-full border border-primary/40 flex items-center justify-center text-sm font-semibold text-primary">
                {step.num}
              </div>
              <h3 className="text-sm font-semibold text-foreground">{step.title}</h3>
              <p className="text-sm text-muted-foreground">{step.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
