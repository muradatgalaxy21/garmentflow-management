import { NavLink, Outlet, matchPath, useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, Inbox, MessagesSquare, Package, ClipboardList, Users, HardHat, Factory, Truck, LogOut, Loader2, GitBranch, Wallet, Store, Receipt, HandCoins, BadgeDollarSign, FileBarChart } from "lucide-react";
import type { Permission } from "@/lib/permissions";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import NotificationBell from "@/components/NotificationBell";
import RecentChanges from "@/components/RecentChanges";
import StaffAssistant from "@/components/StaffAssistant";
import RequestAlertBanner from "@/components/RequestAlertBanner";
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

interface NavItem {
  title: string;
  url: string;
  icon: typeof LayoutDashboard;
  end: boolean;
  perm?: Permission; // undefined = everyone in the admin portal
}

// Each entry is shown only if the user holds its permission (admin holds all).
const adminNav: NavItem[] = [
  { title: "Dashboard", url: "/admin", icon: LayoutDashboard, end: true },
  { title: "RFQ Inbox", url: "/admin/rfqs", icon: Inbox, end: false, perm: "rfqs.view" },
  { title: "Inbox", url: "/admin/inbox", icon: MessagesSquare, end: false, perm: "inbox.view" },
  { title: "Inventory", url: "/admin/inventory", icon: Package, end: false, perm: "inventory.view" },
  { title: "Orders", url: "/admin/orders", icon: ClipboardList, end: false, perm: "orders.view" },
  { title: "Batches", url: "/admin/batches", icon: Factory, end: false, perm: "batches.view" },
  { title: "Pipeline Status", url: "/admin/pipeline-status", icon: GitBranch, end: false, perm: "pipeline.view" },
  { title: "Dispatch", url: "/admin/dispatch", icon: Truck, end: false, perm: "dispatch.view" },
  { title: "Employees", url: "/admin/employees", icon: HardHat, end: false, perm: "employees.view" },
  { title: "Clients", url: "/admin/clients", icon: Users, end: false, perm: "clients.view" },
];

const financeNav: NavItem[] = [
  { title: "Overview", url: "/admin/finance", icon: Wallet, end: true, perm: "finance.view" },
  { title: "Vendors", url: "/admin/finance/vendors", icon: Store, end: false, perm: "finance_vendors.view" },
  { title: "Purchases", url: "/admin/finance/purchases", icon: Receipt, end: false, perm: "finance_purchases.view" },
  { title: "Receivables", url: "/admin/finance/receivables", icon: HandCoins, end: false, perm: "finance_receivables.view" },
  { title: "Expenses", url: "/admin/finance/expenses", icon: BadgeDollarSign, end: false, perm: "finance_expenses.view" },
  { title: "Reports", url: "/admin/finance/reports", icon: FileBarChart, end: false, perm: "finance_reports.view" },
];

export default function AdminLayout() {
  const { user, isStaff, isAdmin, isManager, loading, signOut, can } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-accent" />
      </div>
    );
  }

  // Render a friendly message instead of a hard redirect for unauthorized access
  if (!user || !(isStaff || isManager)) {
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
            {([["Manage", adminNav], ["Finance", financeNav]] as const).map(([label, items]) => {
              const visible = items.filter((i) => !i.perm || can(i.perm));
              if (visible.length === 0) return null;
              return (
                <SidebarGroup key={label}>
                  <SidebarGroupLabel>{label}</SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {visible.map((item) => (
                        <SidebarMenuItem key={item.url}>
                          {/* Slot (asChild) can't merge NavLink's className function, so the
                              active state goes through SidebarMenuButton's isActive instead. */}
                          <SidebarMenuButton
                            asChild
                            isActive={!!matchPath({ path: item.url, end: item.end }, pathname)}
                            className="data-[active=true]:bg-sidebar-primary data-[active=true]:text-sidebar-primary-foreground data-[active=true]:font-semibold"
                          >
                            <NavLink to={item.url} end={item.end}>
                              <item.icon className="w-4 h-4" />
                              <span>{item.title}</span>
                            </NavLink>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      ))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              );
            })}
          </SidebarContent>
        </Sidebar>

        <div className="flex-1 flex flex-col">
          <header className="h-14 border-b border-border bg-card flex items-center justify-between px-4">
            <div className="flex items-center gap-3">
              <SidebarTrigger />
              <span className="text-sm text-muted-foreground">
                {isAdmin ? "Admin" : isManager ? "Manager" : "Staff"} • {user.email ?? user.phone}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <RecentChanges />
              <NotificationBell />
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
            </div>
          </header>
          <RequestAlertBanner />
          <main className="flex-1 overflow-auto p-6">
            <Outlet />
          </main>
          <StaffAssistant />
        </div>
      </div>
    </SidebarProvider>
  );
}
