import { Outlet } from "react-router-dom";
import Header from "./Header";
import Footer from "./Footer";
import WhatsAppWidget from "@/components/WhatsAppWidget";
import ChatBot from "@/components/ChatBot";

// Wraps all public-facing pages with shared header, footer, and floating widgets
export default function PublicLayout() {
  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
      <WhatsAppWidget />
      <ChatBot />
    </div>
  );
}
