import { useLanguage, type Language } from "@/i18n/LanguageContext";

const OPTIONS: { code: Language; label: string }[] = [
  { code: "roman-ur", label: "Roman Urdu" },
  { code: "ur", label: "اردو" },
  { code: "en", label: "English" },
];

/**
 * Large touch-target language toggle for the factory floor UI.
 * Replaces the globe-icon dropdown (LanguageSwitcher) with three big chips —
 * consistent with the Worker Accessibility Principle (big touch targets,
 * minimal typing, high contrast) rather than a menu low-literacy workers
 * may not discover.
 */
export default function FactoryLanguageSwitcher({ className = "" }: { className?: string }) {
  const { language, setLanguage } = useLanguage();

  return (
    <div className={`flex items-center gap-1 rounded-lg bg-slate-100 p-1 ${className}`}>
      {OPTIONS.map((opt) => (
        <button
          key={opt.code}
          type="button"
          onClick={() => setLanguage(opt.code)}
          aria-pressed={language === opt.code}
          className={`px-2.5 py-1.5 rounded-md text-xs font-bold transition-colors min-w-[44px] min-h-[36px] ${
            language === opt.code
              ? "bg-blue-600 text-white shadow-sm"
              : "text-slate-600 hover:bg-slate-200"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
