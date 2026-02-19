import { nl } from './nl';
import { en } from './en';

type Locale = 'nl' | 'en';

const dictionaries: Record<Locale, Record<string, string>> = { nl, en };
let currentLocale: Locale = 'nl';

export function setLocale(locale: Locale): void {
  currentLocale = locale;
}

export function getLocale(): Locale {
  return currentLocale;
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
