import { Check, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useFadeIn } from "./useFadeIn";

const plans = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    popular: false,
    features: ["3 classroom credits", "3 AI agents", "Basic diagnostics", "Community support", "Limited sessions/day"],
  },
  {
    name: "Pro",
    price: "$19",
    period: "/mo",
    popular: true,
    features: ["Unlimited subjects", "Full diagnostic engine", "3+ AI agents", "Spaced repetition", "Priority support"],
  },
  {
    name: "School",
    price: "Custom",
    period: "",
    popular: false,
    features: ["Everything in Pro", "Admin dashboard", "Bulk student onboarding", "Analytics & reporting", "Dedicated support"],
  },
];

const Pricing = () => {
  const ref = useFadeIn();

  return (
    <section id="pricing" className="py-24 md:py-32">
      <div ref={ref} className="fade-in-section max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-4">Plans</p>
          <h2 className="text-section-title text-foreground">Simple, Honest Pricing</h2>
        </div>

        <div className="grid sm:grid-cols-3 gap-5 items-start max-w-4xl mx-auto">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`card-surface card-hover rounded-xl p-6 flex flex-col gap-6 ${
                plan.popular ? "ring-1 ring-primary relative" : ""
              }`}
            >
              {plan.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[11px] bg-primary text-primary-foreground px-3 py-0.5 rounded-full font-medium">
                  Most Popular
                </span>
              )}

              <div>
                <h3 className="text-lg font-semibold text-foreground">{plan.name}</h3>
                <div className="flex items-baseline gap-1 mt-2">
                  <span className="text-3xl font-semibold text-foreground">{plan.price}</span>
                  {plan.period && <span className="text-sm text-muted-foreground">{plan.period}</span>}
                </div>
              </div>

              <ul className="flex flex-col gap-3">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Check size={14} className="text-primary shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>

              <button
                className={`w-full py-2.5 rounded-full text-sm font-medium transition-opacity ${
                  plan.popular
                    ? "bg-primary text-primary-foreground hover:opacity-90"
                    : "border border-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {plan.price === "Custom" ? "Contact Sales" : "Get Started"}
              </button>
            </div>
          ))}
        </div>

        <div className="text-center mt-8">
          <Link
            to="/pricing"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            See full feature comparison <ArrowRight size={13} />
          </Link>
        </div>
      </div>
    </section>
  );
};

export default Pricing;
