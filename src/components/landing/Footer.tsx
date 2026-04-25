import { Link } from "react-router-dom";

const links: Record<string, { label: string; href: string }[]> = {
  Product: [
    { label: "Features", href: "/features" },
    { label: "Pricing", href: "#pricing" },
  ],
  Company: [
    { label: "About", href: "/about" },
    { label: "Press Kit", href: "/press-kit" },
    { label: "Safety", href: "/safety" },
  ],
  Support: [
    { label: "Help Center", href: "/help" },
    { label: "Contact", href: "/contact" },
  ],
};

const legalLinks = [
  { label: "Privacy Policy", href: "#" },
  { label: "Terms of Use", href: "#" },
  { label: "Community Guidelines", href: "#" },
];

const Footer = () => (
  <footer className="border-t border-muted">
    {/* ── Main footer body ─────────────────────────────────────────── */}
    <div className="max-w-7xl mx-auto px-6 py-12 flex flex-col md:flex-row justify-between gap-10">
      {/* Logo */}
      <div className="flex items-center gap-1.5 text-foreground font-semibold text-sm tracking-tight">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary" />
        OpenClass Learner
      </div>

      {/* Link columns */}
      <div className="flex flex-wrap gap-16">
        {Object.entries(links).map(([heading, items]) => (
          <div key={heading} className="flex flex-col gap-3">
            <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">{heading}</p>
            {items.map((item) =>
              item.href.startsWith("/") ? (
                <Link
                  key={item.label}
                  to={item.href}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {item.label}
                </Link>
              ) : (
                <a
                  key={item.label}
                  href={item.href}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {item.label}
                </a>
              )
            )}
          </div>
        ))}
      </div>

      {/* Copyright */}
      <p className="text-xs text-muted-foreground self-end md:self-auto">
        © {new Date().getFullYear()} OpenClass Learner
      </p>
    </div>

    {/* ── Sub-footer strip ──────────────────────────────────────────── */}
    <div className="border-t border-muted/60">
      <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col items-center gap-3">
        {/* Legal links */}
        <div className="flex items-center gap-1 flex-wrap justify-center">
          {legalLinks.map((link, i) => (
            <span key={link.label} className="flex items-center gap-1">
              {i !== 0 && (
                <span className="text-muted-foreground/40 select-none text-xs">·</span>
              )}
              <a
                href={link.href}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {link.label}
              </a>
            </span>
          ))}
        </div>
      </div>
    </div>
  </footer>
);

export default Footer;
