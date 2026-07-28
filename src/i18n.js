/* ==========================================================================
   BONJOUR CRUISE, runtime i18n for the dynamic JS (wizard, account, cruises).
   Same model as the static generator: the English string IS the key, so we
   just wrap user-facing strings in t(). Missing translations fall back to
   English, so a partial dictionary never breaks a screen.

   The page's language is the first path segment (/fr /ar /ru /zh), else EN.
   The per-language UI dictionary lives in src/_ui.json (English -> translation),
   bundled by Vite; it is filled by the UI translation pass.
   ========================================================================== */

import UI from './_ui.json';

const CODES = ['fr', 'ar', 'ru', 'zh', 'zh-hant'];

function detectLang() {
  const seg = (location.pathname.split('/')[1] || '').toLowerCase();
  return CODES.includes(seg) ? seg : 'en';
}

export const LANG = detectLang();
const DICT = (LANG !== 'en' && UI[LANG]) ? UI[LANG] : {};

// Arabic uses Eastern Arabic (Arabic-Indic) numerals everywhere, including
// prices and counts. Convert 0-9 to ٠-٩ on every user-facing number when the
// page language is Arabic (idempotent for other languages / already-Arabic digits).
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
export function araDigits(s) {
  return LANG === 'ar' ? String(s).replace(/[0-9]/g, (d) => AR_DIGITS[+d]) : String(s);
}

// Translate. Optional {name} interpolation: t('Hello {name}', {name: 'Sara'}).
export function t(str, vars) {
  let out = DICT[str] != null ? DICT[str] : str;
  if (vars) for (const k of Object.keys(vars)) out = out.split(`{${k}}`).join(String(vars[k]));
  return araDigits(out);
}

const NUM_LOCALE = { en: 'en-US', fr: 'fr-FR', ar: 'ar-AE', ru: 'ru-RU', zh: 'zh-CN', 'zh-hant': 'zh-TW' }[LANG] || 'en-US';
const INTL_LOCALE = { en: 'en-GB', fr: 'fr-FR', ar: 'ar-AE', ru: 'ru-RU', zh: 'zh-CN', 'zh-hant': 'zh-TW' }[LANG] || 'en-GB';

// Prices: "AED 1,900" (AED stays as the currency token), Arabic-Indic digits in AR.
export function fmtAED(n) { return 'AED ' + araDigits(Number(n).toLocaleString('en-US')); }

// Locale-aware date/time (used by the recap + cruise cards), Arabic-Indic in AR.
export function fmtDateTime(iso, opts) {
  try { return araDigits(new Intl.DateTimeFormat(INTL_LOCALE, opts).format(new Date(iso))); }
  catch { return iso; }
}

export const localeTag = INTL_LOCALE;

// Prefix an internal path with the current language folder, so links CREATED IN
// JS (profile button, modals, redirects) stay in the visitor's language. The
// static-HTML generator already rewrites authored links; this is for runtime ones.
export function langHref(path) {
  if (typeof path !== 'string' || !path.startsWith('/')) return path;
  if (LANG === 'en') return path;
  if (path.startsWith('/assets') || path.startsWith('/src') || path.startsWith('/favicon')) return path;
  return `/${LANG}${path}`;
}
