import { useFadeIn } from "./useFadeIn";

const stats = [
  { value: "4,200+", label: "Learners" },
  { value: "38", label: "Countries" },
  { value: "94%", label: "Report improved grades" },
  { value: "3x", label: "Faster concept mastery" },
];

const StatsBar = () => {
  const ref = useFadeIn();

  return (
    <section className="py-20 md:py-24 border-y border-muted">
      <div ref={ref} className="fade-in-section max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-10 text-center">
          {stats.map((stat) => (
            <div key={stat.label}>
              <p className="text-3xl md:text-4xl font-semibold text-foreground">{stat.value}</p>
              <p className="text-sm text-muted-foreground mt-1">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default StatsBar;
