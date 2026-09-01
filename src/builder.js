/* ==========================================================================
   BONJOUR CRUISE, booking wizard hero
   One smooth flow, one question at a time. Choose Private or Join a group,
   then a time, then the details (options or seats), then your info field by
   field (Enter to continue), and finally pay (group) or request a quote
   (private). A live boat and a running info sheet update at every step.
   ========================================================================== */

import { COUNTRIES } from './data.js';
import { supabase } from './supabase.js';
import { t, fmtAED, fmtDateTime, localeTag, LANG, langHref } from './i18n.js';

/* Real scheduled departures, loaded once from Supabase for the "Join a group"
   date step. Reading open cruises + the guest count is allowed for anon. */
let cruisesData = null; // array once loaded, [] if none, null while loading
async function loadCruises() {
  const nowIso = new Date().toISOString();
  const { data: cruises, error } = await supabase
    .from('cruises')
    .select('id, title, starts_at, port_name, age_band, capacity, price_per_seat, status')
    .eq('status', 'open')
    .gte('starts_at', nowIso)
    .order('starts_at');
  if (error || !cruises) return [];
  const counts = await Promise.all(cruises.map((c) =>
    supabase.rpc('cruise_guest_summary', { p_cruise_id: c.id })
      .then(({ data }) => Number(data?.[0]?.seat_count ?? 0))
      .catch(() => 0)));
  return cruises.map((c, i) => {
    const booked = counts[i];
    const remaining = c.capacity ? Math.max(0, c.capacity - booked) : 30;
    return { ...c, booked, remaining };
  });
}

const PRIVATE_BASE = 2200;
// Private charter boats by capacity. Prices are PLACEHOLDERS, Issam to confirm.
const BOATS = [
  { id: 'intimate', name: 'The Intimate', cap: 8, base: 2200, blurb: 'Up to 8 guests. A close circle, all to yourselves.' },
  { id: 'signature', name: 'The Signature', cap: 15, base: 3500, blurb: 'Up to 15 guests. Room to celebrate in style.' },
  { id: 'grand', name: 'The Grand', cap: 30, base: 6500, blurb: 'Up to 30 guests. For the big occasion.' },
];
const boatById = (id) => BOATS.find((b) => b.id === id);
const SEAT_PRICE = 380; // launch default, used only until a cruise sets its own price

const BOAT_SVG = ` <svg viewBox="0 0 640 380" class="boat-svg" role="img" aria-label="${t('Your Bonjour Cruise yacht')}">
  <g class="boat-stars">
    <circle cx="110" cy="70" r="2"/><circle cx="210" cy="116" r="1.6"/><circle cx="300" cy="58" r="2"/>
    <circle cx="400" cy="120" r="1.6"/><circle cx="470" cy="150" r="2"/><circle cx="360" cy="96" r="1.6"/>
    <circle cx="160" cy="140" r="1.4"/><circle cx="250" cy="90" r="1.4"/>
  </g>
  <circle class="boat-sun" cx="545" cy="78" r="46"/>
  <g class="boat-moon">
    <circle cx="545" cy="76" r="38" fill="#F3E7DC"/>
    <circle cx="533" cy="66" r="6" fill="#E4D2AE" opacity="0.7"/>
    <circle cx="557" cy="84" r="8" fill="#E4D2AE" opacity="0.6"/>
    <circle cx="552" cy="60" r="4" fill="#E4D2AE" opacity="0.6"/>
  </g>
  <!-- Bonjour Cruise is a mixed brand, not a women-only one. The floating
       hearts that used to sit here came from the Madame Cruise fork and read
       as feminine. Replaced by gulls, which stay festive and nautical without
       gendering the scene. Same positions, same opacities, same visual weight. -->
  <g class="boat-gulls" fill="none" stroke="#8A94A6" stroke-linecap="round" stroke-width="2.6">
    <path d="M472 156q7-8 14 0 7-8 14 0" opacity="0.7"/>
    <path d="M442 120q5-6 10 0 5-6 10 0" opacity="0.55"/>
    <path d="M500 194q4-5 8 0 4-5 8 0" opacity="0.5"/>
  </g>
  <path class="boat-water"  d="M0 312 q160 -24 320 0 t320 0 V380 H0 Z"/>
  <path class="boat-water boat-water2" d="M0 336 q160 -16 320 0 t320 0 V380 H0 Z"/>
  <g class="boat-body">
  <line class="boat-line" x1="150" y1="250" x2="150" y2="90"/>
  <!-- Was a heart-shaped masthead flag, inherited from the fork. Now a burgee,
       the pennant a yacht actually flies. Same anchor point, same footprint. -->
  <path class="boat-flag" d="M150 100 L186 111 L150 122 Z"/>
  <!-- bunting garland: little pennants from the mast to the cabin -->
  <g class="boat-bunting">
    <path d="M150 108 Q252 170 358 150" fill="none" stroke="rgba(28,43,74,0.35)" stroke-width="1.4"/>
    <path d="M169 121l12 1-5 15z" fill="#6E93A3"/>
    <path d="M199 138l12 1-5 15z" fill="#C9A86A"/>
    <path d="M229 148l12 1-5 15z" fill="#F3E7DC"/>
    <path d="M259 150l12 -1-5 15z" fill="#6E93A3"/>
    <path d="M289 145l12 -1-5 15z" fill="#C9A86A"/>
    <path d="M319 137l12 -1-5 15z" fill="#F3E7DC"/>
  </g>
  <path class="boat-hull" d="M70 250 H560 L520 312 Q310 338 110 312 Z"/>
  <path class="boat-hull-stripe" d="M70 250 H560 L553 262 H78 Z"/>
  <!-- scalloped valance under the deck -->
  <path class="boat-valance" d="M100 256 q12 14 24 0 t24 0 t24 0 t24 0 t24 0 t24 0 t24 0 t24 0 t24 0 t24 0 t24 0 t24 0 t24 0 t24 0 t24 0 t24 0 t24 0 L508 250 H100 Z" fill="#EAD7BC"/>
  <text class="boat-name" x="300" y="296" text-anchor="middle">BONJOUR CRUISE</text>
  <rect class="boat-deck" x="95" y="244" width="430" height="12" rx="6"/>
  <rect class="boat-cabin" x="320" y="186" width="180" height="60" rx="14"/>
  <g class="boat-portholes">
    <circle class="porthole-ring" cx="351" cy="212" r="14" fill="none" stroke="#C9A86A" stroke-width="2"/><circle class="boat-window" cx="351" cy="212" r="10"/>
    <circle class="porthole-ring" cx="391" cy="212" r="14" fill="none" stroke="#C9A86A" stroke-width="2"/><circle class="boat-window" cx="391" cy="212" r="10"/>
    <circle class="porthole-ring" cx="431" cy="212" r="14" fill="none" stroke="#C9A86A" stroke-width="2"/><circle class="boat-window" cx="431" cy="212" r="10"/>
    <circle class="porthole-ring" cx="471" cy="212" r="14" fill="none" stroke="#C9A86A" stroke-width="2"/><circle class="boat-window" cx="471" cy="212" r="10"/>
  </g>
  <rect class="boat-cabin" x="356" y="150" width="108" height="40" rx="12"/>
  <rect class="boat-glass" x="366" y="158" width="88" height="18" rx="6"/>
  <!-- Was a flower posy on the cabin roof, from the fork. Now a radar mast and
       navigation light: same silhouette on the roofline, read as a boat. -->
  <g class="boat-mast-kit" stroke="#8A94A6" stroke-width="2" stroke-linecap="round">
    <line x1="407" y1="150" x2="407" y2="136"/>
    <path d="M399 136q8-7 16 0" fill="none"/>
    <circle cx="407" cy="132" r="2.6" fill="#C9A86A" stroke="none"/>
  </g>
  <g class="boat-rail">
    <line x1="100" y1="244" x2="312" y2="244"/>
    <line x1="104" y1="244" x2="104" y2="226"/><line x1="140" y1="244" x2="140" y2="226"/>
    <line x1="176" y1="244" x2="176" y2="226"/><line x1="212" y1="244" x2="212" y2="226"/>
    <line x1="248" y1="244" x2="248" y2="226"/><line x1="284" y1="244" x2="284" y2="226"/>
    <line x1="100" y1="226" x2="308" y2="226"/>
  </g>
  <g data-layer></g>
  </g>
</svg>`;

const PRIVATE_OPTIONS = [
  { id: 'balloons', label: 'Balloon arch', price: 250,
    svg: `<g class="boat-pop" style="transform-origin:150px 244px">
      <path d="M108 244 Q150 120 210 188" fill="none" stroke="#6E93A3" stroke-width="2.5"/>
      <circle cx="112" cy="222" r="11" fill="#BBD1DA"/><circle cx="116" cy="196" r="11" fill="#6E93A3"/>
      <circle cx="126" cy="170" r="11" fill="#E4D2AE"/><circle cx="146" cy="150" r="11" fill="#BBD1DA"/>
      <circle cx="172" cy="148" r="11" fill="#C9A86A"/><circle cx="196" cy="164" r="11" fill="#6E93A3"/></g>` },
  { id: 'flowers', label: 'Fresh flowers', price: 600,
    svg: `<g class="boat-pop" style="transform-origin:290px 244px">
      <rect x="276" y="228" width="28" height="16" rx="3" fill="#C9A86A"/>
      <circle cx="282" cy="220" r="8" fill="#BBD1DA"/><circle cx="296" cy="216" r="8" fill="#6E93A3"/>
      <circle cx="303" cy="224" r="7" fill="#BBD1DA"/><circle cx="289" cy="225" r="6" fill="#E4D2AE"/></g>` },
  { id: 'cake', label: 'Celebration cake', price: 350,
    svg: `<g class="boat-pop" style="transform-origin:215px 244px">
      <rect x="200" y="234" width="30" height="10" rx="2" fill="#C9A86A"/>
      <rect x="205" y="214" width="20" height="20" rx="2" fill="#FFFFFF" stroke="#BBD1DA"/>
      <rect x="209" y="205" width="12" height="9" rx="2" fill="#E9F0F3" stroke="#BBD1DA"/>
      <line x1="215" y1="198" x2="215" y2="205" stroke="#C9A86A" stroke-width="2"/>
      <circle cx="215" cy="197" r="2.5" fill="#C9A86A"/></g>` },
  { id: 'spa', label: 'Spa & henna', price: 400, onRequest: true,
    svg: `<g class="boat-pop" style="transform-origin:255px 244px">
      <ellipse cx="255" cy="240" rx="18" ry="5" fill="#E4D2AE"/>
      <path d="M255 240 C246 222 250 214 255 210 C260 214 264 222 255 240 Z" fill="#BBD1DA"/>
      <path d="M255 240 C241 232 239 224 239 219 C246 220 255 228 255 240 Z" fill="#6E93A3" opacity="0.85"/>
      <path d="M255 240 C269 232 271 224 271 219 C264 220 255 228 255 240 Z" fill="#6E93A3" opacity="0.85"/></g>` },
  { id: 'mocktails', label: 'Mocktail bar', price: 300,
    svg: `<g class="boat-pop" style="transform-origin:470px 244px">
      <rect x="446" y="226" width="48" height="18" rx="3" fill="#C9A86A"/>
      <rect x="452" y="214" width="10" height="12" rx="2" fill="#FFFFFF" stroke="#BBD1DA"/>
      <rect x="468" y="214" width="10" height="12" rx="2" fill="#FFFFFF" stroke="#BBD1DA"/>
      <circle cx="457" cy="212" r="2.5" fill="#6E93A3"/><circle cx="473" cy="212" r="2.5" fill="#C9A86A"/></g>` },
  { id: 'dj', label: 'DJ', price: 1800, onRequest: true,
    svg: `<g class="boat-pop" style="transform-origin:410px 150px">
      <rect x="392" y="132" width="36" height="18" rx="2" fill="#1C2B4A"/>
      <circle cx="402" cy="141" r="5" fill="#BBD1DA"/><circle cx="418" cy="141" r="5" fill="#E4D2AE"/>
      <path d="M436 126 v-14 l7 -2 v14" fill="none" stroke="#C9A86A" stroke-width="2"/>
      <circle cx="435" cy="126" r="2.5" fill="#C9A86A"/><circle cx="442" cy="124" r="2.5" fill="#C9A86A"/></g>` },
  { id: 'photographer', label: 'Photographer', price: 1200, onRequest: true, svg: '' },
  { id: 'decor', label: 'Deck styling & signage', price: 500, svg: '' },
  { id: 'platters', label: 'Grazing platters', price: 900, svg: '' },
];

const OPTION_DETAIL = {
  balloons: { img: 'celebration', desc: 'A lush arch of balloons in your colours, framing the deck for the big entrance and the photos.' },
  flowers: { img: 'celebration', desc: 'Fresh seasonal florals styled across the table and lounge, in blush and cream or your own palette.' },
  cake: { img: 'celebration', desc: 'A custom halal celebration cake, made to your flavour and design, with a name on it if you like.' },
  spa: { img: 'henna-spa', desc: 'Henna, massage and skincare rituals by our therapists, a floating spa moment at sea.' },
  mocktails: { img: 'mocktails', desc: 'A bar of fresh, alcohol-free signature mocktails, mixed to order on board.' },
  dj: { img: 'day-cruise', desc: 'A DJ spinning your vibe so everyone can dance freely, all afternoon.' },
  photographer: { img: 'day-cruise', desc: 'A professional photographer for two hours. Every image is yours only, never used elsewhere.' },
  decor: { img: 'celebration', desc: 'Deck styling with florals, signage and the guest of honour seat, set up before you board.' },
  platters: { img: 'sunset-brunch', desc: 'Generous grazing platters, fruit and sweets, all halal, laid out as you sail.' },
};

const TSHIRT_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
function tshirtSelect(attrs, val) {
  return `<select class="wiz-field-input wiz-perk-input" ${attrs}>
    <option value="">${t('T-shirt size (optional)')}</option>
    ${TSHIRT_SIZES.map((s) => `<option value="${s}"${s === (val || '') ? ' selected' : ''}>${s}</option>`).join('')}
  </select>`;
}

const TIMES = [
  { id: 'morning', label: 'Morning', hours: '8:00 to 12:00' },
  { id: 'afternoon', label: 'Afternoon', hours: '13:00 to 17:00' },
  { id: 'evening', label: 'Evening', hours: '18:00 to 22:00' },
];

// The details step: one question at a time. Enter or Next advances.
const DETAIL_FIELDS = [
  { key: 'first', q: 'What is your first name?', short: 'Name', type: 'text', required: true, autocomplete: 'given-name' },
  { key: 'last', q: 'And your last name?', short: 'Last name', type: 'text', required: false, autocomplete: 'family-name' },
  { key: 'email', q: 'Your email?', short: 'Email', type: 'email', required: true, autocomplete: 'email', placeholder: 'you@email.com' },
  { key: 'whatsapp', q: 'Your WhatsApp number?', short: 'WhatsApp', type: 'tel', required: true, autocomplete: 'tel', placeholder: '+971 5X XXX XXXX' },
  { key: 'nationality', q: 'Where are you from?', short: 'Nationality', type: 'country', required: false },
  { key: 'dob', q: 'Your date of birth?', short: 'Born', type: 'date', required: false },
];

const FLOW = {
  group: ['type', 'date', 'seats', 'details'],
  private: ['type', 'boat', 'date', 'options', 'details'],
};
const CHARTER_DEPOSIT = 1000; // AED, placeholder, matches CHARTER_DEPOSIT_AED in the edge function
const SCREEN_LABEL = { type: 'Type', boat: 'Boat', time: 'Time', date: 'Date', seats: 'Seats', options: 'Options', details: 'You' };

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}
function esc(value) {
  return String(value ?? '')
    .replace(/\s*[—–]\s*/g, ', ')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function fmtCruiseDate(iso) {
  return fmtDateTime(iso, {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dubai',
  });
}
// Map a departure hour to our morning/afternoon/evening tint, so the scene still
// changes colour once the guest picks a real date.
function timeOfDay(iso) {
  try {
    const h = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Asia/Dubai' }).format(new Date(iso)));
    if (h < 12) return 'morning';
    if (h < 17) return 'afternoon';
    return 'evening';
  } catch { return 'afternoon'; }
}
function flagEmoji(code) {
  return code.toUpperCase().replace(/./g, (ch) => String.fromCodePoint(127397 + ch.charCodeAt(0)));
}
function ageFrom(dob) {
  if (!dob) return '';
  const [y, m, d] = dob.split('-').map(Number);
  if (!y || !m || !d) return '';
  const t = new Date();
  let a = t.getFullYear() - y;
  if (t.getMonth() + 1 < m || (t.getMonth() + 1 === m && t.getDate() < d)) a -= 1;
  return a > 0 && a < 120 ? String(a) : '';
}

const GUEST_LOOKS = [
  { skin: '#F0D7B8', hair: '#2B2F3A', dress: '#6E93A3' },
  { skin: '#C98F66', veil: '#6E93A3', dress: '#BBD1DA' },
  { skin: '#E8C9A0', hair: '#D9A441', dress: '#C9A86A' },
  { skin: '#7A4B30', hair: '#16110F', dress: '#E4D2AE' },
  { skin: '#F0D7B8', veil: '#E4D2AE', dress: '#6E93A3' },
  { skin: '#DDA876', hair: '#A23E1C', dress: '#BBD1DA' },
  { skin: '#C98F66', hair: '#3A2A22', dress: '#C9A86A' },
  { skin: '#E8C9A0', veil: '#7E6FA6', dress: '#BBD1DA' },
];
function guestSvg(x, i) {
  const s = GUEST_LOOKS[i % GUEST_LOOKS.length];
  const o = (i % 2) * 6;
  const base = 244 - o;
  const head = base - 44;
  const dress = `<path d="M${x - 13} ${base} Q${x} ${base - 34} ${x + 13} ${base} Z" fill="${s.dress}"/>`;
  const neck = `<rect x="${x - 2.5}" y="${head + 9}" width="5" height="9" fill="${s.skin}"/>`;
  const face = `<circle cx="${x}" cy="${head}" r="9" fill="${s.skin}"/>`;
  const arm = `<path d="M${x + 10} ${base - 26} q9 -3 8 -16" fill="none" stroke="${s.skin}" stroke-width="4" stroke-linecap="round"/>`;
  let topLayers;
  if (s.veil) {
    const drape = `<path d="M${x - 12} ${head + 1} Q${x - 15} ${base - 12} ${x - 8} ${base - 2} L${x + 8} ${base - 2} Q${x + 15} ${base - 12} ${x + 12} ${head + 1} Z" fill="${s.veil}"/>`;
    const hood = `<path d="M${x - 10} ${head + 3} A10 11 0 0 1 ${x + 10} ${head + 3} Q${x} ${head} ${x - 10} ${head + 3} Z" fill="${s.veil}"/>`;
    topLayers = `${drape}${dress}${neck}${face}${hood}${arm}`;
  } else {
    const hairCap = `<path d="M${x - 9} ${head + 1} a9 9 0 0 1 18 0 q-9 -7 -18 0 Z" fill="${s.hair}"/>`;
    const hairSides = `<path d="M${x - 9} ${head} q-2 16 1 24 M${x + 9} ${head} q2 16 -1 24" stroke="${s.hair}" stroke-width="3.5" fill="none" stroke-linecap="round"/>`;
    topLayers = `${dress}${neck}${face}${hairCap}${hairSides}${arm}`;
  }
  return `<g class="boat-pop" style="transform-origin:${x}px ${base}px">${topLayers}</g>`;
}

function init() {
  const root = document.querySelector('[data-wizard]');
  if (!root) return;

  const state = { screenIdx: 0, mode: null, boat: null, chosen: new Set(), seats: null, time: null, cruise: null, charterDate: '',
    details: { first: '', last: '', email: '', whatsapp: '', nationality: '', dob: '', nickname: '', tshirt: '', shareConnect: false, notify: true, createAccount: false, terms: false, companions: [] },
    detailIdx: 0, sent: false, paying: false, payError: '', ageError: false, user: null, profile: null };
  const signedIn = () => !!state.user;
  // Seats a group booking may still take on the chosen departure (30 before one is picked).
  const seatsMax = () => Math.max(1, Math.min(30, state.cruise ? state.cruise.remaining : 30));
  // Per-seat price: the real price of the chosen cruise, else the launch default.
  const seatPrice = () => Number(state.cruise?.price_per_seat) || SEAT_PRICE;
  // Effective seat count for the illustration/price before the guest has picked one.
  const seatCount = () => state.seats || 1;

  root.innerHTML = `
    <div class="wiz">
      <div class="wiz-stage">
        <div class="wiz-progress" data-progress></div>
        <div class="wiz-boat" data-boat>${BOAT_SVG}</div>
        <div class="wiz-body" data-body></div>
      </div>
      <aside class="wiz-recap" data-recap></aside>
    </div>`;

  const boatWrap = root.querySelector('[data-boat]');
  const body = root.querySelector('[data-body]');
  const recap = root.querySelector('[data-recap]');
  const progress = root.querySelector('[data-progress]');
  const layer = () => boatWrap.querySelector('[data-layer]');

  const screens = () => (state.mode ? FLOW[state.mode] : ['type']);
  const screen = () => screens()[state.screenIdx];

  const chosenList = () => PRIVATE_OPTIONS.filter((o) => state.chosen.has(o.id));
  const price = () => {
    if (state.mode === 'private') return (boatById(state.boat)?.base ?? PRIVATE_BASE) + chosenList().reduce((s, o) => s + (o.onRequest ? 0 : o.price), 0);
    if (state.mode === 'group') return seatCount() * seatPrice();
    return 0;
  };

  const applyTime = () => {
    root.classList.remove('is-morning', 'is-afternoon', 'is-evening');
    if (state.time) root.classList.add('is-' + state.time);
  };
  const renderLayer = () => {
    const l = layer();
    if (!l) return;
    if (state.mode === 'private') l.innerHTML = chosenList().filter((o) => o.svg).map((o) => o.svg).join('');
    else if (state.mode === 'group') {
      let g = '';
      for (let i = 0; i < Math.min(seatCount(), 6); i += 1) g += guestSvg(110 + i * 26, i);
      l.innerHTML = g;
    } else l.innerHTML = '';
  };

  function showOptionDetail(id) {
    const opt = PRIVATE_OPTIONS.find((o) => o.id === id);
    const info = OPTION_DETAIL[id] || {};
    if (!opt) return;
    document.querySelector('.mc-modal')?.remove();
    const media = info.img
      ? `<div class="extra-img" style="background-image:url('/assets/img/${info.img}.webp');"></div>`
      : '<div class="extra-img extra-img--ph">&#9875;</div>';
    const modal = el(`
      <div class="mc-modal" role="dialog" aria-modal="true">
        <div class="mc-modal-backdrop" data-close></div>
        <div class="mc-modal-card extra-card">
          <button class="mc-modal-close" type="button" aria-label="${t('Close')}" data-close>&#10005;</button>
          ${media}
          <span class="eyebrow">+${fmtAED(opt.price)}</span>
          <h2 class="extra-title">${esc(t(opt.label))}</h2>
          <p class="extra-desc">${esc(info.desc ? t(info.desc) : '')}</p>
          <div class="extra-actions">
            <button type="button" class="btn btn-primary" data-add>${t('Add to my cruise')}</button>
            <button type="button" class="extra-skip" data-close>${t('Maybe not')}</button>
          </div>
        </div>
      </div>`);
    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => modal.classList.add('is-open'));
    const close = () => { modal.classList.remove('is-open'); document.body.style.overflow = ''; setTimeout(() => modal.remove(), 300); };
    modal.querySelectorAll('[data-close]').forEach((n) => n.addEventListener('click', close));
    modal.querySelector('[data-add]').addEventListener('click', () => { state.chosen.add(id); renderLayer(); render(); close(); });
  }

  // ----- screen bodies -----
  function detailInput(f, v) {
    if (f.type === 'country') {
      // Name first so keyboard type-ahead works (press "B" -> Bahamas); flag trails.
      return `<select class="wiz-field-input" data-field autocomplete="country-name">
        <option value="">${t('Select your country')}</option>
        ${COUNTRIES.map((c) => `<option value="${esc(c.name)}"${c.name === v ? ' selected' : ''}>${esc(c.name)}  ${flagEmoji(c.code)}</option>`).join('')}
      </select>`;
    }
    if (f.type === 'date') {
      // Explicit Day / Month / Year, in that order, so the format is never
      // ambiguous and never depends on the browser locale.
      const [yy = '', mm = '', dd = ''] = String(v || '').split('-');
      const nowY = new Date().getFullYear();
      const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
      const opt = (val, label, sel) => `<option value="${val}"${val === sel ? ' selected' : ''}>${label}</option>`;
      const days = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0'));
      const years = [];
      for (let y = nowY; y >= nowY - 100; y -= 1) years.push(String(y));
      return `<div class="wiz-dob" data-field-group>
        <select class="wiz-dob-sel" data-dob-day aria-label="${t('Day')}"><option value="">${t('Day')}</option>${days.map((d) => opt(d, t(String(Number(d))), dd)).join('')}</select>
        <select class="wiz-dob-sel" data-dob-month aria-label="${t('Month')}"><option value="">${t('Month')}</option>${MONTHS.map((m, i) => opt(String(i + 1).padStart(2, '0'), t(m), mm)).join('')}</select>
        <select class="wiz-dob-sel" data-dob-year aria-label="${t('Year')}"><option value="">${t('Year')}</option>${years.map((y) => opt(y, t(y), yy)).join('')}</select>
      </div>`;
    }
    return `<input class="wiz-field-input" type="${f.type}" value="${esc(v)}" ${f.placeholder ? `placeholder="${f.placeholder}"` : ''} autocomplete="${f.autocomplete || 'off'}" data-field />`;
  }

  // Group booking of 2+ seats: collect each friend so they get the cruise
  // details + a link to create their account, and Issam captures every contact.
  function companionCount() { return state.mode === 'group' && state.cruise ? Math.max(0, seatCount() - 1) : 0; }
  // A little perks block: nickname + tee size, framed as an optional gift.
  function leadPerks() {
    const d = state.details;
    return `
      <div class="wiz-perks">
        <p class="wiz-perks-lead">${t('A little extra')} 🎁</p>
        <p class="form-note">${t('We sometimes surprise our guests with a gift, like a tee with your nickname on the back. It is optional, and always yours to keep private.')}</p>
        <input class="wiz-field-input wiz-perk-input" data-nickname value="${esc(d.nickname)}" placeholder="${t('Your nickname (optional)')}" autocomplete="off" />
        ${tshirtSelect('data-tshirt', d.tshirt)}
      </div>`;
  }
  function companionBlock() {
    const n = companionCount();
    if (!n) return '';
    while (state.details.companions.length < n) state.details.companions.push({ first: '', email: '', whatsapp: '', nickname: '', tshirt: '' });
    state.details.companions.length = n;
    // When the member is signed in, Guest 1 is them (read-only), then Guest 2, 3 below.
    const you = signedIn()
      ? `<div class="wiz-companion wiz-companion--you">
           <p class="wiz-companion-title">${t('Guest 1 · you')}</p>
           <p class="wiz-companion-you">${esc(state.details.nickname || `${state.details.first} ${state.details.last}`.trim() || t('You'))}</p>
         </div>`
      : '';
    const rows = state.details.companions.map((c, i) => `
      <div class="wiz-companion" data-comp="${i}">
        <p class="wiz-companion-title">${t('Guest {n}', { n: i + 2 })}</p>
        <input class="wiz-field-input wiz-comp-input" data-comp-first="${i}" value="${esc(c.first)}" placeholder="${t('First name')}" autocomplete="off" />
        <input class="wiz-field-input wiz-comp-input" data-comp-email="${i}" value="${esc(c.email)}" placeholder="${t('Email')}" type="email" autocomplete="off" />
        <input class="wiz-field-input wiz-comp-input" data-comp-wa="${i}" value="${esc(c.whatsapp)}" placeholder="${t('WhatsApp (optional)')}" type="tel" autocomplete="off" />
        <input class="wiz-field-input wiz-comp-input" data-comp-nick="${i}" value="${esc(c.nickname)}" placeholder="${t('Nickname (optional)')}" autocomplete="off" />
        ${tshirtSelect(`data-comp-tshirt="${i}"`, c.tshirt)}
      </div>`).join('');
    return `
      <div class="wiz-companions">
        <p class="wiz-companions-lead">${t('Who is in your circle?')}</p>
        <p class="form-note">${t('You booked {seats} seats. Add your {n} {guests} so each one gets the cruise details, a chance at a gift, and can create their own account.', { seats: seatCount(), n, guests: n === 1 ? t('guest') : t('guests') })}</p>
        ${you}
        ${rows}
        ${state.compError ? `<p class="form-status error" role="alert">${t('Please add a first name and a valid email for every guest.')}</p>` : ''}
      </div>`;
  }

  // Payment failure is the single most expensive moment to lose a guest, so the
  // error block always carries a pre-filled WhatsApp thread out. role="alert"
  // makes screen readers announce it as soon as it appears.
  const WHATSAPP_PAY_HELP =
    'https://wa.me/971585986118?text=' +
    encodeURIComponent('Hello Bonjour Cruise, I could not complete my booking on the site. Can you help me finish it?');

  function payErrorBlock() {
    return `
      <p class="form-status error" role="alert">${esc(state.payError)}
        <a href="${WHATSAPP_PAY_HELP}" rel="noopener">${t('Finish your booking on WhatsApp')}</a>
      </p>`;
  }

  // The final action button(s): private gets pay-deposit + send-request; group
  // gets a single reserve/keep-me-posted button.
  function payActions() {
    if (state.mode === 'private') {
      const primary = state.paying ? t('Going to payment…') : t('Lock my date · deposit {price}', { price: fmtAED(CHARTER_DEPOSIT) });
      return `
        <div class="wiz-pay-actions">
          <button type="button" class="btn btn-primary wiz-next" data-fnext data-action="deposit" ${state.paying ? 'disabled' : ''}>${primary}</button>
          <button type="button" class="btn-text wiz-request" data-fnext data-action="request">${t('Or send a request instead')}</button>
        </div>`;
    }
    const groupNotify = state.mode === 'group' && !state.cruise;
    let label;
    if (state.paying) label = t('Going to payment…');
    else if (groupNotify) label = t('Keep me posted');
    else label = t('Reserve & pay {price}', { price: fmtAED(price()) });
    return `<div class="wiz-field-nav"><button type="button" class="btn btn-primary wiz-next" data-fnext ${state.paying ? 'disabled' : ''}>${label}</button></div>`;
  }

  // Members skip re-typing everything: one confirm-and-pay screen.
  function signedInConfirmBody() {
    const d = state.details;
    const displayName = d.nickname || d.first || (state.user.email || '').split('@')[0];
    const groupNotify = state.mode === 'group' && !state.cruise;
    let payLabel;
    if (state.paying) payLabel = t('Going to payment…');
    else if (groupNotify) payLabel = t('Keep me posted');
    else if (state.mode === 'group') payLabel = t('Reserve & pay {price}', { price: fmtAED(price()) });
    else payLabel = t('Send my request');
    return `
      <div class="wiz-field">
        <div class="wiz-signed">
          <p class="wiz-signed-hi">${t('Booking as {name}', { name: `<strong>${esc(displayName)}</strong>` })} ⚓</p>
          <p class="form-note">${esc(state.user.email)}. ${t('Everything is on file, just confirm below.')}</p>
        </div>
        ${leadPerks()}
        ${companionBlock()}
        <div class="wiz-optins">
          <label class="wiz-optin">
            <input type="checkbox" data-share ${d.shareConnect ? 'checked' : ''} />
            <span>${t('Happy to connect with the other guests aboard. They may see your nickname or first name, never your contact.')}</span>
          </label>
          <label class="wiz-optin">
            <input type="checkbox" data-notify ${d.notify ? 'checked' : ''} />
            <span>${t('Keep me posted when another guest joins this cruise.')}</span>
          </label>
          <label class="wiz-optin wiz-optin-terms">
            <input type="checkbox" data-terms ${d.terms ? 'checked' : ''} />
            <span>${t('I accept the {terms} and {privacy}. I confirm I am 18 or older.', { terms: `<a href="${langHref('/terms.html')}" target="_blank" rel="noopener">${t('terms of sale')}</a>`, privacy: `<a href="${langHref('/privacy-policy.html')}" target="_blank" rel="noopener">${t('privacy policy')}</a>` })} <span class="req">*</span></span>
          </label>
        </div>
        ${state.payError ? payErrorBlock() : ''}
        ${payActions()}
        <p class="form-note wiz-field-hint">${groupNotify ? t('We will message you the moment a date opens.') : state.mode === 'private' ? t('Secure deposit by Stripe. We confirm your charter, then the balance.') : t('Secure payment by Stripe. Free date change up to 7 days before.')}</p>
      </div>`;
  }

  function detailsBody() {
    if (state.sent) {
      return `<div class="wiz-done">
        <span class="wiz-done-mark">✓</span>
        <h3>${t('Your request is in.')}</h3>
        <p>${t('We will send your tailored quote and confirm your date very soon, on WhatsApp or by email.')}</p>
      </div>`;
    }
    if (signedIn()) return signedInConfirmBody();
    const f = DETAIL_FIELDS[state.detailIdx];
    const v = state.details[f.key] || '';
    const isLast = state.detailIdx === DETAIL_FIELDS.length - 1;
    const groupNotify = state.mode === 'group' && !state.cruise; // no open date: notify, do not pay
    let nextLabel;
    if (!isLast) nextLabel = t('Next');
    else if (state.paying) nextLabel = t('Going to payment…');
    else if (groupNotify) nextLabel = t('Keep me posted');
    else if (state.mode === 'group') nextLabel = t('Reserve & pay {price}', { price: fmtAED(price()) });
    else nextLabel = t('Send my request');
    const intro = state.detailIdx === 0
      ? `<p class="form-note wiz-guest-note">${t('Continue as a guest, or {link}.', { link: `<a href="${langHref('/account.html')}">${t('sign in / create an account')}</a>` })}</p>`
      : '';
    const optIn = isLast
      ? `<div class="wiz-optins">
           <label class="wiz-optin">
             <input type="checkbox" data-share ${state.details.shareConnect ? 'checked' : ''} />
             <span>${t('Happy to connect with the other guests aboard. They may see your nickname or first name, never your contact.')}</span>
           </label>
           <label class="wiz-optin">
             <input type="checkbox" data-notify ${state.details.notify ? 'checked' : ''} />
             <span>${t('Keep me posted when another guest joins this cruise.')}</span>
           </label>
           <p class="wiz-account-note">⚓ ${t('We create your Bonjour Cruise account from these details, so you can manage your booking, see who is aboard and add your photo. You set your password right after payment.')}</p>
           <label class="wiz-optin wiz-optin-terms">
             <input type="checkbox" data-terms ${state.details.terms ? 'checked' : ''} />
             <span>${t('I accept the {terms} and {privacy}. I confirm I am 18 or older.', { terms: `<a href="${langHref('/terms.html')}" target="_blank" rel="noopener">${t('terms of sale')}</a>`, privacy: `<a href="${langHref('/privacy-policy.html')}" target="_blank" rel="noopener">${t('privacy policy')}</a>` })} <span class="req">*</span></span>
           </label>
           ${state.ageError ? `<p class="form-status error" role="alert">${t('Guests must be 18 or older to book.')}</p>` : ''}
         </div>`
      : '';
    return `
      ${intro}
      <div class="wiz-field">
        <p class="wiz-field-q">${esc(t(f.q))}${f.required ? ' <span class="req">*</span>' : ''}</p>
        ${detailInput(f, v)}
        ${isLast ? leadPerks() : ''}
        ${isLast ? companionBlock() : ''}
        ${optIn}
        ${state.payError ? payErrorBlock() : ''}
        ${isLast ? payActions() : `<div class="wiz-field-nav"><button type="button" class="btn btn-primary wiz-next" data-fnext ${state.paying ? 'disabled' : ''}>${nextLabel}</button></div>`}
        <p class="form-note wiz-field-hint">${isLast && !groupNotify ? t('Secure payment by Stripe. Free date change up to 7 days before.') : t('Press Enter to continue')}</p>
      </div>`;
  }

  function bodyFor(s) {
    if (s === 'type') {
      return `
        <p class="wiz-q">${t('How would you like to sail?')}</p>
        <div class="wiz-choices">
          <button type="button" class="wiz-choice" data-mode="group">
            <span class="wiz-choice-emoji">🥂</span><strong>${t('Join a group')}</strong>
            <span>${t('Come solo and sail among the group. You pay only for your seat.')}</span>
          </button>
          <button type="button" class="wiz-choice" data-mode="private">
            <span class="wiz-choice-emoji">🛥️</span><strong>${t('Private boat')}</strong>
            <span>${t('The whole yacht for your circle. Your sea, your rules, your rhythm.')}</span>
          </button>
        </div>`;
    }
    if (s === 'boat') {
      return `
        <p class="wiz-q">${t('Which boat suits your circle?')}</p>
        <div class="boat-choices">
          ${BOATS.map((b) => `
            <button type="button" class="boat-card${b.id === state.boat ? ' is-on' : ''}" data-boatpick="${b.id}">
              <span class="boat-cap">${b.cap}</span>
              <strong>${t(b.name)}</strong>
              <span class="boat-blurb">${t(b.blurb)}</span>
              <span class="boat-from">${t('from')} ${fmtAED(b.base)}</span>
            </button>`).join('')}
        </div>
        <p class="form-note">${t('Up to that many guests. You choose everything else next.')}</p>`;
    }
    if (s === 'time') {
      return `
        <p class="wiz-q">${t('When shall we set sail?')}</p>
        <div class="time-slots">
          ${TIMES.map((slot) => `
            <button type="button" class="time-slot${slot.id === state.time ? ' is-on' : ''}" data-timeslot="${slot.id}">
              <strong>${t(slot.label)}</strong><span>${slot.hours}</span>
            </button>`).join('')}
        </div>`;
    }
    if (s === 'date') {
      // Private charter: the guest picks any free date (no fixed schedule). Day / Month
      // / Year selects so the format is always DD/MM/YYYY, never US mm/dd/yyyy.
      if (state.mode === 'private') {
        const now = new Date();
        const y0 = now.getFullYear();
        const [yy = '', mm = '', dd = ''] = String(state.charterDate || '').split('-');
        const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
          'July', 'August', 'September', 'October', 'November', 'December'];
        const opt = (val, label, sel) => `<option value="${val}"${val === sel ? ' selected' : ''}>${label}</option>`;
        const days = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0'));
        const years = [];
        for (let y = y0; y <= y0 + 2; y += 1) years.push(String(y));
        return `
          <p class="wiz-q">${t('When would you like the yacht?')}</p>
          <div class="wiz-dob charter-dmy" data-charter-group>
            <select class="wiz-dob-sel" data-cdate-day aria-label="${t('Day')}"><option value="">${t('Day')}</option>${days.map((d) => opt(d, t(String(Number(d))), dd)).join('')}</select>
            <select class="wiz-dob-sel" data-cdate-month aria-label="${t('Month')}"><option value="">${t('Month')}</option>${MONTHS.map((m, i) => opt(String(i + 1).padStart(2, '0'), t(m), mm)).join('')}</select>
            <select class="wiz-dob-sel" data-cdate-year aria-label="${t('Year')}"><option value="">${t('Year')}</option>${years.map((y) => opt(y, t(y), yy)).join('')}</select>
          </div>
          <p class="form-note">${t('Pick any date (day / month / year) that suits your circle. On the last step you can lock it with a deposit, or send a request.')}</p>
          <div class="wiz-field-nav"><button type="button" class="btn btn-primary wiz-next" data-charternext ${state.charterDate ? '' : 'disabled'}>${t('Continue')}</button></div>`;
      }
      if (cruisesData === null) {
        return `<p class="wiz-q">${t('Pick your date')}</p><p class="form-note" data-dates-loading>${t('Finding the next departures…')}</p>`;
      }
      if (!cruisesData.length) {
        return `
          <p class="wiz-q">${t('No date open just yet')}</p>
          <p class="form-note">${t('New shared departures are added all the time. Leave your details on the next step and we will message you the moment the next date opens, so you get a seat first.')}</p>
          <div class="wiz-field-nav"><button type="button" class="btn btn-primary wiz-next" data-notifynext>${t('Keep me posted')}</button></div>`;
      }
      return `
        <p class="wiz-q">${t('Pick your date')}</p>
        <div class="date-list">
          ${cruisesData.map((c) => {
            const full = c.remaining <= 0;
            const left = c.capacity ? t('{n} of {cap} seats left', { n: c.remaining, cap: c.capacity }) : t('Seats available');
            return `
            <button type="button" class="date-card${c.id === state.cruise?.id ? ' is-on' : ''}${full ? ' is-full' : ''}" data-datepick="${c.id}"${full ? ' disabled aria-disabled="true"' : ''}>
              <span class="date-when">${esc(fmtCruiseDate(c.starts_at))}</span>
              <span class="date-title">${esc(c.title)}</span>
              <span class="date-meta">${esc(c.port_name || 'Dubai Marina')}</span>
              <span class="date-seats${full ? ' is-full' : c.remaining <= 3 ? ' is-low' : ''}">${full ? t('Fully booked') : esc(left)}${c.booked > 0 && !full ? ` · ${t('{n} aboard', { n: c.booked })}` : ''}</span>
            </button>`;
          }).join('')}
        </div>
        <p class="form-note">${t('Every date is a real shared departure. You pay only for your own seats and sail with the other guests aboard.')}</p>`;
    }
    if (s === 'seats') {
      const left = state.cruise && state.cruise.capacity
        ? (state.cruise.remaining === 1
            ? t('{n} seat is left on this date. ', { n: state.cruise.remaining })
            : t('{n} seats are left on this date. ', { n: state.cruise.remaining }))
        : '';
      return `
        <p class="wiz-q">${t('How many guests aboard?')}</p>
        <div class="seat-counter">
          <button type="button" class="seat-step" data-seatstep="-1" aria-label="${t('One fewer')}">&minus;</button>
          <span class="seat-count" data-seatcount aria-live="polite">${seatCount()}</span>
          <button type="button" class="seat-step" data-seatstep="1" aria-label="${t('One more')}">+</button>
        </div>
        <p class="form-note">${left}${t('Come solo or bring your circle. Each seat is {price}, and you sail with the other guests aboard.', { price: fmtAED(seatPrice()) })}</p>
        <div class="wiz-field-nav"><button type="button" class="btn btn-primary wiz-next" data-seatnext>${t('Continue')}</button></div>`;
    }
    if (s === 'options') {
      return `
        <p class="wiz-q">${t('Dress up your yacht')}</p>
        <div class="opt-list">
          ${PRIVATE_OPTIONS.map((o) => `
            <div class="opt-card${state.chosen.has(o.id) ? ' is-on' : ''}" data-opt="${o.id}" role="button" tabindex="0" aria-pressed="${state.chosen.has(o.id)}" aria-label="${esc(t(o.label))}${o.onRequest ? `, ${t('on request')}` : `, ${t('plus {price}', { price: fmtAED(o.price) })}`}">
              <span class="opt-check" aria-hidden="true"></span>
              <span class="opt-name">${t(o.label)}</span>
              <span class="opt-price${o.onRequest ? ' opt-request' : ''}">${o.onRequest ? t('On request') : `+${fmtAED(o.price)}`}</span>
              <button type="button" class="opt-details" data-details="${o.id}">${t('details')}</button>
            </div>`).join('')}
        </div>
        <p class="form-note">${t('Optional. Add as many as you like. Items marked on request depend on last-minute availability, we confirm those and the final quote before you pay.')}</p>
        <div class="wiz-field-nav"><button type="button" class="btn btn-primary wiz-next" data-optnext>${t('Continue')}</button></div>`;
    }
    if (s === 'details') return detailsBody();
    return '';
  }

  // ----- field navigation -----
  const emailOk = (v) => /.+@.+\..+/.test(v);
  function fieldValid(f) {
    if (!f.required) return true;
    const v = (state.details[f.key] || '').trim();
    if (f.key === 'email') return emailOk(v);
    return !!v;
  }
  // Final checks shared by the guest flow and the signed-in confirm screen.
  // action: 'deposit' | 'request' | undefined (defaults to pay).
  function finalizeBooking(action) {
    // Every guest in the circle needs a first name + a valid email.
    if (companionCount() > 0) {
      const comps = state.details.companions || [];
      const bad = comps.slice(0, companionCount()).some((c) => !(c.first || '').trim() || !emailOk((c.email || '').trim()));
      if (bad) { state.compError = true; render(); return; }
    }
    // Terms required before we take money. Not for the "keep me posted" path,
    // nor for a private "send a request" (no sale yet, just a quote request).
    const groupNotify = state.mode === 'group' && !state.cruise;
    const noSaleYet = groupNotify || (state.mode === 'private' && action === 'request');
    if (!noSaleYet && !state.details.terms) {
      root.querySelector('.wiz-optin-terms')?.classList.add('is-error');
      return;
    }
    submit(action);
  }
  function nextField(action) {
    // Signed-in members confirm + pay in one step, no field-by-field walk.
    if (screen() === 'details' && signedIn()) { finalizeBooking(action); return; }
    const f = DETAIL_FIELDS[state.detailIdx];
    if (!fieldValid(f)) { root.querySelector('.wiz-field-input')?.classList.add('is-error'); return; }
    if (state.detailIdx === DETAIL_FIELDS.length - 1) {
      // Age gate: if the guest gave a date of birth, they must be 18 or older.
      const age = ageFrom(state.details.dob);
      if (age !== null && age !== '' && Number(age) < 18) {
        state.ageError = true; render(); focusField();
        return;
      }
      finalizeBooking(action);
      return;
    }
    state.detailIdx += 1;
    render(); focusField();
  }
  // One back control for every step: step back a field on the details screen,
  // otherwise step back a screen (e.g. group picked by mistake -> back to type).
  function goBack() {
    if (screen() === 'details' && !state.sent && state.detailIdx > 0) {
      state.detailIdx -= 1; render(); focusField(); return;
    }
    if (state.screenIdx > 0) {
      state.screenIdx = Math.max(0, state.screenIdx - 1);
      state.detailIdx = 0;
      render();
    }
  }
  function focusField() {
    requestAnimationFrame(() => { const i = root.querySelector('.wiz-field-input, .wiz-dob-sel'); if (i) i.focus(); });
  }

  function advance() { state.screenIdx += 1; render(); }

  function bindBody() {
    body.querySelectorAll('[data-mode]').forEach((btn) => btn.addEventListener('click', () => {
      state.mode = btn.dataset.mode; state.chosen.clear(); state.seats = null; state.boat = null; state.cruise = null; state.time = null; state.screenIdx = 1; state.detailIdx = 0;
      // Kick off loading the real departures the moment the guest picks "Join a group".
      if (state.mode === 'group' && cruisesData === null) {
        loadCruises().then((list) => { cruisesData = list; if (screen() === 'date') render(); });
      }
      render();
    }));
    // Group: pick a real scheduled departure, which sets its date, time and price.
    body.querySelectorAll('[data-datepick]').forEach((btn) => btn.addEventListener('click', () => {
      const c = (cruisesData || []).find((x) => x.id === btn.dataset.datepick);
      if (!c || c.remaining <= 0) return;
      state.cruise = c;
      state.time = timeOfDay(c.starts_at);
      state.seats = Math.min(state.seats || 1, seatsMax());
      applyTime();
      advance();
    }));
    // Private charter: Day / Month / Year selects (always DD/MM/YYYY).
    const cGroup = body.querySelector('[data-charter-group]');
    if (cGroup) {
      const cd = cGroup.querySelector('[data-cdate-day]');
      const cm = cGroup.querySelector('[data-cdate-month]');
      const cy = cGroup.querySelector('[data-cdate-year]');
      const csync = () => {
        state.charterDate = (cd.value && cm.value && cy.value) ? `${cy.value}-${cm.value}-${cd.value}` : '';
        const next = body.querySelector('[data-charternext]');
        if (next) next.disabled = !state.charterDate;
        renderRecap();
      };
      [cd, cm, cy].forEach((s) => s.addEventListener('change', csync));
    }
    body.querySelector('[data-charternext]')?.addEventListener('click', () => { if (state.charterDate) advance(); });
    // No date open yet: skip the seats step and go straight to their details so we
    // can notify them when a date opens (there is nothing to price without a cruise).
    body.querySelector('[data-notifynext]')?.addEventListener('click', () => {
      const idx = screens().indexOf('details');
      state.screenIdx = idx >= 0 ? idx : state.screenIdx + 1;
      state.detailIdx = 0;
      render(); focusField();
    });
    // Private: pick a boat by capacity, then move on.
    body.querySelectorAll('[data-boatpick]').forEach((btn) => btn.addEventListener('click', () => {
      state.boat = btn.dataset.boatpick; advance();
    }));
    // Seats: a gentle counter, up to 30, then Continue.
    body.querySelectorAll('[data-seatstep]').forEach((btn) => btn.addEventListener('click', () => {
      state.seats = Math.max(1, Math.min(seatsMax(), (state.seats || 1) + Number(btn.dataset.seatstep)));
      const c = body.querySelector('[data-seatcount]'); if (c) c.textContent = state.seats;
      renderLayer(); renderRecap();
    }));
    body.querySelector('[data-seatnext]')?.addEventListener('click', () => {
      if (!state.seats) state.seats = 1; advance();
    });
    body.querySelectorAll('.opt-card').forEach((card) => {
      const id = card.dataset.opt;
      const toggle = () => {
        if (state.chosen.has(id)) state.chosen.delete(id); else state.chosen.add(id);
        renderLayer(); render();
      };
      card.addEventListener('click', toggle);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
      });
    });
    body.querySelectorAll('[data-details]').forEach((b) => b.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation(); showOptionDetail(b.dataset.details);
    }));
    body.querySelector('[data-optnext]')?.addEventListener('click', advance);
    // Time: pick a slot, it moves straight on.
    body.querySelectorAll('[data-timeslot]').forEach((btn) => btn.addEventListener('click', () => {
      state.time = btn.dataset.timeslot; applyTime(); advance();
    }));
    body.querySelector('[data-notify]')?.addEventListener('change', (e) => { state.details.notify = e.target.checked; });
    body.querySelector('[data-create]')?.addEventListener('change', (e) => { state.details.createAccount = e.target.checked; });
    body.querySelector('[data-terms]')?.addEventListener('change', (e) => {
      state.details.terms = e.target.checked;
      e.target.closest('.wiz-optin-terms')?.classList.remove('is-error');
    });
    // details single field (text / email / tel / country)
    const f = DETAIL_FIELDS[state.detailIdx];
    const input = body.querySelector('[data-field]');
    if (input) {
      const sync = () => { state.details[f.key] = input.value; input.classList.remove('is-error'); renderRecap(); };
      input.addEventListener('input', sync);
      input.addEventListener('change', sync);
      // Country is a normal field now: type-ahead (press "B" to reach Belgium),
      // land where you like, then click Next or press Enter. No auto-advance, so
      // the first match of a letter is never chosen for you.
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); nextField(); } });
    }
    // details date group (Day / Month / Year)
    const dob = body.querySelector('[data-field-group]');
    if (dob) {
      const d = dob.querySelector('[data-dob-day]');
      const m = dob.querySelector('[data-dob-month]');
      const y = dob.querySelector('[data-dob-year]');
      const sync = () => {
        state.details.dob = (d.value && m.value && y.value) ? `${y.value}-${m.value}-${d.value}` : '';
        state.ageError = false;
        body.querySelector('.wiz-optins .form-status.error')?.remove();
        renderRecap();
      };
      [d, m, y].forEach((s) => {
        s.addEventListener('change', sync);
        s.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); nextField(); } });
      });
    }
    // Companion (circle) inputs: keep state in sync, don't advance on Enter here.
    body.querySelectorAll('[data-comp-first], [data-comp-email], [data-comp-wa], [data-comp-nick], [data-comp-tshirt]').forEach((inp) => {
      const map = { compFirst: 'first', compEmail: 'email', compWa: 'whatsapp', compNick: 'nickname', compTshirt: 'tshirt' };
      const attr = Object.keys(map).find((k) => inp.dataset[k] != null);
      const set = () => {
        const idx = Number(inp.dataset[attr]);
        if (!state.details.companions[idx]) state.details.companions[idx] = { first: '', email: '', whatsapp: '', nickname: '', tshirt: '' };
        state.details.companions[idx][map[attr]] = inp.value;
        inp.classList.remove('is-error');
        state.compError = false;
      };
      inp.addEventListener('input', set);
      inp.addEventListener('change', set);
    });
    // Lead perks: nickname + tee size + connect opt-in.
    body.querySelector('[data-nickname]')?.addEventListener('input', (e) => { state.details.nickname = e.target.value; });
    body.querySelector('[data-tshirt]')?.addEventListener('change', (e) => { state.details.tshirt = e.target.value; });
    body.querySelector('[data-share]')?.addEventListener('change', (e) => { state.details.shareConnect = e.target.checked; });
    body.querySelectorAll('[data-fnext]').forEach((b) => b.addEventListener('click', () => nextField(b.dataset.action)));
    body.querySelector('[data-topback]')?.addEventListener('click', goBack);
  }

  // ----- recap -----
  function recapLines() {
    const rows = [];
    if (state.mode) rows.push([t('Type'), state.mode === 'group' ? t('Join a group') : t('Private boat')]);
    if (state.mode === 'private' && state.boat) {
      const b = boatById(state.boat);
      rows.push([t('Boat'), `${t(b.name)} (${t('up to {cap}', { cap: b.cap })})`]);
    }
    if (state.mode === 'group' && state.cruise) rows.push([t('Date'), fmtCruiseDate(state.cruise.starts_at)]);
    if (state.mode === 'private' && state.charterDate) {
      let dstr = state.charterDate;
      try { dstr = fmtDateTime(state.charterDate + 'T12:00:00', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }); } catch { /* keep raw */ }
      rows.push([t('Date'), dstr]);
    }
    if (state.mode === 'group' && state.seats) rows.push([t('Seats'), `${state.seats}`]);
    if (state.mode === 'private' && chosenList().length) rows.push([t('Add-ons'), chosenList().map((o) => (o.onRequest ? `${t(o.label)} (${t('on request')})` : t(o.label))).join(', ')]);
    const d = state.details;
    if (d.first) rows.push([t('Name'), `${d.first} ${d.last}`.trim()]);
    if (d.nationality) rows.push([t('Nationality'), d.nationality]);
    const age = ageFrom(d.dob);
    if (age) rows.push([t('Age'), age]);
    return rows;
  }
  function renderRecap() {
    if (state.sent) {
      recap.innerHTML = `<div class="wiz-recap-card">
        <p class="wiz-recap-title">${t('All set')} ⚓</p>
        <p class="form-note">${t('We will be in touch shortly. Meanwhile, explore the site.')}</p>
        <a class="btn btn-outline" href="${langHref('/experiences.html')}">${t('See experiences')}</a>
      </div>`;
      return;
    }
    const rows = recapLines();
    // Group price only appears once the guest has picked their seats; private shows a running estimate.
    const showPrice = state.mode === 'private' || (state.mode === 'group' && state.seats);
    const priceRow = showPrice
      ? `<div class="wiz-recap-price"><span>${state.mode === 'group' ? t('Total') : t('From')}</span><strong>${fmtAED(price())}</strong></div>
         <p class="wiz-recap-note">${state.mode === 'group'
            ? (state.seats === 1
                ? t('{n} seat at {price} each.', { n: state.seats, price: fmtAED(seatPrice()) })
                : t('{n} seats at {price} each.', { n: state.seats, price: fmtAED(seatPrice()) }))
            : t('Estimate. We confirm the final quote before you pay.')}</p>`
      : '';
    const assure = state.mode
      ? `<div class="wiz-recap-assure">
           <p>${t('Free date change up to 7 days before.')}${state.mode === 'group' ? ' ' + t('Full refund if your date does not fill.') : ''}</p>
           <a href="https://wa.me/971585986118?text=Hello%20Bonjour%20Cruise%2C%20a%20question%20before%20I%20book." rel="noopener">${t('A question before you pay? WhatsApp us.')}</a>
         </div>`
      : '';
    recap.innerHTML = `
      <div class="wiz-recap-card">
        <p class="wiz-recap-title">${t('Your cruise')}</p>
        <div class="wiz-recap-rows">
          ${rows.length ? rows.map(([k, v]) => `<div class="wiz-recap-row"><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join('') : `<p class="form-note">${t('Make your choices and they appear here.')}</p>`}
        </div>
        ${priceRow}
        ${assure}
      </div>`;
  }

  function renderProgress() {
    const list = screens();
    progress.innerHTML = list.map((s, i) => {
      const cls = i < state.screenIdx ? 'is-done' : i === state.screenIdx ? 'is-current' : '';
      return `<span class="wiz-dot ${cls}"><i>${i + 1}</i>${t(SCREEN_LABEL[s])}</span>`;
    }).join('');
  }

  function encodeForm(obj) {
    return Object.entries(obj).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  }
  async function submit(action) {
    const d = state.details;
    const name = `${d.first} ${d.last}`.trim();
    if (state.mode === 'group') {
      // Their circle: the guests they are bringing (each gets an invite email + we
      // capture the contacts). Only the filled ones, only for a real booking.
      const circle = (state.cruise ? (d.companions || []).slice(0, Math.max(0, (state.seats || 1) - 1)) : [])
        .filter((c) => (c.first || '').trim() && (c.email || '').trim())
        .map((c) => ({ first: c.first.trim(), email: c.email.trim(), whatsapp: (c.whatsapp || '').trim(), nickname: (c.nickname || '').trim(), tshirt: (c.tshirt || '').trim() }));
      const companionsText = circle.map((c) => `${c.first}${c.nickname ? ` "${c.nickname}"` : ''} <${c.email}>${c.whatsapp ? ` ${c.whatsapp}` : ''}${c.tshirt ? ` [tee ${c.tshirt}]` : ''}`).join('; ');

      // Always leave a lead record for Issam (works even if payment is abandoned).
      fetch('/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: encodeForm({ 'form-name': 'seat-request', name, email: d.email, whatsapp: d.whatsapp,
          nationality: d.nationality, seats: state.seats || '', time: state.time || '',
          nickname: d.nickname || '', tshirt_size: d.tshirt || '', happy_to_connect: d.shareConnect ? 'yes' : 'no',
          cruise: state.cruise ? `${state.cruise.title} · ${fmtCruiseDate(state.cruise.starts_at)}` : 'No date open (notify)',
          companions: companionsText, companions_json: JSON.stringify(circle),
          cruise_starts_at: state.cruise ? state.cruise.starts_at : '',
          cruise_port: state.cruise ? (state.cruise.port_name || '') : '',
          lang: LANG,
          wants_account: d.createAccount ? 'yes' : 'no', terms: 'accepted' }) }).catch(() => {});

      // No open date yet: this is a "keep me posted" request, not a payment.
      if (!state.cruise) { state.sent = true; render(); return; }

      // Real departure: take payment for the exact number of seats, at this
      // cruise's price, via the Checkout Session (a static link cannot do this).
      state.paying = true; state.payError = ''; render();
      try {
        const { data, error } = await supabase.functions.invoke('create-checkout', {
          body: { cruise_id: state.cruise.id, seats: state.seats || 1, first_name: d.first, email: d.email, lang: LANG },
        });
        if (error || !data?.url) throw new Error(data?.error || t('Payment could not start.'));
        window.location.href = data.url;
      } catch (err) {
        state.paying = false;
        state.payError = (err && err.message) ? err.message : t('Payment could not start. Please try again, or message us on WhatsApp.');
        render();
      }
      return;
    }
    // Private charter: always leave the lead record, then either take a deposit
    // to lock the date, or send a request, depending on which button they pressed.
    const chosen = chosenList().map((o) => (o.onRequest ? `${o.label} (on request)` : o.label)).join(', ');
    const dateStr = state.charterDate || '';
    fetch('/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: encodeForm({ 'form-name': 'charter-request', name, email: d.email, whatsapp: d.whatsapp,
        nationality: d.nationality, boat: boatById(state.boat)?.name || '', charter_date: dateStr,
        addons: chosen, estimate: fmtAED(price()),
        nickname: d.nickname || '', tshirt_size: d.tshirt || '',
        intent: action === 'request' ? 'request' : 'deposit', lang: LANG,
        wants_account: d.createAccount ? 'yes' : 'no', terms: 'accepted' }) }).catch(() => {});

    if (action === 'request') { state.sent = true; render(); return; }

    // Deposit to lock the date, via a Checkout Session (server sets the amount).
    state.paying = true; state.payError = ''; render();
    try {
      const startsAtIso = dateStr ? new Date(`${dateStr}T12:00:00+04:00`).toISOString() : '';
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: { kind: 'charter-deposit', first_name: d.first, email: d.email,
          charter_date: dateStr, starts_at: startsAtIso, boat: boatById(state.boat)?.name || '', addons: chosen, lang: LANG },
      });
      if (error || !data?.url) throw new Error(data?.error || t('Payment could not start.'));
      window.location.href = data.url;
    } catch (err) {
      state.paying = false;
      state.payError = (err && err.message) ? err.message : t('Payment could not start. Please try again, or message us on WhatsApp.');
      render();
    }
  }

  function render() {
    root.querySelector('.wiz').classList.toggle('wiz--intro', screen() === 'type');
    renderProgress();
    const canBack = state.screenIdx > 0 && !state.sent;
    const back = canBack ? `<button type="button" class="wiz-topback" data-topback aria-label="${t('Go back one step')}"><span aria-hidden="true">‹</span> ${t('Back')}</button>` : '';
    body.innerHTML = back + bodyFor(screen());
    bindBody();
    renderRecap();
    applyTime();
    renderLayer();
  }

  render();

  // If the guest is already a member, make booking smooth: prefill from their
  // profile and let them confirm + pay in one step instead of re-typing everything.
  (async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      state.user = session.user;
      const meta = session.user.user_metadata || {};
      const { data: profile } = await supabase
        .from('profiles').select('full_name, nickname, whatsapp, nationality').eq('id', session.user.id).maybeSingle();
      state.profile = profile || {};
      const d = state.details;
      const full = (profile?.full_name || meta.full_name || '').trim();
      d.first = meta.first_name || full.split(' ')[0] || d.first;
      d.last = meta.last_name || full.split(' ').slice(1).join(' ') || d.last;
      d.email = session.user.email || d.email;
      d.whatsapp = profile?.whatsapp || meta.whatsapp || d.whatsapp;
      d.nationality = profile?.nationality || meta.nationality || d.nationality;
      d.nickname = profile?.nickname || meta.nickname || d.nickname;
      if (screen() === 'details') render();
    } catch { /* not signed in / offline, fall back to the guest flow */ }
  })();
}

init();
