import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import en from "@/i18n/translations/en.json";
import ur from "@/i18n/translations/ur.json";
import romanUr from "@/i18n/translations/roman-ur.json";

// Supported language codes for the application
export type Language = "en" | "ur" | "roman-ur";

// Translation dictionary type mirrors the JSON structure
type TranslationDict = typeof en;

// Map of language code to its translation dictionary
const dictionaries: Record<Language, TranslationDict> = { en, ur, "roman-ur": romanUr };

interface LanguageContextValue {
  /** Current active language code */
  language: Language;
  /** Toggle between English and Urdu */
  toggleLanguage: () => void;
  /** Set a specific language */
  setLanguage: (lang: Language) => void;
  /** Whether the current language is RTL (Urdu is RTL; Roman Urdu is Latin-script LTR) */
  isRtl: boolean;
  /** The full translation dictionary for the current language */
  translations: TranslationDict;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

const STORAGE_LANG_KEY = "enen_app_lang";

function getStoredLanguage(): Language | null {
  try {
    const stored = localStorage.getItem(STORAGE_LANG_KEY);
    if (stored === "en" || stored === "ur" || stored === "roman-ur") return stored;
  } catch {
    // localStorage unavailable
  }
  return null;
}

/**
 * Provider component wrapping the application.
 * Supplies global language state and translation dictionary.
 *
 * Default language follows the route when the worker hasn't made an explicit
 * choice yet: Roman Urdu on /factory (low-literacy floor UI default),
 * English everywhere else. Once a user picks a language via setLanguage(),
 * that choice is persisted and wins regardless of route.
 */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [explicitLanguage, setExplicitLanguage] = useState<Language | null>(getStoredLanguage);

  const isFactoryRoute = location.pathname.startsWith("/factory");
  const language: Language = explicitLanguage ?? (isFactoryRoute ? "roman-ur" : "en");

  // Synchronize HTML document attributes (lang & dir) when language changes
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("lang", language);
    root.setAttribute("dir", language === "ur" ? "rtl" : "ltr");
  }, [language]);

  // Persist an explicit language choice
  const setLanguage = useCallback((lang: Language) => {
    setExplicitLanguage(lang);
    try {
      localStorage.setItem(STORAGE_LANG_KEY, lang);
    } catch {
      // Silent fail if storage is unavailable
    }
  }, []);

  // Quick toggle between English and Urdu (public/admin site usage)
  const toggleLanguage = useCallback(() => {
    setLanguage(language === "en" ? "ur" : "en");
  }, [language, setLanguage]);

  const value: LanguageContextValue = {
    language,
    toggleLanguage,
    setLanguage,
    isRtl: language === "ur",
    translations: dictionaries[language],
  };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

/**
 * Hook to access language context from any component.
 * Throws if used outside of LanguageProvider.
 */
export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return ctx;
}
