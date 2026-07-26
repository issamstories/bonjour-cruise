/* ==========================================================================
   MADAME CRUISE, i18n build generator (full-site)
   Runs AFTER `vite build`. Takes the English pages in dist/ (source of truth)
   and stamps out /fr /ar /ru /zh with EVERY string translated, real hreflang,
   a working language switcher and RTL for Arabic. English pages are
   post-processed in place to add hreflang + the switcher.

   Translations live in i18n/_strings.<lang>.json (English text -> translation),
   produced by the translation pass. Anything without a translation is left in
   English (safe fallback), so partial dictionaries never break a page.
   ========================================================================== */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, HTMLElement } from 'node-html-parser';
import { SITE, LANGS, FONTS, WHATSAPP, PAGES } from '../i18n/content.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, '..', 'dist');
const I18N = join(__dirname, '..', 'i18n');

const SKIP = new Set(['admin.html']);
const ASSET_RE = /\.(js|css|png|jpe?g|svg|ico|webp|gif|woff2?|ttf|xml|txt|pdf|json)$/i;
const SKIP_PARENTS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT']);
const ATTRS = ['alt', 'title', 'placeholder', 'aria-label'];
const META_SEL = [
  ['meta[name="description"]', 'content'],
  ['meta[property="og:title"]', 'content'],
  ['meta[property="og:description"]', 'content'],
  ['meta[property="og:image:alt"]', 'content'],
  ['meta[name="twitter:title"]', 'content'],
  ['meta[name="twitter:description"]', 'content'],
];

/* ---------- load per-language dictionaries ---------- */

const DICT = {};
for (const l of LANGS) {
  if (l.code === 'en') continue;
  const f = join(I18N, `_strings.${l.code}.json`);
  try {
    DICT[l.code] = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {};
  } catch {
    // A half-written dictionary (e.g. mid-translation) must not break the build.
    DICT[l.code] = {};
    console.warn(`i18n: could not parse _strings.${l.code}.json, using English fallback.`);
  }
}

const norm = (s) => s.replace(/\s+/g, ' ').trim();

// Arabic renders Eastern Arabic (Arabic-Indic) numerals for every user-facing
// number, including prices. Convert 0-9 to ٠-٩ on Arabic strings only.
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const araDigits = (code, s) => (code === 'ar' && s != null ? String(s).replace(/[0-9]/g, (d) => AR_DIGITS[+d]) : s);

// Return a translation only when it is a non-empty string; an empty value must
// never blank out the English text node (fall back to English instead).
function tr(text, lang) {
  const v = DICT[lang]?.[norm(text)];
  if (typeof v !== 'string' || !v.trim()) return undefined;
  return araDigits(lang, v);
}

// Escape for a text node without double-escaping existing entities.
const escapeText = (s) => String(s)
  .replace(/&(?!#?[a-zA-Z0-9]+;)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* ---------- path + url helpers ---------- */

function pagePath(file) {
  const override = PAGES[file]?.path;
  if (override !== undefined) return override;
  return file === 'index.html' ? '' : file;
}
const urlFor = (code, path) => `${code === 'en' ? SITE : `${SITE}/${code}`}/${path}`;
const hrefFor = (code, path) => `${code === 'en' ? '' : `/${code}`}/${path}`;

/* ---------- translation walk ---------- */

function translateNode(node, lang) {
  for (const child of node.childNodes) {
    if (child.nodeType === 3) {
      const raw = child.rawText;
      if (!raw || !raw.trim()) continue;
      const t = tr(raw, lang);
      let out;
      if (t != null) {
        const lead = raw.match(/^\s*/)[0];
        const tail = raw.match(/\s*$/)[0];
        out = lead + escapeText(t) + tail;
      } else {
        // Untranslated node (e.g. a hard-coded price "AED 7,500"): in Arabic we
        // still convert its digits to Arabic-Indic so no Latin numbers remain.
        out = araDigits(lang, raw);
      }
      if (out !== raw) child.rawText = out;
    } else if (child instanceof HTMLElement) {
      if (SKIP_PARENTS.has(child.tagName)) continue;
      for (const a of ATTRS) {
        const v = child.getAttribute(a);
        if (v) { const t = tr(v, lang); const nv = t != null ? t : araDigits(lang, v); if (nv !== v) child.setAttribute(a, nv); }
      }
      translateNode(child, lang);
    }
  }
}

/* ---------- link rewriting ---------- */

function isInternalPage(href) {
  if (!href || !href.startsWith('/') || href.startsWith('//')) return false;
  if (href.startsWith('/assets') || href.startsWith('/src') || href.startsWith('/favicon')) return false;
  return !ASSET_RE.test(href);
}
function rewriteLinks(root, code) {
  root.querySelectorAll('a[href]').forEach((a) => {
    const href = a.getAttribute('href');
    if (isInternalPage(href)) a.setAttribute('href', `/${code}${href === '/' ? '/' : href}`);
  });
}

/* ---------- head: hreflang, canonical, og:url, fonts ---------- */

function injectHead(root, code, path) {
  const head = root.querySelector('head');
  if (!head) return;
  const selfUrl = urlFor(code, path);
  root.querySelector('link[rel="canonical"]')?.setAttribute('href', selfUrl);
  root.querySelector('meta[property="og:url"]')?.setAttribute('content', selfUrl);

  const alts = LANGS.map((l) => `<link rel="alternate" hreflang="${l.htmlLang}" href="${urlFor(l.code, path)}" />`).join('\n  ');
  head.insertAdjacentHTML('beforeend', `\n  ${alts}\n  <link rel="alternate" hreflang="x-default" href="${urlFor('en', path)}" />\n`);

  const font = FONTS[code];
  if (font) head.insertAdjacentHTML('beforeend', `\n  <link href="${font.href}" rel="stylesheet" />\n  <style>${font.css}</style>\n`);
}

function injectSwitcher(root, code, path) {
  const items = LANGS.map((l) => {
    const cur = l.code === code ? ' aria-current="true"' : '';
    return `<a href="${hrefFor(l.code, path)}" hreflang="${l.htmlLang}"${cur}>${l.label}</a>`;
  }).join('<span aria-hidden="true"> | </span>');
  root.querySelectorAll('.lang-switcher').forEach((sw) => {
    sw.setAttribute('aria-label', 'Language selection');
    sw.set_content(items);
  });
}

/* ---------- render one page in one language ---------- */

function render(enHtml, code, file) {
  const lang = LANGS.find((l) => l.code === code);
  const path = pagePath(file);
  const doctype = (enHtml.match(/^\s*<!doctype[^>]*>/i) || ['<!doctype html>'])[0];
  const root = parse(enHtml.replace(/^\s*<!doctype[^>]*>/i, ''), { comment: true });

  const htmlEl = root.querySelector('html');
  if (htmlEl) { htmlEl.setAttribute('lang', lang.htmlLang); htmlEl.setAttribute('dir', lang.dir); }

  if (code !== 'en') {
    // title + body (every text node + safe attributes)
    const titleEl = root.querySelector('title');
    if (titleEl) { const t = tr(titleEl.text, code); if (t != null) titleEl.set_content(escapeText(t)); }
    for (const [sel, attr] of META_SEL) {
      const m = root.querySelector(sel);
      const v = m?.getAttribute(attr);
      if (v) { const t = tr(v, code); if (t != null) m.setAttribute(attr, t); }
    }
    const body = root.querySelector('body');
    if (body) translateNode(body, code);

    // WhatsApp float greeting (href ?text=)
    root.querySelectorAll('a.whatsapp-float').forEach((a) => {
      if (WHATSAPP.text[code]) a.setAttribute('href', `https://wa.me/971585986118?text=${encodeURIComponent(WHATSAPP.text[code])}`);
    });

    // Curated per-page SEO overrides (index keeps hand-crafted meta + JSON-LD)
    const page = PAGES[file];
    if (page?.seo) {
      const s = page.seo;
      if (s.title?.[code]) titleEl?.set_content(escapeText(araDigits(code, s.title[code])));
      const set = (sel, val) => { if (val != null) root.querySelector(sel)?.setAttribute('content', araDigits(code, val)); };
      set('meta[name="description"]', s.description?.[code]);
      set('meta[property="og:title"]', s.ogTitle?.[code]);
      set('meta[property="og:description"]', s.ogDescription?.[code]);
      set('meta[property="og:image:alt"]', s.ogImageAlt?.[code]);
      const ld = root.querySelector('script[type="application/ld+json"]');
      if (ld) {
        try {
          const data = JSON.parse(ld.text);
          // Structured data keeps Latin digits (machine-readable for search engines).
          if (s.jsonldDescription?.[code]) data.description = s.jsonldDescription[code];
          if (s.slogan?.[code]) data.slogan = s.slogan[code];
          data.url = urlFor(code, path);
          ld.set_content(JSON.stringify(data));
        } catch { /* leave */ }
      }
    }

    rewriteLinks(root, code);
  }

  injectHead(root, code, path);
  injectSwitcher(root, code, path);
  return `${doctype}\n${root.toString()}`;
}

/* ---------- multilingual sitemap ----------
   Vite copies public/sitemap.xml (English-only, curated set) to dist. We expand
   it: every curated page gets one <url> per language with xhtml:link hreflang
   alternates, so search engines discover and pair all script/locale variants. */

function buildSitemap() {
  const src = join(DIST, 'sitemap.xml');
  if (!existsSync(src)) return;
  const xml = readFileSync(src, 'utf8');
  const entries = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => {
    const block = m[1];
    const loc = (block.match(/<loc>([^<]*)<\/loc>/) || [])[1] || '';
    const changefreq = (block.match(/<changefreq>([^<]*)<\/changefreq>/) || [])[1];
    const priority = (block.match(/<priority>([^<]*)<\/priority>/) || [])[1];
    // Path relative to the English root, e.g. "" for "/", "cruises.html" otherwise.
    const path = loc.replace(SITE, '').replace(/^\//, '');
    return { path, changefreq, priority };
  });

  const urls = [];
  for (const e of entries) {
    const alts = LANGS
      .map((l) => `    <xhtml:link rel="alternate" hreflang="${l.htmlLang}" href="${urlFor(l.code, e.path)}" />`)
      .concat(`    <xhtml:link rel="alternate" hreflang="x-default" href="${urlFor('en', e.path)}" />`)
      .join('\n');
    for (const l of LANGS) {
      urls.push(
        `  <url>\n    <loc>${urlFor(l.code, e.path)}</loc>\n` +
        (e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>\n` : '') +
        (e.priority ? `    <priority>${e.priority}</priority>\n` : '') +
        `${alts}\n  </url>`,
      );
    }
  }
  const out = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join('\n')}\n</urlset>\n`;
  writeFileSync(src, out, 'utf8');
  console.log(`i18n: sitemap expanded to ${urls.length} urls (${entries.length} pages x ${LANGS.length} languages).`);
}

/* ---------- run ---------- */

const files = readdirSync(DIST).filter((f) => f.endsWith('.html') && !SKIP.has(f));
let count = 0;
for (const file of files) {
  const enHtml = readFileSync(join(DIST, file), 'utf8');
  for (const lang of LANGS) {
    const out = render(enHtml, lang.code, file);
    const target = lang.code === 'en' ? join(DIST, file) : join(DIST, lang.code, file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, out, 'utf8');
    count += 1;
  }
}
buildSitemap();
console.log(`i18n: generated ${count} page(s) across ${LANGS.length} languages from ${files.length} source page(s).`);
