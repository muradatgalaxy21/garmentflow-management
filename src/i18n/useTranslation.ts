import { useLanguage } from "@/i18n/LanguageContext";

/**
 * Retrieves a nested translation value from the dictionary
 * using a dot-separated key path (e.g. "factory.dashboard.welcome").
 *
 * Returns the key itself as a fallback if the path is not found,
 * making missing translations visible during development.
 */
function getNestedValue(obj: Record<string, unknown>, path: string): string {
  const keys = path.split(".");
  let current: unknown = obj;

  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== "object") {
      return path; // Fallback: return the key path as-is
    }
    current = (current as Record<string, unknown>)[key];
  }

  return typeof current === "string" ? current : path;
}

/**
 * Hook that provides a translation function `t()` for
 * the factory module. Usage:
 *
 *   const { t } = useTranslation();
 *   <h1>{t("factory.dashboard.welcome")}</h1>
 */
export function useTranslation() {
  const { translations, language, isRtl } = useLanguage();

  // 1. The t() function resolves a dot-path key to the
  //    current language string value
  const t = (key: string): string => {
    return getNestedValue(
      translations as unknown as Record<string, unknown>,
      key
    );
  };

  return { t, language, isRtl };
}
