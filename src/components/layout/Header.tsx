import { useState, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Menu, X, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

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
  const { user, isWorker, isStaff } = useAuth();
  const portalPath = isWorker ? "/factory" : isStaff ? "/admin" : "/portal";
  const location = useLocation();
  const navigate = useNavigate();
  const logoClicks = useRef(0);
  const logoClickTimer = useRef<ReturnType<typeof setTimeout>>();

  // Secret entry point: click the logo 4 times within 2 seconds to
  // reach the hidden admin sign-in/signup page. Not linked anywhere else.
  const handleLogoClick = (e: React.MouseEvent) => {
    logoClicks.current += 1;
    clearTimeout(logoClickTimer.current);
    if (logoClicks.current >= 4) {
      e.preventDefault();
      logoClicks.current = 0;
      navigate("/system-access");
      return;
    }
    logoClickTimer.current = setTimeout(() => {
      logoClicks.current = 0;
    }, 2000);
  };

  const isActive = (path: string) => location.pathname === path;

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-md border-b border-border">
      <div className="container-wide flex items-center justify-between h-16 px-6 lg:px-12">

        {/* Brand wordmark with logo placeholder */}
        <Link to="/" onClick={handleLogoClick} className="flex items-center gap-3">
          <img src="/logo-mark.svg" alt="En En Garments" className="h-12 w-auto shrink-0" />
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
                <Link to={portalPath}>My Portal</Link>
              </Button>
              <Button asChild variant="outline" size="icon" className="w-8 h-8 rounded-full" title={user.email}>
                <Link to={isWorker || isStaff ? portalPath : "/portal/profile"}>
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
                  <Link to={portalPath} onClick={() => setMobileOpen(false)}>My Portal</Link>
                </Button>
                <Button asChild size="sm" className="w-full">
                  <Link
                    to={isWorker || isStaff ? portalPath : "/portal/profile"}
                    onClick={() => setMobileOpen(false)}
                  >
                    My Profile
                  </Link>
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
