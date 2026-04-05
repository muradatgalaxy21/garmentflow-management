import { Outlet } from "react-router-dom";
import Header from "./Header";
import Footer from "./Footer";
import WhatsAppWidget from "@/components/WhatsAppWidget";

// Wraps all public-facing pages with consistent header, footer, and floating widgets
export default function PublicLayout() {
  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      {/* pt-16 offsets the fixed header height */}
      <main className="flex-1 pt-16">
        <Outlet />
      </main>
      <Footer />
      <WhatsAppWidget />
    </div>
  );
}
