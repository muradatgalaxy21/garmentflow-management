import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import en from "@/i18n/translations/en.json";
import ur from "@/i18n/translations/ur.json";

// Supported language codes for the factory module
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

// Persist language preference in localStorage for returning users
const STORAGE_KEY = "enen_factory_lang";

function getInitialLanguage(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "ur") return stored;
  } catch {
    // localStorage unavailable (e.g. private browsing)
  }
  return "en";
}

/**
 * Provider component wrapping the /factory route tree.
 * Supplies language state and translation dictionary to all
 * factory components via React Context.
 */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(getInitialLanguage);

  // 1. Persist language choice and update state
  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // Silent fail if storage is unavailable
    }
  }, []);

  // 2. Quick toggle between English and Urdu
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
 * Hook to access language context from any factory component.
 * Throws if used outside of LanguageProvider.
 */
export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return ctx;
}
