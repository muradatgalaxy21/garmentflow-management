import { NavLink, Outlet, useNavigate, Link } from "react-router-dom";
import { Home, Package, User, LogOut, ArrowLeft, MessageSquare } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import LanguageSwitcher from "@/components/i18n/LanguageSwitcher";

// Portal navigation tabs
const portalNav = [
  { to: "/client-portal", label: "Overview", icon: Home, end: true },
  { to: "/client-portal/orders", label: "My Orders", icon: Package, end: false },
  { to: "/client-portal/inbox", label: "Inbox", icon: MessageSquare, end: false },
  { to: "/client-portal/profile", label: "Profile", icon: User, end: false },
];

// Lightweight client-portal layout with full-width layout and navigation improvements
export default function PortalLayout() {
  const { user, signOut, isAdmin, isStaff } = useAuth();
  const navigate = useNavigate();

  // Extract initials from email for the avatar placeholder
  const initials = user?.email ? user.email.slice(0, 2).toUpperCase() : "?";

  return (
    <div className="min-h-screen flex flex-col bg-secondary/30">
      <header className="bg-primary text-primary-foreground shadow-md">
        <div className="w-full max-w-screen-2xl mx-auto flex items-center justify-between h-16 px-6 lg:px-10">

          {/* Left: Back to website + brand */}
          <div className="flex items-center gap-4">
            {/* Back to main website — visible while staying logged in */}
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10 gap-1.5"
            >
              <Link to="/">
                <ArrowLeft className="w-3.5 h-3.5" />
                <span className="hidden sm:inline text-xs">Website</span>
              </Link>
            </Button>

            {/* Brand logo + name */}
            <div className="flex items-center gap-2.5">
              <img src="/logo-mark.svg" alt="En En Garments" className="w-7 h-7 shrink-0" />
              <div>
                <p className="font-heading font-bold leading-tight text-base">En En Garments</p>
                <p className="text-[10px] opacity-60 leading-none">Client Portal</p>
              </div>
            </div>
          </div>

          {/* Right: language switcher, email, profile avatar, sign out */}
          <div className="flex items-center gap-2">
            <LanguageSwitcher
              variant="ghost"
              size="sm"
              className="text-primary-foreground/90 hover:text-primary-foreground hover:bg-primary-foreground/10"
            />
            {(isAdmin || isStaff) && (
              <Button
                asChild
                variant="default"
                size="sm"
                className="hidden sm:flex bg-gold hover:bg-gold/90 text-primary-foreground mr-2 font-semibold"
              >
                <Link to="/admin">Admin Dashboard</Link>
              </Button>
            )}
            <span className="text-xs opacity-60 hidden md:inline truncate max-w-[200px]">{user?.email}</span>

            {/* Profile avatar — click to go to profile page */}
            <Button
              asChild
              variant="ghost"
              size="icon"
              className="w-8 h-8 rounded-full bg-primary-foreground/15 hover:bg-primary-foreground/25 text-primary-foreground font-semibold text-xs"
              title="My Profile"
            >
              <Link to="/client-portal/profile">{initials}</Link>
            </Button>

            {/* Sign out */}
            <Button
              variant="ghost"
              size="sm"
              className="text-primary-foreground hover:bg-primary-foreground/10 gap-1.5"
              onClick={async () => {
                await signOut();
                navigate("/");
              }}
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>

        {/* Portal tab navigation */}
        <nav className="w-full max-w-screen-2xl mx-auto px-6 lg:px-10 flex gap-1 overflow-x-auto">
          {portalNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  isActive
                    ? "border-gold text-gold"
                    : "border-transparent text-primary-foreground/70 hover:text-primary-foreground"
                }`
              }
            >
              <item.icon className="w-4 h-4" /> {item.label}
            </NavLink>
          ))}
        </nav>
      </header>

      {/* Main content: full width with generous padding */}
      <main className="flex-1 w-full max-w-screen-2xl mx-auto px-6 lg:px-10 py-10">
        <Outlet />
      </main>
    </div>
  );
}
