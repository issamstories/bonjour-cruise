/* ==========================================================================
   Extract the CURRENT English source strings so the translations can be
   regenerated after the copy was repositioned. Mirrors build-i18n's collection.
     - static:  walk dist/*.html text nodes + alt/title/placeholder/aria-label
                + SEO meta, exactly like build-i18n (key = whitespace-normalised).
     - ui:      t('...') / t("...") literals in src/*.js and i18n/*.js.
   Writes i18n/_strings.en.json (array) and i18n/_ui.en.json (array).
   Run AFTER `vite build` (needs dist/).
   ========================================================================== */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, HTMLElement } from 'node-html-parser';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DIST = join(ROOT, 'dist');
const I18N = join(ROOT, 'i18n');
const SRC = join(ROOT, 'src');

const SKIP = new Set(['admin.html']);
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
const norm = (s) => s.replace(/\s+/g, ' ').trim();
// Skip pure-number / symbol / placeholder strings that need no translation.
const skippable = (s) => !s || !/[A-Za-zЀ-ӿ]/.test(s) || s === '&copy;';

const staticSet = new Set();

function walk(node) {
  for (const child of node.childNodes) {
    if (child.nodeType === 3) {
      const t = norm(child.rawText || '');
      if (t && !skippable(t)) staticSet.add(t);
    } else if (child instanceof HTMLElement) {
      if (SKIP_PARENTS.has(child.tagName)) continue;
      for (const a of ATTRS) {
        const v = child.getAttribute(a);
        if (v) { const t = norm(v); if (t && !skippable(t)) staticSet.add(t); }
      }
      walk(child);
    }
  }
}

// ---- static strings from the English dist pages ----
const htmlFiles = existsSync(DIST)
  ? readdirSync(DIST).filter((f) => f.endsWith('.html') && !SKIP.has(f))
  : [];
for (const f of htmlFiles) {
  const root = parse(readFileSync(join(DIST, f), 'utf8'));
  walk(root);
  for (const [sel, attr] of META_SEL) {
    const el = root.querySelector(sel);
    const v = el?.getAttribute(attr);
    if (v) { const t = norm(v); if (t && !skippable(t)) staticSet.add(t); }
  }
}

// ---- ui strings from t('...') calls in the JS ----
const uiSet = new Set();
const jsFiles = [
  ...readdirSync(SRC).filter((f) => f.endsWith('.js')).map((f) => join(SRC, f)),
  ...readdirSync(I18N).filter((f) => f.endsWith('.js')).map((f) => join(I18N, f)),
];
// t('...') or t("...") ; capture the first string-literal argument.
const T_RE = /\bt\(\s*(['"])((?:\\.|(?!\1).)*)\1/g;
for (const file of jsFiles) {
  const code = readFileSync(file, 'utf8');
  let m;
  while ((m = T_RE.exec(code)) !== null) {
    const raw = m[2].replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
    const t = norm(raw);
    if (t && !skippable(t)) uiSet.add(t);
  }
}

const staticArr = [...staticSet].sort();
const uiArr = [...uiSet].sort();
writeFileSync(join(I18N, '_strings.en.json'), JSON.stringify(staticArr, null, 0) + '\n');
writeFileSync(join(I18N, '_ui.en.json'), JSON.stringify(uiArr, null, 0) + '\n');
console.log(`extracted: ${staticArr.length} static strings, ${uiArr.length} ui strings`);
