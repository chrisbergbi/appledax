import { nl } from './nl';
import { en } from './en';

export type Locale = 'nl' | 'en';

const LOCALE_KEY = 'appledax-locale';
const SUPPORTED_LOCALES: Locale[] = ['nl', 'en'];

const dictionaries: Record<Locale, Record<string, string>> = { nl, en };
let currentLocale: Locale = 'nl';

/**
 * Detect the best locale based on:
 * 1. Saved preference in localStorage
 * 2. Browser language (navigator.language)
 * 3. Fallback to 'en'
 */
export function detectLocale(): Locale {
  // Check saved preference first
  const saved = localStorage.getItem(LOCALE_KEY);
  if (saved && SUPPORTED_LOCALES.includes(saved as Locale)) {
    return saved as Locale;
  }

  // Detect from browser language
  const browserLang = navigator.language?.toLowerCase() ?? '';
  for (const locale of SUPPORTED_LOCALES) {
    if (browserLang === locale || browserLang.startsWith(locale + '-')) {
      return locale;
    }
  }

  // Default to English
  return 'en';
}

export function setLocale(locale: Locale): void {
  currentLocale = locale;
  localStorage.setItem(LOCALE_KEY, locale);
  document.documentElement.lang = locale;
}

export function getLocale(): Locale {
  return currentLocale;
}

export function getSupportedLocales(): Locale[] {
  return [...SUPPORTED_LOCALES];
}

export function t(key: string, params?: Record<string, string | number>): string {
  const dict = dictionaries[currentLocale];
  let text = dict[key] ?? dictionaries['en'][key] ?? key;

  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }

  return text;
}

/**
 * Apply translations to all elements with data-i18n attribute.
 * Optionally set title from data-i18n-title.
 */
export function applyTranslations(): void {
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    const key = el.dataset.i18n!;
    el.textContent = t(key);
  });
  document.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach((el) => {
    const key = el.dataset.i18nTitle!;
    el.title = t(key);
  });
  document.querySelectorAll<HTMLElement>('[data-i18n-html]').forEach((el) => {
    const key = el.dataset.i18nHtml!;
    el.innerHTML = t(key);
  });
}
