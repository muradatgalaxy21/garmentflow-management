import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import type { User as SupabaseUser } from "@supabase/supabase-js";

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
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const location = useLocation();

  // Listen for auth state changes so the header reflects login/logout immediately
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const isActive = (path: string) => location.pathname === path;

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-md border-b border-border">
      <div className="container-wide flex items-center justify-between h-16 px-6 lg:px-12">

        {/* Brand wordmark with logo placeholder */}
        <Link to="/" className="flex items-center gap-3">
          {/* Logo: drop your file at public/logo.png and this will render automatically */}
          <div
            className="w-8 h-8 rounded-md border border-border bg-secondary/80 flex items-center justify-center text-muted-foreground text-[9px] font-bold shrink-0"
            title="Add public/logo.png to replace this placeholder"
          >
            EEG
          </div>
          <span className="font-heading text-xl font-bold tracking-tight text-foreground">
            En En Garments
          </span>
          <span className="hidden sm:inline-block text-xs font-body text-muted-foreground tracking-widest">
            SINCE 1990s
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

        {/* Right side: show profile/portal link if logged in, sign-in otherwise */}
        <div className="hidden lg:flex items-center gap-3">
          {user ? (
            // Logged-in state: show portal access and a profile avatar icon
            <>
              <Button asChild variant="ghost" size="sm">
                <Link to="/portal">My Portal</Link>
              </Button>
              <Button asChild variant="outline" size="icon" className="w-8 h-8 rounded-full" title={user.email}>
                <Link to="/portal/profile">
                  <User className="w-4 h-4" />
                </Link>
              </Button>
            </>
          ) : (
            // Logged-out state: standard sign-in and RFQ buttons
            <>
              <Button asChild variant="ghost" size="sm">
                <Link to="/auth">Sign In</Link>
              </Button>
              <Button asChild size="sm">
                <Link to="/contact?rfq=true">Request Quote</Link>
              </Button>
            </>
          )}
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
          <div className="mt-4 flex flex-col gap-2">
            {user ? (
              <>
                <Button asChild variant="outline" size="sm" className="w-full">
                  <Link to="/portal" onClick={() => setMobileOpen(false)}>My Portal</Link>
                </Button>
                <Button asChild size="sm" className="w-full">
                  <Link to="/portal/profile" onClick={() => setMobileOpen(false)}>My Profile</Link>
                </Button>
              </>
            ) : (
              <>
                <Button asChild variant="outline" size="sm" className="w-full">
                  <Link to="/auth" onClick={() => setMobileOpen(false)}>Sign In</Link>
                </Button>
                <Button asChild size="sm" className="w-full">
                  <Link to="/contact?rfq=true" onClick={() => setMobileOpen(false)}>Request Quote</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
