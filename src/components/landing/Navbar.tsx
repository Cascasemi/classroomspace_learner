import { useState } from "react";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { LampToggle } from "@/components/ui/lamp-toggle";

const navLinks = [
  { label: "Home", href: "/" },
  { label: "Features", href: "/features" },
  { label: "How It Works", href: "#how-it-works" },
  { label: "Pricing", href: "/pricing" },
  { label: "For Schools", href: "/schools" },
];

const Navbar = () => {
  const [open, setOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass-nav">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-1.5 text-foreground font-semibold text-lg tracking-tight">
          <span className="inline-block w-2 h-2 rounded-full bg-primary" />
          OpenClass Learner
        </Link>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            link.href.startsWith("/") ? (
              <Link
                key={link.label}
                to={link.href}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {link.label}
              </Link>
            ) : (
              <a
                key={link.label}
                href={link.href}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {link.label}
              </a>
            )
          ))}
        </div>

        {/* Desktop CTAs */}
        <div className="hidden md:flex items-center gap-3">
          <LampToggle />
          <div className="w-px h-4 bg-border" />
          <Link
            to="/login"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors px-4 py-2 rounded-full border border-muted"
          >
            Sign In
          </Link>
          <Link
            to="/register"
            className="text-sm bg-primary text-primary-foreground px-5 py-2 rounded-full font-medium hover:opacity-90 transition-opacity"
          >
            Get Early Access
          </Link>
        </div>

        {/* Mobile toggle */}
        <button className="md:hidden text-foreground" onClick={() => setOpen(!open)}>
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden glass-nav border-t border-muted px-6 py-6 flex flex-col gap-4">
          {navLinks.map((link) => (
            link.href.startsWith("/") ? (
              <Link
                key={link.label}
                to={link.href}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setOpen(false)}
              >
                {link.label}
              </Link>
            ) : (
              <a
                key={link.label}
                href={link.href}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setOpen(false)}
              >
                {link.label}
              </a>
            )
          ))}
          <div className="flex flex-col gap-3 pt-4 border-t border-muted">
            <div className="flex justify-center pb-1">
              <LampToggle />
            </div>
            <Link
              to="/login"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors px-4 py-2 rounded-full border border-muted text-center"
              onClick={() => setOpen(false)}
            >
              Sign In
            </Link>
            <Link
              to="/register"
              className="text-sm bg-primary text-primary-foreground px-5 py-2 rounded-full font-medium text-center"
              onClick={() => setOpen(false)}
            >
              Get Early Access
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
