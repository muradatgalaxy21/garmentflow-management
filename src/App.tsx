import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import PublicLayout from "@/components/layout/PublicLayout";
import AdminLayout from "@/components/layout/AdminLayout";
import PortalLayout from "@/components/layout/PortalLayout";
import FactoryLayout from "@/components/layout/FactoryLayout";
import ProtectedRoute from "@/components/auth/ProtectedRoute";

import HomePage from "@/pages/HomePage";
import AboutPage from "@/pages/AboutPage";
import CapabilitiesPage from "@/pages/CapabilitiesPage";
import CatalogPage from "@/pages/CatalogPage";
import ContactPage from "@/pages/ContactPage";
import AuthPage from "@/pages/AuthPage";
import AdminAuthPage from "@/pages/AdminAuthPage";
import NotFound from "@/pages/NotFound";

import AdminDashboard from "@/pages/admin/AdminDashboard";
import RfqInbox from "@/pages/admin/RfqInbox";
import InventoryPage from "@/pages/admin/InventoryPage";
import OrdersAdminPage from "@/pages/admin/OrdersAdminPage";
import BatchManagementPage from "@/pages/admin/BatchManagementPage";
import ClientsPage from "@/pages/admin/ClientsPage";
import EmployeesPage from "@/pages/admin/EmployeesPage";
import WorkerDetailPage from "@/pages/admin/WorkerDetailPage";
import WorkerInboxPage from "@/pages/admin/WorkerInboxPage";

import PortalHome from "@/pages/portal/PortalHome";
import MyOrders from "@/pages/portal/MyOrders";
import OrderDetail from "@/pages/portal/OrderDetail";
import ProfilePage from "@/pages/portal/ProfilePage";

import DirectOrderPage from "@/pages/portal/DirectOrderPage";

import FactoryDashboard from "@/pages/factory/FactoryDashboard";
import MyWorkPage from "@/pages/factory/MyWorkPage";
import DepartmentEntryPage from "@/pages/factory/DepartmentEntryPage";
import InboxPage from "@/pages/factory/InboxPage";
import AccessoryRestockPage from "@/pages/factory/AccessoryRestockPage";

import { LanguageProvider } from "@/i18n/LanguageContext";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <LanguageProvider>
        <BrowserRouter>
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

            {/* Hidden admin sign-in / provisioning — reached via 4x logo click, never linked */}
            <Route path="/system-access" element={<AdminAuthPage />} />

            {/* Admin portal — admin or staff only */}
            <Route
              path="/admin"
              element={
                <ProtectedRoute requireRoles={["admin", "staff", "manager"]}>
                  <AdminLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<AdminDashboard />} />
              <Route path="rfqs" element={<RfqInbox />} />
              <Route path="worker-inbox" element={<WorkerInboxPage />} />
              <Route path="inventory" element={<InventoryPage />} />
              <Route path="orders" element={<OrdersAdminPage />} />
              <Route path="batches" element={<BatchManagementPage />} />
              <Route path="clients" element={<ClientsPage />} />
              <Route path="employees" element={<EmployeesPage />} />
              <Route path="employees/:id" element={<WorkerDetailPage />} />
            </Route>

            {/* Client portal — client role only */}
            <Route
              path="/client-portal"
              element={
                <ProtectedRoute requireRoles={["client"]}>
                  <PortalLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<PortalHome />} />
              <Route path="direct-order" element={<DirectOrderPage />} />
              <Route path="orders" element={<MyOrders />} />
              <Route path="orders/:id" element={<OrderDetail />} />
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
        </BrowserRouter>
      </LanguageProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
