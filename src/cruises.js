import './styles.css';
import { seatIcons, madameLine } from './member.js';
import { supabase } from './supabase.js';
import { t, fmtDateTime as i18nDateTime, langHref } from './i18n.js';

/* ==========================================================================
   BONJOUR CRUISE, public "Upcoming cruises" page
   Lists open departures, shows how many guests have already booked, and lets a
   signed-in member reserve a seat. Signed-out visitors are sent to create an
   account first. Reading open cruises + the guest count is allowed for anon
   (see schema.sql section 10).
   ========================================================================== */

// Decorative thumbnail shown beside each cruise: a soft pink yacht at sea,
// Real photo shown on the right of each cruise card. Falls back to a default
// yacht photo until a per-cruise image_url is set in the database.
const DEFAULT_CRUISE_IMG = '/assets/img/day-cruise.webp';

const els = {
  loading: document.getElementById('cruises-loading'),
  list: document.getElementById('cruises-list'),
  status: document.getElementById('cruises-status'),
};

function esc(value) {
  return String(value ?? '')
    .replace(/\s*[—–]\s*/g, ', ') // never render an em/en dash (Issam's rule)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fmtDateTime(iso) {
  return i18nDateTime(iso, {
    weekday: 'long', day: 'numeric', month: 'long',
    hour: '2-digit', minute: '2-digit',
  });
}

function status(type, message) {
  if (!els.status) return;
  els.status.className = `form-status ${type}`;
  els.status.textContent = message;
  els.status.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function countLine(count) {
  if (count <= 0) return t('Be the very first to reserve a seat.');
  if (count === 1) return t('1 guest has already booked.');
  return t('{n} guests have already booked.', { n: count });
}

/* ---------- Celebratory confirmation ---------- */

function showJoinedModal(cruise, count = 0) {
  const existing = document.querySelector('.mc-modal');
  if (existing) existing.remove();
  const companions = count > 0
    ? (count === 1
        ? t('{n} guest has already booked. You will sail together.', { n: count })
        : t('{n} guests have already booked. You will sail together.', { n: count }))
    : t('You are the first to reserve. Other guests will join, and we will keep you posted.');

  const modal = document.createElement('div');
  modal.className = 'mc-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.innerHTML = `
    <div class="mc-modal-backdrop" data-close></div>
    <div class="mc-modal-card">
      <button class="mc-modal-close" type="button" aria-label="${t('Close')}" data-close>&#10005;</button>
      <div class="joined">
        <span class="joined-mark" aria-hidden="true">&#9875;</span>
        <span class="eyebrow">${t('You are in')}</span>
        <h2>${t('You are confirmed for your cruise.')}</h2>
        <p class="joined-sub">${esc(cruise.title)}<br /><strong>${esc(fmtDateTime(cruise.starts_at))}</strong><br />${esc(cruise.port_name)}</p>
        <p class="joined-count">${companions}</p>
        <p class="joined-note">${t('Everything you need, plus who is aboard, is waiting in your account.')}</p>
        <a class="btn btn-primary" href="${langHref('/account.html')}">${t('See my next cruise')}</a>
      </div>
    </div>`;
  document.body.appendChild(modal);
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => modal.classList.add('is-open'));

  const close = () => {
    modal.classList.remove('is-open');
    document.body.style.overflow = '';
    setTimeout(() => modal.remove(), 300);
  };
  modal.querySelectorAll('[data-close]').forEach((n) => n.addEventListener('click', close));
}

/* ---------- Reserve flow ---------- */

// Live Stripe payment link (AED 380 launch offer per seat, quantity 1 to 8).
const PAYMENT_LINK = 'https://buy.stripe.com/8x2eVdbR0fhLgYJ8C5efC00';

// Pre-filled WhatsApp thread, used whenever the live schedule cannot be shown.
// A failed page load must never cost a lead.
const WHATSAPP_DATES_LINK =
  'https://wa.me/971585986118?text=' +
  encodeURIComponent('Hello Bonjour Cruise, I would like the dates of the next shared cruise.');

async function reserve(cruise, seats, btn) {
  const { data: { session } } = await supabase.auth.getSession();

  // Not signed in: send the guest to create an account, remembering where they were.
  if (!session) {
    try { sessionStorage.setItem('mc_intended_cruise', cruise.id); } catch { /* ignore */ }
    window.location.href = langHref('/account.html') + '?next=cruises';
    return;
  }

  btn.disabled = true;
  btn.textContent = t('Going to payment…');

  // Record their seat so it shows in their account, then take payment on Stripe.
  await supabase
    .from('registrations')
    .insert({ cruise_id: cruise.id, user_id: session.user.id, seats })
    .then(() => {}, () => {}); // ignore duplicate / errors, payment is what matters

  const ref = encodeURIComponent(`${cruise.id}|${session.user.id}|${seats}`);
  const email = encodeURIComponent(session.user.email || '');
  window.location.href = `${PAYMENT_LINK}?client_reference_id=${ref}&prefilled_email=${email}`;
}

/* ---------- Render ---------- */

// Seat <option>s capped to however many seats are actually still free.
function seatOptions(spotsLeft) {
  const max = Math.max(1, Math.min(spotsLeft || 8, 12));
  let html = '';
  for (let n = 1; n <= max; n += 1) html += `<option value="${n}">${n}</option>`;
  return html;
}

function cruiseCard(cruise, count) {
  const cap = cruise.capacity || 8;
  const guests = Number(count?.guests || 0); // distinct guests aboard
  const seats = Number(count?.seats || 0);   // total seats reserved
  const spotsLeft = cruise.capacity ? Math.max(0, cap - seats) : null;
  const full = spotsLeft === 0;
  const img = cruise.image_url || DEFAULT_CRUISE_IMG;

  const card = document.createElement('div');
  card.className = 'way-card cruise-open-card';
  card.innerHTML = `
    <div class="cruise-body">
      <span class="eyebrow">${esc(cruise.age_band || t('All ages'))}</span>
      <h3>${esc(cruise.title)}</h3>
      <p class="way-price">${cruise.price_per_seat ? `AED ${esc(cruise.price_per_seat)} / ${t('seat')}` : t('By the seat')}</p>
      <ul class="cruise-facts">
        <li><strong>${t('When')}</strong><span>${esc(fmtDateTime(cruise.starts_at))}</span></li>
        <li><strong>${t('Port')}</strong><span>${esc(cruise.port_name)}</span></li>
        ${spotsLeft !== null ? `<li><strong>${t('Seats left')}</strong><span>${spotsLeft}</span></li>` : ''}
      </ul>
      ${seatIcons(guests, cap, full ? 0 : 1)}
      <p class="companions">${madameLine(guests)}</p>
      ${full ? `
      <p class="companions" style="color:var(--gold)">${t('This cruise is fully booked.')}</p>` : `
      <div class="reserve-row">
        <label>${t('Seats')}
          <select class="seat-select">${seatOptions(spotsLeft)}</select>
        </label>
        <button class="btn btn-primary reserve-btn" type="button">${t('Reserve my seat')}</button>
      </div>`}
    </div>
    <div class="cruise-thumb"><img class="thumb-img" src="${esc(img)}" alt="Bonjour Cruise, ${esc(cruise.title)}" loading="lazy" /></div>`;

  if (!full) {
    const btn = card.querySelector('.reserve-btn');
    const seatSelect = card.querySelector('.seat-select');
    // Live preview: the seats you pick light up in gold on the member icons.
    seatSelect.addEventListener('change', () => {
      card.querySelector('.seat-icons').outerHTML = seatIcons(guests, cap, Number(seatSelect.value));
    });
    btn.addEventListener('click', () => reserve(cruise, Number(seatSelect.value), btn));
  }
  return card;
}

async function boot() {
  const nowIso = new Date().toISOString();

  const { data: cruises, error } = await supabase
    .from('cruises')
    .select('id, title, starts_at, port_name, age_band, capacity, price_per_seat, status')
    .eq('status', 'open')
    .gte('starts_at', nowIso)
    .order('starts_at');

  if (els.loading) els.loading.hidden = true;

  // The static fallback card rendered server-side in cruises.html. It is the
  // page's only crawlable content and the only offer a visitor sees when the
  // database is unreachable, so it is removed ONLY when live cruises replace
  // it. On an error or an empty schedule we append to it instead.
  const appendNotice = (html) => {
    const notice = document.createElement('div');
    notice.className = 'way-card';
    notice.style.marginBlockStart = '1.5rem';
    notice.innerHTML = html;
    els.list.appendChild(notice);
  };

  if (error) {
    appendNotice(
      `<p>${t('We could not load the live schedule right now. The cruise above still runs, so message us on WhatsApp for the next dates.')}</p>
       <a class="btn btn-primary" href="${WHATSAPP_DATES_LINK}" rel="noopener">${t('Ask for the next dates on WhatsApp')}</a>`,
    );
    return;
  }

  if (!cruises || !cruises.length) {
    appendNotice(
      `<h3>${t('No scheduled cruises just yet.')}</h3>
       <p>${t('New shared departures are added regularly. Create your account and we will email you the moment the next one opens, so you can grab a seat first.')}</p>
       <a class="btn btn-primary" href="${langHref('/account.html')}">${t('Create my account')}</a>`,
    );
    return;
  }

  // Counts: best-effort, the page still renders if the RPC is unavailable.
  // guests = distinct guests aboard (drives the icons + roster), seats = total
  // seats reserved (drives "seats left"). Re-fetched on every visit, so the
  // numbers grow as more guests book.
  const counts = await Promise.all(
    cruises.map((c) =>
      supabase.rpc('cruise_guest_summary', { p_cruise_id: c.id })
        .then(({ data }) => ({
          guests: Number(data?.[0]?.guest_count ?? 0),
          seats: Number(data?.[0]?.seat_count ?? 0),
        }))
        .catch(() => ({ guests: 0, seats: 0 }))
    )
  );

  els.list.innerHTML = '';
  cruises.forEach((c, i) => els.list.appendChild(cruiseCard(c, counts[i])));
}

boot();

/* ---------- "Pick your date" request form ---------- */

function initDateForm() {
  const form = document.querySelector('[data-date-form]');
  if (!form) return;
  const statusEl = document.querySelector('[data-date-status]');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    const orig = btn.textContent;
    btn.disabled = true;
    btn.textContent = t('Sending…');
    const body = new URLSearchParams(new FormData(form)).toString();
    try {
      const res = await fetch('/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
      if (!res.ok) throw new Error(String(res.status));
      if (statusEl) { statusEl.className = 'form-status success'; statusEl.textContent = form.dataset.successMessage; }
      form.reset();
    } catch {
      if (statusEl) { statusEl.className = 'form-status error'; statusEl.textContent = t('Could not send right now. Please try again in a moment.'); }
    } finally {
      btn.disabled = false;
      btn.textContent = orig;
    }
  });
}

initDateForm();
