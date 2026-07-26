import './styles.css';
import './datepicker.js';
import { t, langHref } from './i18n.js';

/* ==========================================================================
   BONJOUR CRUISE, member layer shared across every page
   Three jobs, all progressive enhancement on top of the static site:
     1. The profile button in the top-right nav (label reflects auth state).
     2. An airline-style "boarding" banner when a member's cruise is imminent.
     3. A post-cruise feedback pop-up that opens itself once a cruise has ended.
   Supabase is imported lazily so pages that never need it stay light.
   ========================================================================== */

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

let supabasePromise;
function getSupabase() {
  if (!supabasePromise) supabasePromise = import('./supabase.js').then((m) => m.supabase);
  return supabasePromise;
}

/* ---------- Tiny helpers ---------- */

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function esc(value) {
  return String(value ?? '')
    .replace(/\s*[—–]\s*/g, ', ') // never render an em/en dash (Issam's rule)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const PROFILE_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 1.8c-4.2 0-7.2 2.1-7.2 5.2V20h14.4v-1c0-3.1-3-5.2-7.2-5.2Z"/></svg>';

// A little guest silhouette used to show seats: filled = booked, faint = free.
const MADAME_ICON =
  '<svg viewBox="0 0 24 24" class="seat-icon" aria-hidden="true"><path d="M12 10.6a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-5 9.4c0-3.3 2.2-6 5-6s5 2.7 5 6Z"/></svg>';

// Row of guest icons: `total` seats. First `filled` = booked (blush),
// next `pick` = the seats you are about to reserve (gold), rest = free (faint).
// `people` (optional) holds tooltip text per booked icon, only for guests who
// agreed to share their details, so hovering shows who is aboard.
export function seatIcons(filled, total, pick = 0, people = []) {
  const n = Math.max(1, Math.min(20, Math.round(Number(total) || 8)));
  const f = Math.max(0, Math.min(n, Math.round(Number(filled) || 0)));
  const p = Math.max(0, Math.min(n - f, Math.round(Number(pick) || 0)));
  let html = '<div class="seat-icons">';
  for (let i = 0; i < n; i += 1) {
    if (i < f) {
      const info = people[i];
      const titleAttr = info ? ` title="${esc(info)}"` : '';
      html += `<span class="seat-icon-wrap is-on${info ? ' has-info' : ''}"${titleAttr}>${MADAME_ICON}</span>`;
    } else if (i < f + p) {
      html += `<span class="seat-icon-wrap is-pick">${MADAME_ICON}</span>`;
    } else {
      html += `<span class="seat-icon-wrap">${MADAME_ICON}</span>`;
    }
  }
  return `${html}</div>`;
}

// "1 guest has booked." / "3 guests have booked." / first-aboard prompt.
export function madameLine(count) {
  const c = Number(count) || 0;
  if (c <= 0) return t('Be the first guest aboard.');
  return c === 1 ? t('1 guest has booked.') : t('{n} guests have booked.', { n: c });
}

// Soft, minimal globe (thin meridians) for the language switcher.
const GLOBE_SVG =
  '<svg class="lang-globe-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 2.5 15.5 0 18M12 3c-2.5 2.5-2.5 15.5 0 18"/></svg>';

/* ---------- Language awareness (the site ships EN + /fr /ar /ru /zh) ---------- */

const UI_LANGS = [
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'fr', label: 'Français', short: 'FR' },
  { code: 'ar', label: 'العربية', short: 'AR' },
  { code: 'ru', label: 'Русский', short: 'RU' },
  { code: 'zh', label: '简体中文', short: '简' },
  { code: 'zh-hant', label: '繁體中文', short: '繁' },
];
const LANG_CODES = UI_LANGS.map((l) => l.code);

// Which language is this page? Read it from the first path segment.
function currentLang() {
  const seg = (location.pathname.split('/')[1] || '').toLowerCase();
  return LANG_CODES.includes(seg) && seg !== 'en' ? seg : 'en';
}

// The same page in another language, keeping the rest of the path intact.
function pathInLang(target) {
  let p = location.pathname;
  const seg = (p.split('/')[1] || '').toLowerCase();
  if (LANG_CODES.includes(seg) && seg !== 'en') p = p.slice(seg.length + 1) || '/';
  if (!p.startsWith('/')) p = `/${p}`;
  return target === 'en' ? p : `/${target}${p === '/' ? '/' : p}`;
}

// Logged-out profile label, per language.
const SIGNIN_LABEL = {
  en: 'Sign in', fr: 'Connexion', ar: 'تسجيل الدخول', ru: 'Войти', zh: '登录', 'zh-hant': '登入',
};
const signinLabel = () => SIGNIN_LABEL[currentLang()] || SIGNIN_LABEL.en;

/* ---------- 1. Profile button ---------- */

function injectProfileButton() {
  document.querySelectorAll('.nav-actions').forEach((actions) => {
    if (actions.querySelector('[data-profile-btn]')) return;
    const btn = el(`
      <a class="profile-btn" href="${langHref('/account.html')}" data-profile-btn aria-label="${t('Sign in or view your account')}">
        <span class="profile-btn-avatar" data-profile-avatar>${PROFILE_SVG}</span>
        <span class="profile-btn-label" data-profile-label>${esc(signinLabel())}</span>
      </a>`);
    const cta = actions.querySelector('.nav-cta');
    actions.insertBefore(btn, cta || null);
  });
}

function refreshProfileButton(name, avatarUrl) {
  const first = (name || '').trim().split(' ')[0];
  document.querySelectorAll('[data-profile-btn]').forEach((btn) => {
    const label = btn.querySelector('[data-profile-label]');
    const avatar = btn.querySelector('[data-profile-avatar]');
    if (first) {
      btn.classList.add('is-member');
      if (label) label.textContent = first;
      if (avatar) {
        if (avatarUrl) {
          avatar.classList.add('has-photo');
          avatar.style.backgroundImage = `url("${avatarUrl}")`;
          avatar.textContent = '';
        } else {
          avatar.classList.remove('has-photo');
          avatar.style.backgroundImage = '';
          avatar.textContent = first.charAt(0).toUpperCase();
        }
      }
      btn.setAttribute('aria-label', `${first}, view your account`);
    } else {
      btn.classList.remove('is-member');
      if (label) label.textContent = signinLabel();
      if (avatar) {
        avatar.classList.remove('has-photo');
        avatar.style.backgroundImage = '';
        avatar.innerHTML = PROFILE_SVG;
      }
      btn.setAttribute('aria-label', 'Sign in or view your account');
    }
  });
}

/* ---------- Header polish: language globe + declutter ---------- */

function toast(message) {
  const t = el(`<div class="mc-toast" role="status">${esc(message)}</div>`);
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2600);
}

// Turn the bare switcher into a globe dropdown that actually takes the guest
// to this same page in the chosen language (EN + /fr /ar /ru /zh).
function initLangSwitcher() {
  const cur = currentLang();
  const curShort = (UI_LANGS.find((l) => l.code === cur) || UI_LANGS[0]).short;

  document.querySelectorAll('.lang-switcher').forEach((sw) => {
    if (sw.dataset.enhanced) return;
    sw.dataset.enhanced = '1';
    sw.innerHTML = `
      <button type="button" class="lang-globe" aria-haspopup="true" aria-expanded="false" aria-label="${t('Choose your language')}">
        ${GLOBE_SVG}<span class="lang-globe-current">${curShort}</span>
      </button>
      <div class="lang-menu" role="menu" hidden>
        ${UI_LANGS.map((l) => `<a role="menuitem" href="${pathInLang(l.code)}" hreflang="${l.code}" lang="${l.code}" data-lang="${l.code}"${l.code === cur ? ' class="is-active" aria-current="true"' : ''}>${l.label}</a>`).join('')}
      </div>`;

    const btn = sw.querySelector('.lang-globe');
    const menu = sw.querySelector('.lang-menu');

    const closeMenu = () => { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); };

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = menu.hidden;
      menu.hidden = !willOpen;
      btn.setAttribute('aria-expanded', String(willOpen));
    });
    // Menu items are real links now, so they navigate on their own. Just close.
    menu.querySelectorAll('[data-lang]').forEach((item) => {
      item.addEventListener('click', () => closeMenu());
    });

    document.addEventListener('click', () => { if (!menu.hidden) closeMenu(); });
  });
}

// Lighten the header: the avatar button already covers account access, the
// homepage itself is the booking flow (so the "Book your cruise" CTA is
// redundant), and Privacy Promise now lives in the footer only.
function declutterNav() {
  // Netlify serves pretty URLs, so the link may be /account.html OR /account.
  document
    .querySelectorAll('.nav-links a[href*="/account"], .mobile-menu a[href*="/account"]')
    .forEach((a) => a.closest('li')?.remove());
  // Redundant primary CTA (the home wizard books directly).
  document.querySelectorAll('.nav-cta').forEach((a) => a.remove());
  // Privacy Promise moves to the footer; the home wizard already shows dated
  // cruises, so "Cruises" leaves the header too (page stays live for SEO/links).
  document
    .querySelectorAll('.nav-links a[href*="privacy-promise"], .mobile-menu a[href*="privacy-promise"], .nav-links a[href*="cruises"], .mobile-menu a[href*="cruises"], .mobile-menu a[href*="/book"]')
    .forEach((a) => a.closest('li')?.remove());
}

// The floating WhatsApp button must be on every page, always. Inject it if the
// page's static markup does not already include it (so it never disappears).
const WA_SVG =
  '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 2.9C8.8 2.9 2.9 8.8 2.9 16c0 2.3.6 4.6 1.8 6.6L2.8 29.2l6.8-1.8c1.9 1.1 4.1 1.6 6.4 1.6 7.2 0 13.1-5.9 13.1-13.1S23.2 2.9 16 2.9zm0 23.9c-2 0-3.9-.5-5.6-1.5l-.4-.2-4.1 1.1 1.1-4-.3-.4c-1.1-1.7-1.7-3.7-1.7-5.8C5 10 9.9 5.1 16 5.1S27 10 27 16.1 22.1 26.8 16 26.8zm6-8.1c-.3-.2-1.9-1-2.2-1.1-.3-.1-.5-.2-.7.2-.2.3-.8 1.1-1 1.3-.2.2-.4.2-.7.1-.3-.2-1.4-.5-2.6-1.6-1-.9-1.6-1.9-1.8-2.3-.2-.3 0-.5.1-.7l.5-.6c.2-.2.2-.3.3-.6.1-.2.1-.4 0-.6-.1-.2-.7-1.8-1-2.4-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.6.1-.9.4-.3.3-1.1 1.1-1.1 2.7s1.2 3.2 1.3 3.4c.2.2 2.3 3.6 5.7 5 .8.3 1.4.5 1.9.7.8.3 1.5.2 2.1.1.6-.1 1.9-.8 2.2-1.5.3-.8.3-1.4.2-1.5-.1-.2-.3-.3-.6-.4z"/></svg>';
function ensureWhatsAppFloat() {
  if (document.querySelector('.whatsapp-float')) return;
  const a = el(`<a class="whatsapp-float" href="https://wa.me/971585986118?text=Hello%20Bonjour%20Cruise%2C%20I%20have%20a%20question." aria-label="Chat with us on WhatsApp">${WA_SVG}</a>`);
  document.body.appendChild(a);
}

// Email links: keep the mailto (opens a mail app where one is set), but also
// copy the address on click with a little "copied" toast, so anyone without a
// default mail app (or who just wants the address) is never stuck.
function enhanceEmailLinks() {
  document.querySelectorAll('a[href^="mailto:"]').forEach((a) => {
    if (a.dataset.copyBound) return;
    a.dataset.copyBound = '1';
    a.classList.add('email-copy');
    a.setAttribute('title', 'Click to copy, or open your mail app');
    a.addEventListener('click', () => {
      const email = (a.getAttribute('href') || '').replace(/^mailto:/i, '').split('?')[0];
      if (email && navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(email).then(() => toast(t('Email copied ✓')), () => {});
      }
      // Do not preventDefault: a configured mail app still opens.
    });
  });
}

/* ---------- Date helpers ---------- */

function cruiseEndMs(c) {
  return c.ends_at ? Date.parse(c.ends_at) : Date.parse(c.starts_at) + 3 * HOUR;
}

function fmtTime(iso) {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

function fmtDay(iso) {
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(Date.now() + DAY);
  const sameDay = (a, b) => a.toDateString() === b.toDateString();
  if (sameDay(d, today)) return 'today';
  if (sameDay(d, tomorrow)) return 'tomorrow';
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
}

function countdown(ms) {
  if (ms <= 0) return 'any moment now';
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hrs < 24) return `${hrs}h ${rem}m`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days > 1 ? 's' : ''}`;
}

/* ---------- 2. Airline-style boarding banner ---------- */

let bannerTimer;

function showBoardingBanner(c) {
  if (sessionStorage.getItem('mc_banner_' + c.id) === 'dismissed') return;
  if (document.querySelector('.boarding-banner')) return;

  const startMs = Date.parse(c.starts_at);
  const banner = el(`
    <div class="boarding-banner" role="status" aria-live="polite">
      <div class="container boarding-inner">
        <span class="boarding-anchor" aria-hidden="true">&#9875;</span>
        <div class="boarding-text">
          <p class="boarding-title"></p>
          <p class="boarding-sub"></p>
        </div>
        <a class="btn btn-gold boarding-cta" href="${langHref('/account.html')}">${t('Boarding details')}</a>
        <button class="boarding-close" type="button" aria-label="${t('Dismiss this notice')}">&#10005;</button>
      </div>
    </div>`);

  document.body.prepend(banner);
  const titleEl = banner.querySelector('.boarding-title');
  const subEl = banner.querySelector('.boarding-sub');

  const update = () => {
    const now = Date.now();
    const inProgress = now >= startMs && now <= cruiseEndMs(c);
    if (inProgress) {
      titleEl.textContent = t('You are sailing, enjoy every moment.');
      subEl.textContent = `${c.title} · ${c.port_name}`;
    } else {
      titleEl.textContent = t('Your cruise departs {day} at {time}', { day: fmtDay(c.starts_at), time: fmtTime(c.starts_at) });
      subEl.textContent = t('{port} · boarding in {countdown}', { port: c.port_name, countdown: countdown(startMs - now) });
    }
  };

  update();
  bannerTimer = setInterval(update, 30000);

  banner.querySelector('.boarding-close').addEventListener('click', () => {
    sessionStorage.setItem('mc_banner_' + c.id, 'dismissed');
    clearInterval(bannerTimer);
    banner.remove();
  });
}

/* ---------- 3. Post-cruise feedback pop-up ---------- */

const LOVE_OPTIONS = ['The privacy', 'The crew', 'The food', 'The vibe', 'The swimming', 'The sunset'];

function showFeedbackModal(c, userId) {
  if (document.querySelector('.mc-modal')) return;

  const modal = el(`
    <div class="mc-modal" role="dialog" aria-modal="true" aria-labelledby="fb-title">
      <div class="mc-modal-backdrop" data-close></div>
      <div class="mc-modal-card">
        <button class="mc-modal-close" type="button" aria-label="${t('Close')}" data-close>&#10005;</button>
        <div class="fb-body">
          <span class="eyebrow">${t('Thank you for choosing us')}</span>
          <h2 id="fb-title">${t('How was your cruise?')}</h2>
          <p class="fb-intro">${t('Just a few quick taps, {name}, it helps us make every cruise better for the guests who sail after you.', { name: esc(c.title) })}</p>

          <div class="fb-field">
            <span class="fb-q">${t('Your overall experience')}</span>
            <div class="fb-stars" role="radiogroup" aria-label="${t('Overall rating')}">
              ${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="fb-star" data-star="${n}" aria-label="${t('{n} stars', { n })}">&#9734;</button>`).join('')}
            </div>
          </div>

          <div class="fb-field">
            <span class="fb-q">${t('What did you love?')}</span>
            <div class="fb-chips">
              ${LOVE_OPTIONS.map((o) => `<button type="button" class="fb-chip" data-love="${esc(o)}">${esc(t(o))}</button>`).join('')}
            </div>
          </div>

          <div class="fb-field">
            <span class="fb-q">${t('Anything we could do better?')}</span>
            <input type="text" class="fb-improve" maxlength="240" placeholder="${t('Optional, one line is plenty')}" />
          </div>

          <div class="fb-field">
            <span class="fb-q">${t('Would you recommend us to a friend?')}</span>
            <div class="fb-rec">
              <button type="button" class="fb-rec-btn" data-rec="yes">${t('Absolutely')}</button>
              <button type="button" class="fb-rec-btn" data-rec="maybe">${t('Maybe')}</button>
              <button type="button" class="fb-rec-btn" data-rec="no">${t('Not really')}</button>
            </div>
          </div>

          <div class="fb-actions">
            <button type="button" class="btn btn-primary fb-send">${t('Send feedback')}</button>
            <button type="button" class="fb-later" data-close>${t('Maybe later')}</button>
          </div>
          <p class="fb-status" role="status" aria-live="polite"></p>
        </div>
      </div>
    </div>`);

  document.body.appendChild(modal);
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => modal.classList.add('is-open'));

  const state = { rating: 0, loved: new Set(), recommend: null };

  // Stars
  const stars = [...modal.querySelectorAll('.fb-star')];
  // Filled vs empty is shown by the glyph itself (★ / ☆), not colour alone,
  // so it stays legible for colour-blind guests.
  const paint = (v) => stars.forEach((s) => {
    const filled = Number(s.dataset.star) <= v;
    s.classList.toggle('on', filled);
    s.textContent = filled ? '★' : '☆';
  });
  stars.forEach((s) => {
    const v = Number(s.dataset.star);
    s.addEventListener('mouseenter', () => paint(v));
    s.addEventListener('mouseleave', () => paint(state.rating));
    s.addEventListener('click', () => { state.rating = v; paint(v); });
  });

  // Love chips (multi-select)
  modal.querySelectorAll('.fb-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const v = chip.dataset.love;
      if (state.loved.has(v)) { state.loved.delete(v); chip.classList.remove('on'); }
      else { state.loved.add(v); chip.classList.add('on'); }
    });
  });

  // Recommend (single-select)
  modal.querySelectorAll('.fb-rec-btn').forEach((b) => {
    b.addEventListener('click', () => {
      state.recommend = b.dataset.rec;
      modal.querySelectorAll('.fb-rec-btn').forEach((x) => x.classList.toggle('on', x === b));
    });
  });

  const close = () => {
    modal.classList.remove('is-open');
    document.body.style.overflow = '';
    setTimeout(() => modal.remove(), 300);
  };
  modal.querySelectorAll('[data-close]').forEach((node) => node.addEventListener('click', close));
  const onKey = (e) => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } };
  document.addEventListener('keydown', onKey);

  // "Maybe later", don't nag again this session
  modal.querySelector('.fb-later').addEventListener('click', () => {
    sessionStorage.setItem('mc_fb_later_' + c.id, '1');
  });

  const statusEl = modal.querySelector('.fb-status');
  modal.querySelector('.fb-send').addEventListener('click', async () => {
    if (!state.rating) {
      statusEl.textContent = t('Just tap a star to rate your cruise first.');
      statusEl.className = 'fb-status err';
      return;
    }
    const sendBtn = modal.querySelector('.fb-send');
    sendBtn.disabled = true;
    sendBtn.textContent = t('Sending…');

    const supabase = await getSupabase();
    const { error } = await supabase.from('feedback').insert({
      user_id: userId,
      cruise_id: c.id,
      rating: state.rating,
      loved: [...state.loved],
      improve: modal.querySelector('.fb-improve').value.trim() || null,
      recommend: state.recommend,
    });

    if (error) {
      statusEl.textContent = t('Could not send right now, please try again in a moment.');
      statusEl.className = 'fb-status err';
      sendBtn.disabled = false;
      sendBtn.textContent = t('Send feedback');
      return;
    }

    localStorage.setItem('mc_fb_done_' + c.id, '1');
    modal.querySelector('.fb-body').innerHTML = `
      <div class="fb-thanks">
        <span class="fb-thanks-mark" aria-hidden="true">&#128156;</span>
        <h2>${t('Thank you, truly.')}</h2>
        <p>${t('Your words help us make the next cruise even better. The sea will be waiting for you again.')}</p>
        <button type="button" class="btn btn-primary" data-close>${t('Close')}</button>
      </div>`;
    modal.querySelector('[data-close]').addEventListener('click', close);
  });
}

/* ---------- Orchestration ---------- */

function hasStoredSession() {
  // Supabase persists the session under an "sb-<ref>-auth-token" localStorage key.
  // If none exists the visitor is logged out, so we skip loading Supabase entirely.
  try {
    return Object.keys(localStorage).some((k) => k.startsWith('sb-') && k.endsWith('-auth-token'));
  } catch {
    return false;
  }
}

async function loadMemberState() {
  // Anonymous visitors (most traffic) never download the Supabase client.
  if (!hasStoredSession()) {
    refreshProfileButton(null);
    return;
  }

  let supabase;
  try {
    supabase = await getSupabase();
  } catch {
    return; // Supabase not configured, leave the logged-out profile button as is.
  }

  const { data: { session } } = await supabase.auth.getSession();
  supabase.auth.onAuthStateChange((_event, current) => {
    refreshProfileButton(current?.user?.user_metadata?.full_name || null);
  });

  if (!session) {
    refreshProfileButton(null);
    return;
  }

  const [{ data: regs, error }, { data: profile }] = await Promise.all([
    supabase
      .from('registrations')
      .select('cruise_id, cruises(id, title, starts_at, ends_at, port_name, port_address, contact_number)')
      .eq('user_id', session.user.id)
      .eq('status', 'registered'),
    supabase
      .from('profiles').select('full_name, nickname, avatar_url').eq('id', session.user.id).maybeSingle(),
  ]);

  const name = profile?.nickname || session.user.user_metadata?.full_name || profile?.full_name;
  refreshProfileButton(name, profile?.avatar_url || null);

  if (error || !regs) return;
  const cruises = regs.map((r) => r.cruises).filter(Boolean);
  const now = Date.now();

  // (a) Recently-ended cruises that still need feedback.
  const needsFeedback = cruises
    .filter((c) => { const e = cruiseEndMs(c); return e < now && now - e < 7 * DAY; })
    .filter((c) => localStorage.getItem('mc_fb_done_' + c.id) !== '1'
      && sessionStorage.getItem('mc_fb_later_' + c.id) !== '1')
    .sort((a, b) => cruiseEndMs(b) - cruiseEndMs(a));

  if (needsFeedback.length) {
    // Double-check the server in case localStorage was cleared on another device.
    try {
      const ids = needsFeedback.map((c) => c.id);
      const { data: done } = await supabase
        .from('feedback').select('cruise_id').eq('user_id', session.user.id).in('cruise_id', ids);
      const doneSet = new Set((done || []).map((f) => f.cruise_id));
      const pending = needsFeedback.filter((c) => !doneSet.has(c.id));
      if (pending.length) {
        setTimeout(() => showFeedbackModal(pending[0], session.user.id), 1200);
        return;
      }
    } catch {
      // feedback table not created yet, show it anyway; insert will fail gracefully.
      setTimeout(() => showFeedbackModal(needsFeedback[0], session.user.id), 1200);
      return;
    }
  }

  // (b) Otherwise, a boarding banner for an imminent cruise (within 36h, not over).
  const boarding = cruises
    .filter((c) => cruiseEndMs(c) > now && Date.parse(c.starts_at) - now < 36 * HOUR)
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  if (boarding.length) showBoardingBanner(boarding[0]);
}

/* ---------- Boot ---------- */

injectProfileButton();
initLangSwitcher();
declutterNav();
ensureWhatsAppFloat();
enhanceEmailLinks();
loadMemberState();
