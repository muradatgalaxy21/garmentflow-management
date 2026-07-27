import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { QrCode, ClipboardList, Home, LogOut, Loader2, WifiOff } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/i18n/LanguageContext";
import { useTranslation } from "@/i18n/useTranslation";
import { getPendingCount, registerSyncListeners } from "@/lib/offlineSync";
import LanguageSwitcher from "@/components/i18n/LanguageSwitcher";

export default function FactoryLayout() {
  const { user, loading, signOut } = useAuth();
  const { isRtl } = useLanguage();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);

  // 1. Register offline sync listeners on mount
  useEffect(() => {
    const cleanup = registerSyncListeners();
    return cleanup;
  }, []);

  // 2. Track online/offline state for the UI indicator
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

  // 3. Poll pending sync count every 5 seconds
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
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center bg-slate-900 text-white">
        <h1 className="font-heading text-2xl">{t("factory.common.error")}</h1>
        <Button onClick={() => navigate("/auth")}>Sign In</Button>
      </div>
    );
  }

  // Bottom navigation items for the mobile tab bar
  const navItems = [
    { to: "/factory", icon: Home, label: t("factory.nav.home"), end: true },
    { to: "/factory/scan", icon: QrCode, label: t("factory.nav.scan"), end: false },
    { to: "/factory/my-work", icon: ClipboardList, label: t("factory.nav.myWork"), end: false },
  ];

  return (
    <div
      className="min-h-screen flex flex-col bg-slate-900 text-slate-100"
      dir={isRtl ? "rtl" : "ltr"}
    >
      {/* ---- TOP BAR ---- */}
      <header className="sticky top-0 z-50 bg-slate-800/95 backdrop-blur border-b border-slate-700 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div>
              <h1 className="text-sm font-bold text-emerald-400 leading-tight">
                {t("factory.title")}
              </h1>
              <p className="text-[10px] text-slate-400">{t("factory.subtitle")}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Offline indicator */}
            {!isOnline && (
              <Badge variant="outline" className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-[10px]">
                <WifiOff className="w-3 h-3 mr-1" />
                {t("factory.common.offline")}
              </Badge>
            )}

            {/* Pending sync indicator */}
            {pendingCount > 0 && (
              <Badge variant="outline" className="bg-blue-500/15 text-blue-400 border-blue-500/30 text-[10px]">
                {pendingCount} {t("factory.common.pendingSync")}
              </Badge>
            )}

            {/* Language & Urdu Font Switcher */}
            <LanguageSwitcher
              variant="ghost"
              size="sm"
              className="text-slate-300 hover:text-white hover:bg-slate-700 text-xs px-2"
            />

            {/* Sign out */}
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await signOut();
                navigate("/auth");
              }}
              className="text-slate-400 hover:text-red-400 hover:bg-slate-700 px-2"
            >
              <LogOut className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </header>

      {/* ---- MAIN CONTENT ---- */}
      <main className="flex-1 overflow-auto pb-20 px-4 py-4">
        <Outlet />
      </main>

      {/* ---- BOTTOM TAB BAR ---- */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-slate-800/95 backdrop-blur border-t border-slate-700">
        <div className="flex items-center justify-around py-2 px-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-lg transition-colors ${
                  isActive
                    ? "text-emerald-400 bg-emerald-400/10"
                    : "text-slate-400 hover:text-slate-200"
                }`
              }
            >
              <item.icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
