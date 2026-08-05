import { useState, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Menu, X, User, HardHat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/i18n/useTranslation";
import LanguageSwitcher from "@/components/i18n/LanguageSwitcher";

export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, isWorker, isStaff } = useAuth();
  const { t } = useTranslation();
  const portalPath = isWorker ? "/factory" : isStaff ? "/admin" : "/portal";
  const location = useLocation();
  const navigate = useNavigate();
  const logoClicks = useRef(0);
  const logoClickTimer = useRef<ReturnType<typeof setTimeout>>();

  const navLinks = [
    { label: t("nav.home"), path: "/" },
    { label: t("nav.about"), path: "/about" },
    { label: t("nav.capabilities"), path: "/capabilities" },
    { label: t("nav.catalog"), path: "/catalog" },
    { label: t("nav.contact"), path: "/contact" },
  ];

  // Secret entry point: click the logo 4 times within 2 seconds to
  // reach the hidden admin sign-in/signup page. Not linked anywhere else.
  const handleLogoClick = (e: React.MouseEvent) => {
    logoClicks.current += 1;
    clearTimeout(logoClickTimer.current);
    if (logoClicks.current >= 4) {
      e.preventDefault();
      logoClicks.current = 0;
      navigate("/system-access");
      return;
    }
    logoClickTimer.current = setTimeout(() => {
      logoClicks.current = 0;
    }, 2000);
  };

  const isActive = (path: string) => location.pathname === path;

  return (
    <header className="sticky top-0 z-50 bg-[#FAF7EF] border-b border-[#E4DDC9]">
      <div className="max-w-[1360px] mx-auto px-6 lg:px-[24px] py-3.5 flex flex-wrap items-center justify-between gap-y-2 gap-x-4">

        {/* Brand wordmark with logo */}
        <Link to="/" onClick={handleLogoClick} className="flex items-center gap-3 shrink-0">
          <img src="/logo-mark.svg" alt="En En Garments" className="h-8 w-auto shrink-0" />
          <div className="flex flex-col leading-[1.1]">
            <span className="font-heading font-bold text-[19px] text-[#1B2A4A] whitespace-nowrap">
              En En Garments
            </span>
            <span className="text-[10px] tracking-[0.12em] text-[#9A8F72] uppercase font-body">
              Since 1990s
            </span>
          </div>
        </Link>

        {/* Desktop navigation */}
        <nav className="hidden lg:flex flex-wrap items-center gap-5">
          {navLinks.map((link) => {
            const active = isActive(link.path);
            return (
              <Link
                key={link.path}
                to={link.path}
                className={`text-[14.5px] pb-1 border-b-2 transition-all ${
                  active
                    ? "font-bold text-[#1B2A4A] border-[#C69749]"
                    : "font-medium text-[#5B5142] border-transparent hover:text-[#C69749]"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Right side controls */}
        <div className="hidden lg:flex items-center gap-[14px] shrink-0">
          {/* Global Language Switcher */}
          <LanguageSwitcher variant="ghost" />

          <div className="w-[1px] h-[18px] bg-[#E4DDC9]" />

          {/* Quick Worker Access / Sign In / Portal link */}
          {!user && (
            <Link
              to="/auth?role=worker"
              className="text-[13px] text-[#C69749] font-semibold whitespace-nowrap px-3 py-1.5 rounded-[3px] border border-[#C69749]/40 hover:bg-[#C69749] hover:text-[#1B2A4A] hover:border-[#C69749] transition-all duration-300"
            >
              {t("nav.workerPortal")}
            </Link>
          )}

          {user ? (
            <>
              <Link
                to={portalPath}
                className="text-[13px] text-[#5B5142] font-medium whitespace-nowrap hover:text-[#C69749] transition-colors"
              >
                {t("nav.myPortal")}
              </Link>
              <Button asChild variant="outline" size="icon" className="w-8 h-8 rounded-full border-[#E4DDC9]" title={user.email}>
                <Link to={isWorker || isStaff ? portalPath : "/portal/profile"}>
                  <User className="w-4 h-4 text-[#1B2A4A]" />
                </Link>
              </Button>
            </>
          ) : (
            <>
              <Link
                to="/auth"
                className="text-[13px] text-[#5B5142] font-medium whitespace-nowrap hover:text-[#C69749] transition-colors"
              >
                {t("nav.signIn")}
              </Link>
              <Link
                to="/contact?rfq=true"
                className="btn-fill-navy border-none inline-flex items-center justify-center px-[18px] py-[10px] rounded-[3px] text-[13px] font-semibold tracking-[0.01em] whitespace-nowrap"
              >
                {t("nav.requestQuote")}
              </Link>
            </>
          )}
        </div>

        {/* Mobile toggle area */}
        <div className="flex items-center gap-2 lg:hidden">
          <LanguageSwitcher variant="ghost" showLabel={false} />

          <button
            className="p-2 text-[#1B2A4A]"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle navigation menu"
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden border-t border-[#E4DDC9] bg-[#FAF7EF] px-6 pb-6 pt-4 space-y-4">
          <nav className="flex flex-col gap-3">
            {navLinks.map((link) => {
              const active = isActive(link.path);
              return (
                <Link
                  key={link.path}
                  to={link.path}
                  onClick={() => setMobileOpen(false)}
                  className={`text-sm font-medium tracking-wide transition-colors ${
                    active ? "text-[#C69749] font-bold" : "text-[#5B5142]"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          <div className="pt-2 border-t border-[#E4DDC9] flex flex-col gap-2">
            {!user && (
              <Link
                to="/auth?role=worker"
                onClick={() => setMobileOpen(false)}
                className="flex items-center justify-center gap-2 py-2 px-3 text-xs font-semibold text-[#C69749] border border-[#C69749]/40 hover:bg-[#C69749] hover:text-[#1B2A4A] rounded transition-all duration-300"
              >
                <HardHat className="w-4 h-4" />
                {t("nav.workerPortal")}
              </Link>
            )}

            {user ? (
              <>
                <Link
                  to={portalPath}
                  onClick={() => setMobileOpen(false)}
                  className="py-2 text-center text-sm font-semibold text-[#1B2A4A]"
                >
                  {t("nav.myPortal")}
                </Link>
              </>
            ) : (
              <>
                <Link
                  to="/auth"
                  onClick={() => setMobileOpen(false)}
                  className="py-2 text-center text-sm text-[#5B5142]"
                >
                  {t("nav.signIn")}
                </Link>
                <Link
                  to="/contact?rfq=true"
                  onClick={() => setMobileOpen(false)}
                  className="btn-fill-gold py-2.5 text-center text-sm font-bold rounded-[3px]"
                >
                  {t("nav.requestQuote")}
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>

  );
}
