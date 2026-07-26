/* Extract every translatable string from the built English pages, so the
   i18n dictionary can cover the WHOLE site with nothing missed.
   Usage: node scripts/extract-strings.mjs [page.html]  */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, HTMLElement } from 'node-html-parser';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, '..', 'dist');

const SKIP_PARENTS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT']);
const ATTRS = ['alt', 'title', 'placeholder', 'aria-label'];

// Worth translating? Skip whitespace, pure numbers/prices, emails, brand-only.
function meaningful(s) {
  const t = s.trim();
  if (t.length < 2) return false;
  if (!/[A-Za-z]/.test(t)) return false;             // no latin letters (numbers, emojis)
  if (/^[\d\s.,%+\-–—/:()AED]+$/.test(t)) return false;
  if (/@/.test(t) && /\.[a-z]{2,}/.test(t)) return false; // emails
  if (/^Madame\s*Cruise$/i.test(t)) return false;    // brand
  return true;
}

function walk(node, out) {
  for (const child of node.childNodes) {
    if (child.nodeType === 3) {
      const raw = child.rawText;
      if (raw && meaningful(raw)) out.add(raw.replace(/\s+/g, ' ').trim());
    } else if (child instanceof HTMLElement) {
      if (SKIP_PARENTS.has(child.tagName)) continue;
      for (const a of ATTRS) {
        const v = child.getAttribute(a);
        if (v && meaningful(v)) out.add(v.replace(/\s+/g, ' ').trim());
      }
      walk(child, out);
    }
  }
}

const arg = process.argv[2];
const isFlag = arg && arg.startsWith('--');
const files = (arg && !isFlag) ? [arg] : readdirSync(DIST).filter((f) => f.endsWith('.html') && f !== 'admin.html');

const perPage = {};
const all = new Set();
for (const f of files) {
  const html = readFileSync(join(DIST, f), 'utf8').replace(/^\s*<!doctype[^>]*>/i, '');
  const root = parse(html, { comment: false });
  const body = root.querySelector('body') || root;
  const title = root.querySelector('title');
  const set = new Set();
  if (title && meaningful(title.text)) set.add(title.text.replace(/\s+/g, ' ').trim());
  // Meta descriptions + social cards need translating too (SEO per language).
  const metaSel = [
    'meta[name="description"]', 'meta[property="og:title"]', 'meta[property="og:description"]',
    'meta[property="og:image:alt"]', 'meta[name="twitter:title"]', 'meta[name="twitter:description"]',
  ];
  for (const sel of metaSel) {
    const m = root.querySelector(sel);
    const v = m?.getAttribute('content');
    if (v && meaningful(v)) set.add(v.replace(/\s+/g, ' ').trim());
  }
  walk(body, set);
  perPage[f] = [...set];
  set.forEach((s) => all.add(s));
}

if (arg === '--dump') {
  const outfile = join(__dirname, '..', 'i18n', '_strings.en.json');
  const sorted = [...all].sort();
  writeFileSync(outfile, JSON.stringify(sorted, null, 0), 'utf8');
  console.log(`Wrote ${sorted.length} unique strings to ${outfile}`);
} else if (arg) {
  console.log(perPage[arg].map((s) => JSON.stringify(s)).join(',\n'));
} else {
  for (const f of files) console.log(`${f}: ${perPage[f].length}`);
  console.log(`\nUNIQUE ACROSS SITE: ${all.size}`);
}
