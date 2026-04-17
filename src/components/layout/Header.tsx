import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";

// Main navigation links for the public site
const navLinks = [
  { label: "Home", path: "/" },
  { label: "About Us", path: "/about" },
  { label: "Capabilities", path: "/capabilities" },
  { label: "Catalog", path: "/catalog" },
  { label: "Contact", path: "/contact" },
];

export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-md border-b border-border">
      <div className="container-wide flex items-center justify-between h-16 px-6 lg:px-12">
        {/* Brand wordmark */}
        <Link to="/" className="flex items-center gap-2">
          <span className="font-heading text-xl font-bold tracking-tight text-foreground">
            En En Garments
          </span>
          <span className="hidden sm:inline-block text-xs font-body text-muted-foreground tracking-widest uppercase">
            Since 1990s
          </span>
        </Link>

        {/* Desktop navigation */}
        <nav className="hidden lg:flex items-center gap-8">
          {navLinks.map((link) => (
            <Link
              key={link.path}
              to={link.path}
              className={`text-sm font-medium tracking-wide transition-colors hover:text-accent ${
                isActive(link.path) ? "text-accent" : "text-muted-foreground"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* RFQ CTA on the right */}
        <div className="hidden lg:flex items-center gap-4">
          <Button asChild size="sm">
            <Link to="/contact?rfq=true">Request Quote</Link>
          </Button>
        </div>

        {/* Mobile toggle */}
        <button
          className="lg:hidden p-2 text-foreground"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle navigation menu"
        >
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden border-t border-border bg-background px-6 pb-6 pt-4">
          <nav className="flex flex-col gap-4">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                onClick={() => setMobileOpen(false)}
                className={`text-sm font-medium tracking-wide transition-colors ${
                  isActive(link.path) ? "text-accent" : "text-muted-foreground"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="mt-4">
            <Button asChild size="sm" className="w-full">
              <Link to="/contact?rfq=true" onClick={() => setMobileOpen(false)}>
                Request Quote
              </Link>
            </Button>
          </div>
        </div>
      )}
    </header>
  );
}
