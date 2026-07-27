import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import en from "@/i18n/translations/en.json";
import ur from "@/i18n/translations/ur.json";

// Supported language codes for the application
export type Language = "en" | "ur";

// Translation dictionary type mirrors the JSON structure
type TranslationDict = typeof en;

// Map of language code to its translation dictionary
const dictionaries: Record<Language, TranslationDict> = { en, ur };

interface LanguageContextValue {
  /** Current active language code */
  language: Language;
  /** Toggle between English and Urdu */
  toggleLanguage: () => void;
  /** Set a specific language */
  setLanguage: (lang: Language) => void;
  /** Whether the current language is RTL (Urdu is RTL) */
  isRtl: boolean;
  /** The full translation dictionary for the current language */
  translations: TranslationDict;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

const STORAGE_LANG_KEY = "enen_app_lang";

function getInitialLanguage(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_LANG_KEY);
    if (stored === "en" || stored === "ur") return stored;
  } catch {
    // localStorage unavailable
  }
  return "en";
}

/**
 * Provider component wrapping the application.
 * Supplies global language state and translation dictionary.
 */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(getInitialLanguage);

  // Synchronize HTML document attributes (lang & dir) when language changes
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("lang", language);
    root.setAttribute("dir", language === "ur" ? "rtl" : "ltr");
  }, [language]);

  // Persist language choice
  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    try {
      localStorage.setItem(STORAGE_LANG_KEY, lang);
    } catch {
      // Silent fail if storage is unavailable
    }
  }, []);

  // Quick toggle between English and Urdu
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

