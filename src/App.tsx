import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import PublicLayout from "@/components/layout/PublicLayout";
import AdminLayout from "@/components/layout/AdminLayout";
import PortalLayout from "@/components/layout/PortalLayout";
import FactoryLayout from "@/components/layout/FactoryLayout";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import RequirePermission from "@/components/auth/RequirePermission";
import type { Permission } from "@/lib/permissions";
import { LanguageProvider } from "@/i18n/LanguageContext";

import TitleManager from "@/components/common/TitleManager";

const HomePage = lazy(() => import("@/pages/HomePage"));
const AboutPage = lazy(() => import("@/pages/AboutPage"));
const CapabilitiesPage = lazy(() => import("@/pages/CapabilitiesPage"));
const CatalogPage = lazy(() => import("@/pages/CatalogPage"));
const ContactPage = lazy(() => import("@/pages/ContactPage"));
const AuthPage = lazy(() => import("@/pages/AuthPage"));
const AdminAuthPage = lazy(() => import("@/pages/AdminAuthPage"));
const ActivateAccountPage = lazy(() => import("@/pages/ActivateAccountPage"));
const NotFound = lazy(() => import("@/pages/NotFound"));

const AdminDashboard = lazy(() => import("@/pages/admin/AdminDashboard"));
const RfqInbox = lazy(() => import("@/pages/admin/RfqInbox"));
const InventoryPage = lazy(() => import("@/pages/admin/InventoryPage"));
const OrdersAdminPage = lazy(() => import("@/pages/admin/OrdersAdminPage"));
const BatchManagementPage = lazy(() => import("@/pages/admin/BatchManagementPage"));
const ClientsPage = lazy(() => import("@/pages/admin/ClientsPage"));
const EmployeesPage = lazy(() => import("@/pages/admin/EmployeesPage"));
const WorkerDetailPage = lazy(() => import("@/pages/admin/WorkerDetailPage"));
const AdminInboxPage = lazy(() => import("@/pages/admin/InboxPage"));
const DispatchPage = lazy(() => import("@/pages/admin/DispatchPage"));
const BatchPipelineStatusPage = lazy(() => import("@/pages/admin/BatchPipelineStatusPage"));
const FinanceDashboard = lazy(() => import("@/pages/admin/finance/FinanceDashboard"));
const VendorsPage = lazy(() => import("@/pages/admin/finance/VendorsPage"));
const VendorLedgerPage = lazy(() => import("@/pages/admin/finance/VendorLedgerPage"));
const PurchasesPage = lazy(() => import("@/pages/admin/finance/PurchasesPage"));
const ReceivablesPage = lazy(() => import("@/pages/admin/finance/ReceivablesPage"));
const ExpensesPage = lazy(() => import("@/pages/admin/finance/ExpensesPage"));
const FinanceReportsPage = lazy(() => import("@/pages/admin/finance/ReportsPage"));

const PortalHome = lazy(() => import("@/pages/portal/PortalHome"));
const MyOrders = lazy(() => import("@/pages/portal/MyOrders"));
const OrderDetail = lazy(() => import("@/pages/portal/OrderDetail"));
const ProfilePage = lazy(() => import("@/pages/portal/ProfilePage"));
const ClientInboxPage = lazy(() => import("@/pages/portal/ClientInboxPage"));

const DirectOrderPage = lazy(() => import("@/pages/portal/DirectOrderPage"));

const FactoryDashboard = lazy(() => import("@/pages/factory/FactoryDashboard"));
const MyWorkPage = lazy(() => import("@/pages/factory/MyWorkPage"));
const DepartmentEntryPage = lazy(() => import("@/pages/factory/DepartmentEntryPage"));
const InboxPage = lazy(() => import("@/pages/factory/InboxPage"));
const AccessoryRestockPage = lazy(() => import("@/pages/factory/AccessoryRestockPage"));

const gate = (perm: Permission, el: JSX.Element) => <RequirePermission perm={perm}>{el}</RequirePermission>;

const RouteFallback = () => (
  <div className="min-h-screen flex items-center justify-center">
    <Loader2 className="w-6 h-6 animate-spin text-accent" />
  </div>
);

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <TitleManager />
        <LanguageProvider>
          <Suspense fallback={<RouteFallback />}>
          <Routes>
            {/* Public marketing site */}
            <Route element={<PublicLayout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/about" element={<AboutPage />} />
              <Route path="/capabilities" element={<CapabilitiesPage />} />
              <Route path="/catalog" element={<CatalogPage />} />
              <Route path="/contact" element={<ContactPage />} />
            </Route>

            {/* Auth (no chrome) */}
            <Route path="/auth" element={<AuthPage />} />
            <Route
              path="/activate-account"
              element={
                <ProtectedRoute requireRoles={["client"]}>
                  <ActivateAccountPage />
                </ProtectedRoute>
              }
            />

            {/* Hidden admin sign-in / provisioning — reached via 4x logo click, never linked */}
            <Route path="/system-access" element={<AdminAuthPage />} />

            {/* Admin portal — admin/staff/manager; each section gated by permission */}
            <Route
              path="/admin"
              element={
                <ProtectedRoute requireRoles={["admin", "staff", "manager"]}>
                  <AdminLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<AdminDashboard />} />
              <Route path="rfqs" element={gate("rfqs", <RfqInbox />)} />
              <Route path="inbox" element={gate("inbox", <AdminInboxPage />)} />
              <Route path="inventory" element={gate("inventory", <InventoryPage />)} />
              <Route path="orders" element={gate("orders", <OrdersAdminPage />)} />
              <Route path="batches" element={gate("batches", <BatchManagementPage />)} />
              <Route path="pipeline-status" element={gate("batches", <BatchPipelineStatusPage />)} />
              <Route path="dispatch" element={gate("dispatch", <DispatchPage />)} />
              <Route path="clients" element={gate("clients", <ClientsPage />)} />
              <Route path="employees" element={gate("employees", <EmployeesPage />)} />
              <Route path="employees/:id" element={gate("employees", <WorkerDetailPage />)} />
              <Route path="finance" element={gate("finance.view", <FinanceDashboard />)} />
              <Route path="finance/vendors" element={gate("finance.view", <VendorsPage />)} />
              <Route path="finance/vendors/:id" element={gate("finance.view", <VendorLedgerPage />)} />
              <Route path="finance/purchases" element={gate("finance.view", <PurchasesPage />)} />
              <Route path="finance/receivables" element={gate("finance.view", <ReceivablesPage />)} />
              <Route path="finance/expenses" element={gate("finance.view", <ExpensesPage />)} />
              <Route path="finance/reports" element={gate("finance.view", <FinanceReportsPage />)} />
            </Route>

            {/* Client portal — client role only */}
            <Route
              path="/client-portal"
              element={
                <ProtectedRoute requireRoles={["client"]} requireClientActivated>
                  <PortalLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<PortalHome />} />
              <Route path="direct-order" element={<DirectOrderPage />} />
              <Route path="orders" element={<MyOrders />} />
              <Route path="orders/:id" element={<OrderDetail />} />
              <Route path="inbox" element={<ClientInboxPage />} />
              <Route path="profile" element={<ProfilePage />} />
            </Route>

            {/* Factory worker portal — worker role only */}
            <Route
              path="/factory"
              element={
                <ProtectedRoute requireRoles={["worker"]}>
                  <FactoryLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<FactoryDashboard />} />
              <Route path="log" element={<DepartmentEntryPage />} />
              <Route path="my-work" element={<MyWorkPage />} />
              <Route path="inbox" element={<InboxPage />} />
              <Route path="restock-accessory" element={<AccessoryRestockPage />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
        </LanguageProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
