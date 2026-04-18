import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { LayoutDashboard, Inbox, Package, ClipboardList, Users, LogOut, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

// Admin navigation entries — gated by has_role('admin' | 'staff')
const adminNav = [
  { title: "Dashboard", url: "/admin", icon: LayoutDashboard, end: true },
  { title: "RFQ Inbox", url: "/admin/rfqs", icon: Inbox, end: false },
  { title: "Inventory", url: "/admin/inventory", icon: Package, end: false },
  { title: "Orders", url: "/admin/orders", icon: ClipboardList, end: false },
  { title: "Clients", url: "/admin/clients", icon: Users, end: false },
];

export default function AdminLayout() {
  const { user, isStaff, isAdmin, loading, signOut } = useAuth();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-accent" />
      </div>
    );
  }

  // Render a friendly message instead of a hard redirect for unauthorized access
  if (!user || !isStaff) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="font-heading text-2xl">Access Restricted</h1>
        <p className="text-muted-foreground max-w-md">
          The admin portal is reserved for En En Garments staff. If you are an authorized user,
          please sign in with your staff account.
        </p>
        <div className="flex gap-3">
          <Button onClick={() => navigate("/auth")}>Sign In</Button>
          <Button variant="outline" onClick={() => navigate("/")}>Back to Site</Button>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <Sidebar collapsible="icon">
          <SidebarContent>
            <div className="px-4 py-4 border-b border-sidebar-border">
              <p className="font-heading font-bold text-sidebar-foreground">En En Garments</p>
              <p className="text-xs text-sidebar-foreground/60">Admin Portal</p>
            </div>
            <SidebarGroup>
              <SidebarGroupLabel>Manage</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {adminNav.map((item) => (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton asChild>
                        <NavLink
                          to={item.url}
                          end={item.end}
                          className={({ isActive }) =>
                            isActive
                              ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                              : "hover:bg-sidebar-accent/50"
                          }
                        >
                          <item.icon className="w-4 h-4" />
                          <span>{item.title}</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>

        <div className="flex-1 flex flex-col">
          <header className="h-14 border-b border-border bg-card flex items-center justify-between px-4">
            <div className="flex items-center gap-3">
              <SidebarTrigger />
              <span className="text-sm text-muted-foreground">
                {isAdmin ? "Admin" : "Staff"} • {user.email}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await signOut();
                navigate("/");
              }}
            >
              <LogOut className="w-4 h-4 mr-2" /> Sign out
            </Button>
          </header>
          <main className="flex-1 overflow-auto p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
