import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import PublicLayout from "@/components/layout/PublicLayout";
import AdminLayout from "@/components/layout/AdminLayout";
import PortalLayout from "@/components/layout/PortalLayout";
import ProtectedRoute from "@/components/auth/ProtectedRoute";

import HomePage from "@/pages/HomePage";
import AboutPage from "@/pages/AboutPage";
import CapabilitiesPage from "@/pages/CapabilitiesPage";
import CatalogPage from "@/pages/CatalogPage";
import ContactPage from "@/pages/ContactPage";
import AuthPage from "@/pages/AuthPage";
import NotFound from "@/pages/NotFound";

import AdminDashboard from "@/pages/admin/AdminDashboard";
import RfqInbox from "@/pages/admin/RfqInbox";
import InventoryPage from "@/pages/admin/InventoryPage";
import OrdersAdminPage from "@/pages/admin/OrdersAdminPage";
import ClientsPage from "@/pages/admin/ClientsPage";

import PortalHome from "@/pages/portal/PortalHome";
import MyOrders from "@/pages/portal/MyOrders";
import OrderDetail from "@/pages/portal/OrderDetail";
import ProfilePage from "@/pages/portal/ProfilePage";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
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

          {/* Admin portal — admin or staff only */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute requireRoles={["admin", "staff"]}>
                <AdminLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<AdminDashboard />} />
            <Route path="rfqs" element={<RfqInbox />} />
            <Route path="inventory" element={<InventoryPage />} />
            <Route path="orders" element={<OrdersAdminPage />} />
            <Route path="clients" element={<ClientsPage />} />
          </Route>

          {/* Client portal — any authenticated user */}
          <Route
            path="/portal"
            element={
              <ProtectedRoute>
                <PortalLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<PortalHome />} />
            <Route path="orders" element={<MyOrders />} />
            <Route path="orders/:id" element={<OrderDetail />} />
            <Route path="profile" element={<ProfilePage />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
