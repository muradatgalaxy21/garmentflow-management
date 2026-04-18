import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Home, Package, User, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

// Lightweight client-portal layout — top tabs instead of a sidebar to keep
// the experience simple for B2B clients.
const portalNav = [
  { to: "/portal", label: "Overview", icon: Home, end: true },
  { to: "/portal/orders", label: "My Orders", icon: Package, end: false },
  { to: "/portal/profile", label: "Profile", icon: User, end: false },
];

export default function PortalLayout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col bg-secondary/30">
      <header className="bg-primary text-primary-foreground">
        <div className="container-wide flex items-center justify-between h-16 px-6">
          <div>
            <p className="font-heading font-bold">En En Garments</p>
            <p className="text-xs opacity-70">Client Portal</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs opacity-70 hidden sm:inline">{user?.email}</span>
            <Button
              variant="ghost"
              size="sm"
              className="text-primary-foreground hover:bg-primary-foreground/10"
              onClick={async () => {
                await signOut();
                navigate("/");
              }}
            >
              <LogOut className="w-4 h-4 mr-2" /> Sign out
            </Button>
          </div>
        </div>
        <nav className="container-wide px-6 flex gap-1 overflow-x-auto">
          {portalNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-2 px-4 py-3 text-sm border-b-2 transition-colors ${
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
      <main className="flex-1 container-wide px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
