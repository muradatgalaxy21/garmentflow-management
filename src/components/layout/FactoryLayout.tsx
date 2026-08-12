import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { ClipboardList, ClipboardCheck, Home, LogOut, Loader2, WifiOff, User, Inbox, PackagePlus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/i18n/LanguageContext";
import { useTranslation } from "@/i18n/useTranslation";
import { getPendingCount, registerSyncListeners } from "@/lib/offlineSync";
import FactoryLanguageSwitcher from "@/components/i18n/FactoryLanguageSwitcher";
import { GarmentLogo } from "@/components/ui/GarmentLogo";
import { supabase } from "@/integrations/supabase/client";

export default function FactoryLayout() {
  const { user, loading, signOut } = useAuth();
  const { isRtl } = useLanguage();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [userName, setUserName] = useState<string>("");
  const [department, setDepartment] = useState<string | null>(null);

  // 1. Load user profile name
  useEffect(() => {
    if (!user) return;
    const fetchProfile = async () => {
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name, department")
          .eq("id", user.id)
          .maybeSingle();
        setUserName(profile?.full_name || user.email?.split("@")[0] || t("factory.dashboard.workerFallback"));
        setDepartment(profile?.department ?? null);
      } catch {
        setUserName(user.email?.split("@")[0] || t("factory.dashboard.workerFallback"));
      }
    };
    fetchProfile();
  }, [user]);

  // 2. Register offline sync listeners on mount
  useEffect(() => {
    const cleanup = registerSyncListeners();
    return cleanup;
  }, []);

  // 3. Track online/offline state for the UI indicator
  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  // 4. Poll pending sync count every 5 seconds
  useEffect(() => {
    const check = async () => {
      const count = await getPendingCount();
      setPendingCount(count);
    };
    check();
    const interval = setInterval(check, 5000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f3f4f6]">
        <Loader2 className="w-8 h-8 animate-spin text-slate-600" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center bg-[#f3f4f6] text-slate-800">
        <h1 className="font-heading text-2xl">{t("factory.common.error")}</h1>
        <Button onClick={() => navigate("/auth")} className="bg-slate-800 text-white">{t("factory.common.signIn")}</Button>
      </div>
    );
  }

  // Bottom navigation items for the mobile tab bar
  const navItems = [
    { to: "/factory", icon: Home, label: t("factory.nav.home"), end: true },
    { to: "/factory/log", icon: ClipboardCheck, label: t("factory.nav.logEntry"), end: false },
    { to: "/factory/my-work", icon: ClipboardList, label: t("factory.nav.myWork"), end: false },
    { to: "/factory/inbox", icon: Inbox, label: t("factory.nav.inbox"), end: false },
    ...(department === "accessories"
      ? [{ to: "/factory/restock-accessory", icon: PackagePlus, label: t("factory.nav.restock"), end: false }]
      : []),
  ];

  return (
    <div
      className="min-h-screen flex flex-col bg-[#f3f4f6] text-slate-900 font-sans"
      dir={isRtl ? "rtl" : "ltr"}
    >
      {/* ---- TOP BAR ---- */}
      <header className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm px-4 py-2.5">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          {/* Logo & Brand title */}
          <div className="flex items-center gap-2.5">
            <img src="/logo-mark.svg" alt="En En Garments Logo" className="h-8 w-auto shrink-0" />
            <div>
              <h1 className="text-sm font-bold text-slate-900 leading-tight">
                En En Garments
              </h1>
              <p className="text-[11px] font-medium text-slate-500">{t("factory.subtitle")}</p>
            </div>
          </div>

          {/* Right Controls: User Name, Indicators, Language & Logout */}
          <div className="flex items-center gap-2.5">
            {/* User Name Pill at Top Right Corner */}
            {userName && (
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold">
                <User className="w-3.5 h-3.5 text-slate-500" />
                <span className="truncate max-w-[120px]">{userName}</span>
              </div>
            )}

            {/* Offline indicator */}
            {!isOnline && (
              <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 text-[10px]">
                <WifiOff className="w-3 h-3 mr-1" />
                {t("factory.common.offline")}
              </Badge>
            )}

            {/* Pending sync indicator */}
            {pendingCount > 0 && (
              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300 text-[10px]">
                {pendingCount} {t("factory.common.pendingSync")}
              </Badge>
            )}

            {/* Sign out button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await signOut();
                navigate("/auth");
              }}
              className="text-slate-500 hover:text-red-600 hover:bg-slate-100 px-2 h-8"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Language chips — prominent, large touch targets (Worker Accessibility Principle) */}
        <div className="max-w-4xl mx-auto flex justify-center mt-2">
          <FactoryLanguageSwitcher />
        </div>
      </header>

      {/* ---- MAIN CONTENT AREA ---- */}
      <main className="flex-1 overflow-auto pb-24 px-4 py-6">
        <Outlet />
      </main>

      {/* ---- BOTTOM TAB NAVIGATION BAR ---- */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur border-t border-slate-200/80 shadow-md">
        <div className="max-w-md mx-auto flex items-center justify-around py-1.5 px-4">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center w-full py-1.5 rounded-lg transition-all ${
                  isActive
                    ? "text-blue-600 bg-blue-50/90 font-semibold"
                    : "text-slate-500 hover:text-slate-800"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon className={`w-5 h-5 ${isActive ? "text-blue-600" : "text-slate-500"}`} />
                  <span className={`text-[11px] mt-0.5 ${isActive ? "font-bold text-blue-600" : "font-medium"}`}>
                    {item.label}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}

