import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import es from './locales/es.json';

export type Language = 'en' | 'es';
export const LANGUAGES: ReadonlyArray<Language> = ['en', 'es'];

const STORAGE_KEY = 'finance-manager.language';

/** Number/date locale per UI language. Money is always COP; only the formatting changes. */
export const LOCALES: Record<Language, string> = { en: 'en-US', es: 'es-CO' };

function initialLanguage(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'es') return stored;
  } catch {
    // storage can be blocked; fall through to the browser language
  }
  return navigator.language.toLowerCase().startsWith('en') ? 'en' : 'es';
}

export function saveLanguage(language: Language): void {
  try {
    localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // the choice still applies for this session
  }
}

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, es: { translation: es } },
  lng: initialLanguage(),
  fallbackLng: 'es',
  interpolation: { escapeValue: false }
});

export const currentLocale = (): string => LOCALES[i18n.language === 'en' ? 'en' : 'es'];

export default i18n;
