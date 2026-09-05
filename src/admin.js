import './styles.css';
import { supabase } from './supabase.js';
import { createCalendar, dayKey } from './calendar.js';
import { renderRequestsTab } from './requests-admin.js';
import { renderAnnounceTab } from './announce-admin.js';
import { renderTeamTab } from './team-admin.js';

/* ==========================================================================
   BONJOUR CRUISE, admin scheduling
   Issam signs in, sees a calendar of departures, posts new ones and adjusts
   capacity per date. Everything is written with his own session, so the
   `cruises_admin_write` RLS policy (is_admin) is what authorises it. No secret
   key is ever involved.
   ========================================================================== */

const root = document.querySelector('[data-admin]');

const PORT_NAME_DEFAULT = 'Dubai Marina Yacht Club';
const PORT_ADDRESS_DEFAULT = 'Marina Yacht Club, Dubai Marina, Dubai';
const CONTACT_DEFAULT = '+971585986118';
const SLOTS = [
  { id: 'morning', label: 'Morning', start: '09:00', hours: 3 },
  { id: 'afternoon', label: 'Afternoon', start: '14:00', hours: 4 },
  { id: 'evening', label: 'Evening', start: '18:00', hours: 4 },
];

function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fmtWhen(iso) {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short',
      hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dubai',
    }).format(new Date(iso));
  } catch { return iso; }
}

// Build a Dubai-time ISO string (UTC+4, no DST) from a date + HH:MM.
function dubaiIso(dateStr, timeStr, addHours = 0) {
  const base = new Date(`${dateStr}T${timeStr}:00+04:00`);
  if (addHours) base.setTime(base.getTime() + addHours * 3600 * 1000);
  return base.toISOString();
}

/* ---------- boot / gate ---------- */

async function boot() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return renderSignIn();
  const { data: profile } = await supabase
    .from('profiles').select('is_admin, is_master, admin_permissions, full_name').eq('id', session.user.id).single();
  if (!profile?.is_admin) return renderDenied(session.user.email);

  // Permissions drive which tabs are shown and what the calendar can do.
  const perms = new Set(profile.admin_permissions || []);
  if (profile.is_master) perms.add('master');
  const canCruises = profile.is_master || perms.has('master') || perms.has('cruises');
  const canRequests = profile.is_master || perms.has('master') || perms.has('requests');
  const canTeam = profile.is_master || perms.has('master') || perms.has('team');

  // If the user has no cruises permission, show requests first (or team).
  if (!canCruises && canRequests) return renderRequestsTab(root, { switchTab: () => boot() });
  if (!canCruises && canTeam) return renderTeamTab(root, { switchTab: () => boot() });
  if (!canCruises) {
    root.innerHTML = `
      <div class="form-card" style="max-width:480px;margin-inline:auto;text-align:center;">
        <h3>Welcome, ${esc(profile.full_name || '')}</h3>
        <p>You do not have any access yet. Ask the master admin to grant you access (cruises, requests or approve).</p>
        <button class="btn btn-outline" data-signout>Sign out</button>
      </div>`;
    root.querySelector('[data-signout]').addEventListener('click', async () => { await supabase.auth.signOut(); boot(); });
    return;
  }
  return renderAdmin({ canRequests, canTeam });
}

function renderSignIn(message) {
  root.innerHTML = `
    <div class="form-card" style="max-width:440px;margin-inline:auto;">
      <h3>Team sign in</h3>
      ${message ? `<p class="form-status error">${esc(message)}</p>` : ''}
      <form data-signin>
        <div class="field"><label for="ad-email">Email</label>
          <input id="ad-email" type="email" name="email" required autocomplete="email" /></div>
        <div class="field"><label for="ad-pass">Password</label>
          <input id="ad-pass" type="password" name="password" required autocomplete="current-password" /></div>
        <button class="btn btn-primary" type="submit">Sign in</button>
      </form>
    </div>`;
  root.querySelector('[data-signin]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    const btn = f.querySelector('button');
    btn.disabled = true; btn.textContent = 'Signing in…';
    const { error } = await supabase.auth.signInWithPassword({
      email: f.email.value.trim(), password: f.password.value,
    });
    if (error) { renderSignIn(error.message); return; }
    boot();
  });
}

function renderDenied(email) {
  root.innerHTML = `
    <div class="form-card" style="max-width:480px;margin-inline:auto;text-align:center;">
      <h3>Team access only</h3>
      <p>You are signed in as ${esc(email)}, which is not a Bonjour Cruise admin account.</p>
      <button class="btn btn-outline" data-signout>Sign out</button>
    </div>`;
  root.querySelector('[data-signout]').addEventListener('click', async () => {
    await supabase.auth.signOut(); boot();
  });
}

/* ---------- data ---------- */

async function fetchCruises() {
  // From the start of today onward, every status, so the calendar shows the
  // full picture. Past departures are dimmed by the calendar itself.
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const { data: cruises, error } = await supabase
    .from('cruises')
    .select('id, title, experience, starts_at, ends_at, port_name, capacity, min_guests, price_per_seat, status')
    .gte('starts_at', startOfToday.toISOString())
    .order('starts_at');
  if (error) throw error;
  const withBooked = await Promise.all((cruises || []).map(async (c) => {
    const { data } = await supabase.rpc('cruise_guest_summary', { p_cruise_id: c.id });
    return { ...c, booked: Number(data?.[0]?.seat_count ?? 0), guests: Number(data?.[0]?.guest_count ?? 0) };
  }));
  return withBooked;
}

/* ---------- main admin view ---------- */

async function renderAdmin() {
  root.innerHTML = '<p class="form-note">Loading your calendar…</p>';
  let cruises;
  try { cruises = await fetchCruises(); }
  catch { root.innerHTML = '<p class="form-status error">Could not load cruises. Refresh to retry.</p>'; return; }

  root.innerHTML = `
    <div class="admin-top">
      <p class="admin-hello">${cruises.length} upcoming ${cruises.length === 1 ? 'departure' : 'departures'}.</p>
      <button class="btn btn-outline btn-small" data-signout>Sign out</button>
    </div>
    <div class="admin-tabs">
      <button class="admin-tab admin-tab-active" data-tab="calendar">Calendar</button>
      <button class="admin-tab" data-tab="requests">Requests</button>
      <button class="admin-tab" data-tab="announce">Announce</button>
      <button class="admin-tab" data-tab="team">Team</button>
    </div>
    <div data-admin-view>
      <div class="admin-grid">
        <div data-cal class="admin-cal"></div>
        <aside data-panel class="admin-panel"></aside>
      </div>
    </div>`;

  root.querySelector('[data-signout]').addEventListener('click', async () => { await supabase.auth.signOut(); boot(); });
  const view = root.querySelector('[data-admin-view]');
  root.querySelector('[data-tab="requests"]').addEventListener('click', () =>
    renderRequestsTab(view, { switchTab: () => boot() }));
  root.querySelector('[data-tab="team"]').addEventListener('click', () =>
    renderTeamTab(view, { switchTab: () => boot() }));
  root.querySelector('[data-tab="announce"]').addEventListener('click', () =>
    renderAnnounceTab(view, { switchTab: () => boot() }));

  createCalendar(root.querySelector('[data-cal]'), {
    cruises,
    onSelectDay: (dateStr, dayCruises) => renderPanel(dateStr, dayCruises, cruises),
  });

  // Open today's panel (or the new-departure form) by default.
  renderPanel(dayKey(new Date()), [], cruises);
}

function renderPanel(dateStr, dayCruises, allCruises) {
  const panel = root.querySelector('[data-panel]');
  const existing = dayCruises.map((c) => `
    <div class="admin-cruise" data-cruise="${c.id}">
      <p class="admin-cruise-title">${esc(c.title)}</p>
      <p class="admin-cruise-when">${esc(fmtWhen(c.starts_at))} · ${esc(c.status)}</p>
      <div class="admin-cruise-stat"><strong>${c.booked}</strong> / ${c.capacity} seats booked</div>
      <div class="admin-inline">
        <label>Capacity <input type="number" min="1" max="60" value="${c.capacity}" data-cap /></label>
        <label>Price AED <input type="number" min="0" value="${c.price_per_seat ?? ''}" data-price /></label>
        <label>Status
          <select data-status>
            ${['open', 'confirmed', 'closed', 'cancelled'].map((s) => `<option value="${s}" ${s === c.status ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </label>
      </div>
      <div class="admin-inline">
        <button class="btn btn-primary btn-small" data-save>Save</button>
        <button class="btn btn-text btn-small" data-del>Delete</button>
      </div>
    </div>`).join('');

  panel.innerHTML = `
    <p class="admin-panel-date">${new Date(dateStr).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
    ${existing || '<p class="form-note">No departure on this day yet.</p>'}
    <details class="admin-new" ${dayCruises.length ? '' : 'open'}>
      <summary>Post a new departure</summary>
      ${newForm(dateStr)}
    </details>`;

  // wire edits
  panel.querySelectorAll('[data-cruise]').forEach((row) => {
    const id = row.dataset.cruise;
    row.querySelector('[data-save]').addEventListener('click', async (e) => {
      const btn = e.currentTarget; btn.disabled = true; btn.textContent = 'Saving…';
      const capacity = Number(row.querySelector('[data-cap]').value) || 1;
      const price = row.querySelector('[data-price]').value;
      const status = row.querySelector('[data-status]').value;
      const { error } = await supabase.from('cruises')
        .update({ capacity, price_per_seat: price === '' ? null : Number(price), status }).eq('id', id);
      if (error) { btn.textContent = 'Error'; return; }
      renderAdmin();
    });
    row.querySelector('[data-del]').addEventListener('click', async () => {
      if (!confirm('Delete this departure? Bookings on it would be orphaned.')) return;
      await supabase.from('cruises').delete().eq('id', id);
      renderAdmin();
    });
  });

  wireNewForm(panel, dateStr);
}

function newForm(dateStr) {
  return `
    <form data-new class="admin-form">
      <div class="admin-slots">
        ${SLOTS.map((s) => `<button type="button" class="admin-slot" data-slot="${s.id}">${s.label}<span>${s.start}</span></button>`).join('')}
      </div>
      <div class="field"><label>Title</label>
        <input name="title" required placeholder="Sunset Ladies Cruise" value="Ladies Sunset Cruise" /></div>
      <div class="admin-inline">
        <label>Date <input type="date" name="date" required value="${dateStr}" /></label>
        <label>Start <input type="time" name="time" required value="18:00" /></label>
        <label>Hours <input type="number" name="hours" min="1" max="10" value="4" /></label>
      </div>
      <div class="admin-inline">
        <label>Capacity <input type="number" name="capacity" min="1" max="60" value="15" /></label>
        <label>Min to sail <input type="number" name="min_guests" min="1" max="60" value="8" /></label>
        <label>Price AED <input type="number" name="price" min="0" value="380" /></label>
      </div>
      <div class="admin-caps">
        <span>Quick capacity:</span>
        ${[8, 12, 15, 30].map((n) => `<button type="button" class="admin-cap-chip" data-capset="${n}">${n}</button>`).join('')}
      </div>
      <div class="field"><label>Meeting point</label>
        <input name="port_name" required value="${esc(PORT_NAME_DEFAULT)}" /></div>
      <div class="field"><label>Address</label>
        <input name="port_address" required value="${esc(PORT_ADDRESS_DEFAULT)}" /></div>
      <div class="admin-inline">
        <label>Contact <input name="contact_number" required value="${esc(CONTACT_DEFAULT)}" /></label>
        <label>Age band <input name="age_band" value="All ages" /></label>
      </div>
      <div class="field"><label>What to bring (optional)</label>
        <input name="what_to_bring" placeholder="Swimwear, sunscreen, a light layer" /></div>
      <button class="btn btn-primary" type="submit">Post this departure</button>
      <p class="form-status" data-new-status role="status"></p>
    </form>`;
}

function wireNewForm(panel, dateStr) {
  const form = panel.querySelector('[data-new]');
  if (!form) return;
  form.querySelectorAll('[data-slot]').forEach((b) => b.addEventListener('click', () => {
    const slot = SLOTS.find((s) => s.id === b.dataset.slot);
    form.time.value = slot.start; form.hours.value = slot.hours;
  }));
  form.querySelectorAll('[data-capset]').forEach((b) => b.addEventListener('click', () => {
    form.capacity.value = b.dataset.capset;
  }));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const statusEl = form.querySelector('[data-new-status]');
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Posting…';
    const starts_at = dubaiIso(form.date.value, form.time.value);
    const ends_at = dubaiIso(form.date.value, form.time.value, Number(form.hours.value) || 0);
    const payload = {
      title: form.title.value.trim(),
      starts_at, ends_at,
      port_name: form.port_name.value.trim(),
      port_address: form.port_address.value.trim(),
      contact_number: form.contact_number.value.trim(),
      capacity: Number(form.capacity.value) || 1,
      min_guests: Number(form.min_guests.value) || 1,
      price_per_seat: form.price.value === '' ? null : Number(form.price.value),
      age_band: form.age_band.value.trim() || 'All ages',
      what_to_bring: form.what_to_bring.value.trim() || null,
      status: 'open',
    };
    const { error } = await supabase.from('cruises').insert(payload);
    if (error) {
      statusEl.className = 'form-status error';
      statusEl.textContent = error.message;
      btn.disabled = false; btn.textContent = 'Post this departure';
      return;
    }
    renderAdmin();
  });
}

boot();
