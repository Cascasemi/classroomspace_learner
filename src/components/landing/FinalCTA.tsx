import { useFadeIn } from "./useFadeIn";

const FinalCTA = () => {
  const ref = useFadeIn();

  return (
    <section className="relative py-24 md:py-32 overflow-hidden">
      <div className="absolute inset-0 glow-radial-sm pointer-events-none" />

      <div ref={ref} className="fade-in-section relative max-w-2xl mx-auto px-6 text-center">
        <h2 className="text-section-title text-foreground mb-4">Your Smartest Classroom Is Waiting</h2>
        <p className="text-muted-foreground mb-8">
          Join thousands of learners experiencing the future of education.
        </p>
        <button className="bg-primary text-primary-foreground px-8 py-3 rounded-full font-medium text-sm hover:opacity-90 transition-opacity">
          Get Started Free →
        </button>
      </div>
    </section>
  );
};

export default FinalCTA;
