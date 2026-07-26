import './styles.css';
import { seatIcons, madameLine } from './member.js';
import { supabase } from './supabase.js';
import { COUNTRIES, LANGUAGES } from './data.js';
import { t, fmtDateTime as i18nDateTime, langHref, LANG } from './i18n.js';

// Live Stripe payment link (AED 380 launch offer per seat, quantity 1 to 8).
const PAYMENT_LINK = 'https://buy.stripe.com/8x2eVdbR0fhLgYJ8C5efC00';

/* ==========================================================================
   BONJOUR CRUISE, member account area
   Sign up / sign in / "Next cruise" dashboard, all on Supabase.
   Privacy: a guest only ever reads their own rows (enforced by RLS). The count
   of other guests comes from the cruise_guest_summary RPC, a number only.
   ========================================================================== */

const els = {
  loading: document.getElementById('account-loading'),
  authView: document.getElementById('auth-view'),
  dashView: document.getElementById('dashboard-view'),
  authStatus: document.querySelector('#auth-view .form-status'),
  signupForm: document.getElementById('signup-form'),
  signinForm: document.getElementById('signin-form'),
  tabs: document.querySelectorAll('.auth-tab'),
  greeting: document.getElementById('dash-greeting'),
  nextCruise: document.getElementById('next-cruise'),
  cruiseCount: document.querySelector('[data-cruise-count]'),
  upcoming: document.getElementById('upcoming-cruises'),
  dashStatus: document.getElementById('dash-status'),
  signoutBtn: document.getElementById('signout-btn'),
};

/* ---------- Small helpers ---------- */

function show(el) { if (el) el.hidden = false; }
function hide(el) { if (el) el.hidden = true; }

// The member's first name/nickname, stashed at dashboard render so the
// "email confirmed" modal can greet them without parsing translated UI text.
let dashGreetName = '';

function status(el, type, message) {
  if (!el) return;
  el.className = `form-status ${type}`;
  el.textContent = message;
}

function clearStatus(el) {
  if (!el) return;
  el.className = 'form-status';
  el.textContent = '';
}

// Turn a raw Supabase/network error into a clear, translated, actionable message.
// "Load failed" / "Failed to fetch" is a browser network failure (flaky network,
// a content blocker or private browsing blocking the request), not a real error.
function authErrorMessage(error) {
  const m = (error && error.message ? error.message : '').toLowerCase();
  if (m.includes('load failed') || m.includes('failed to fetch') || m.includes('networkerror') || m.includes('network request failed')) {
    return t('We could not reach our servers. Check your connection, and if you use a content blocker or private browsing, try turning it off. You can also book with us on WhatsApp.');
  }
  if (m.includes('invalid login credentials')) {
    return t('Email or password is incorrect. If you booked as a guest, use "Set or reset my password" below.');
  }
  if (m.includes('already registered') || m.includes('already been registered')) {
    return t('This email already has an account. Try signing in, or reset your password below.');
  }
  if (m.includes('email not confirmed')) {
    return t('Please confirm your email first. Open the link we sent you, and check spam or promotions too.');
  }
  return (error && error.message) ? error.message : t('Something went wrong. Please try again.');
}

function formatDateTime(iso) {
  return i18nDateTime(iso, {
    weekday: 'long', day: 'numeric', month: 'long',
    hour: '2-digit', minute: '2-digit',
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/\s*[—–]\s*/g, ', ') // never render an em/en dash (Issam's rule)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function langList(arr) {
  // Languages are stored as their full display name, so just join them.
  return (arr || []).join(' · ');
}

/* ---------- Auth tab switching ---------- */

function initTabs() {
  els.tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      els.tabs.forEach((t) => {
        const active = t === tab;
        t.classList.toggle('is-active', active);
        t.setAttribute('aria-selected', String(active));
      });
      els.signupForm.hidden = target !== 'signup';
      els.signinForm.hidden = target !== 'signin';
      clearStatus(els.authStatus);
    });
  });
}

/* ---------- Sign up ---------- */

function initSignup() {
  els.signupForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const btn = els.signupForm.querySelector('button[type="submit"]');
    const fd = new FormData(els.signupForm);
    clearStatus(els.authStatus);

    // Age: Bonjour Cruise is open to everyone 18+. Confirm before we open an account.
    if (!fd.get('eligibility')) {
      status(els.authStatus, 'error', t('Please confirm you are 18 or older to join.'));
      return;
    }

    // Passwords must match before we even call Supabase.
    if (fd.get('password') !== fd.get('password2')) {
      status(els.authStatus, 'error', t('The two passwords do not match. Please re-enter them.'));
      return;
    }

    btn.disabled = true;
    btn.textContent = t('Creating…');

    const fullName = `${(fd.get('first_name') || '').trim()} ${(fd.get('last_name') || '').trim()}`.trim();

    const { data: result, error } = await supabase.auth.signUp({
      email: fd.get('email'),
      password: fd.get('password'),
      options: {
        emailRedirectTo: `${window.location.origin}${langHref('/account.html')}`,
        data: {
          lang: LANG, // their chosen site language, so the confirmation email renders in it only
          eligibility_confirmed: true, // confirmed 18 or older
          full_name: fullName,
          first_name: (fd.get('first_name') || '').trim(),
          last_name: (fd.get('last_name') || '').trim(),
          nickname: fd.get('nickname') || null,
          whatsapp: fd.get('whatsapp') || null,
          nationality: fd.get('nationality') || null,
          date_of_birth: fd.get('date_of_birth') || null,
          tshirt_size: fd.get('tshirt_size') || null,
          languages: fd.getAll('languages'),
          marketing_consent: fd.get('marketing_consent') === 'on',
          share_name: fd.get('share_name') === 'on',
          share_age: fd.get('share_age') === 'on',
          share_languages: fd.get('share_languages') === 'on',
          share_photo: fd.get('share_photo') === 'on',
        },
      },
    });

    btn.disabled = false;
    btn.textContent = t('Create my account');

    if (error) {
      status(els.authStatus, 'error', authErrorMessage(error));
      return;
    }

    // Tell Issam a new member just joined (a warm nudge to his hub).
    try {
      const params = new URLSearchParams({
        'form-name': 'new-member',
        first_name: (fd.get('first_name') || '').trim(),
        last_name: (fd.get('last_name') || '').trim(),
        nickname: (fd.get('nickname') || '').trim(),
        email: fd.get('email') || '',
        nationality: fd.get('nationality') || '',
        whatsapp: fd.get('whatsapp') || '',
      });
      fetch('/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString() });
    } catch { /* non-blocking */ }

    // If email confirmation is on, there is no active session yet.
    const photoFile = document.getElementById('su-photo')?.files?.[0];
    if (result.session) {
      if (photoFile) {
        try { await uploadAvatar(result.user.id, photoFile); } catch { /* non-fatal */ }
      }
      await renderDashboard(result.user);
    } else {
      // Email confirmation is on: there is no session yet, so we cannot upload.
      // Stash the chosen photo (downscaled) to upload once they confirm + land here.
      if (photoFile) {
        try {
          const blob = await downscaleImage(photoFile, 512);
          localStorage.setItem('mc_pending_avatar', await blobToDataURL(blob));
        } catch { /* skip if it will not fit */ }
      }
      // Greet them the way they asked to be called (nickname), else first name.
      const greetName = (fd.get('nickname') || '').trim() || fullName.split(' ')[0];
      showSignupSuccess(greetName);
    }
  });
}

// Replace the whole form with a warm, full-size confirmation once they sign up.
function showSignupSuccess(name) {
  const first = (name || '').trim() || t('lovely');
  els.authView.innerHTML = `
    <div class="form-card auth-success" style="max-width: 560px; margin-inline: auto;">
      <span class="joined-mark" aria-hidden="true">&#128156;</span>
      <span class="eyebrow">${t('Welcome aboard, {name}', { name: escapeHtml(first) })}</span>
      <h2>${t('Thank you for joining Bonjour Cruise.')}</h2>
      <p class="joined-sub">${t('You are one step away from the water.')}</p>
      <p>${t('We have just sent a confirmation link to your email. Tap it to verify your address and unlock your account, it keeps our community real and every account verified.')}</p>
      <div class="spam-tip">📬 ${t('It often lands in {folder} at first. Look there, open it, and mark it "not spam" so you never miss your cruise.', { folder: `<strong>${t('spam or promotions')}</strong>` })}</div>
      <p class="form-note">${t('Once confirmed, sign in to see upcoming cruises, reserve your seat and add your photo.')}</p>
    </div>`;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------- Sign in ---------- */

function initSignin() {
  els.signinForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const btn = els.signinForm.querySelector('button[type="submit"]');
    const data = Object.fromEntries(new FormData(els.signinForm).entries());
    btn.disabled = true;
    btn.textContent = t('Signing in…');
    clearStatus(els.authStatus);

    const { data: result, error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });

    btn.disabled = false;
    btn.textContent = t('Sign in');

    if (error) {
      status(els.authStatus, 'error', authErrorMessage(error));
      return;
    }
    await renderDashboard(result.user);
  });
}

/* ---------- Sign out ---------- */

function initSignout() {
  els.signoutBtn.addEventListener('click', async () => {
    await supabase.auth.signOut();
    hide(els.dashView);
    show(els.authView);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

/* ---------- Show / hide password ---------- */

const EYE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M2 12s3.5-7 10-7c2 0 3.8.6 5.3 1.5M22 12s-3.5 7-10 7c-2 0-3.8-.6-5.3-1.5"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/><path d="M3 3l18 18"/></svg>';

function initPasswordToggles() {
  document.querySelectorAll('.auth-form input[type="password"]').forEach((input) => {
    if (input.dataset.eye) return;
    input.dataset.eye = '1';

    const wrap = document.createElement('div');
    wrap.className = 'pw-wrap';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pw-eye';
    btn.setAttribute('aria-label', t('Show password'));
    btn.innerHTML = EYE_SVG;
    wrap.appendChild(btn);

    btn.addEventListener('click', () => {
      const reveal = input.type === 'password';
      input.type = reveal ? 'text' : 'password';
      btn.innerHTML = reveal ? EYE_OFF_SVG : EYE_SVG;
      btn.setAttribute('aria-label', reveal ? t('Hide password') : t('Show password'));
    });
  });
}

/* ---------- Sharing master toggle ---------- */
/* One switch decides "private" vs "happy to connect". When on, the granular
   options (first name / age / languages / photo) appear; when off, everything
   is unticked and nothing is shared. */

function initShareToggle() {
  document.querySelectorAll('[data-share-master]').forEach((master) => {
    const field = master.closest('.field');
    if (!field || master.dataset.bound) return;
    master.dataset.bound = '1';
    const options = field.querySelector('[data-share-options]');
    const hint = field.querySelector('[data-share-hint]');
    const boxes = options ? options.querySelectorAll('input[type="checkbox"]') : [];

    const apply = (clearWhenOff) => {
      const on = master.checked;
      if (options) options.hidden = !on;
      if (hint) {
        hint.textContent = on
          ? t('You choose exactly what to show below. Change it any time.')
          : t('You stay completely private. Nothing about you is shown to anyone.');
      }
      if (!on && clearWhenOff) boxes.forEach((b) => { b.checked = false; });
    };

    master.addEventListener('change', () => apply(true));
    apply(false);
  });
}

// Called after the dashboard form is prefilled, to open the switch if they
// already share something.
function syncShareMaster(form, profile) {
  const master = form.querySelector('[data-share-master]');
  if (!master) return;
  const anyShared = profile.share_name || profile.share_age || profile.share_languages || profile.share_photo;
  master.checked = !!anyShared;
  master.dispatchEvent(new Event('change'));
}

/* ---------- Country + language pickers ---------- */

// Turn an ISO-2 code into its flag emoji (regional indicator letters).
function flagEmoji(code) {
  return code.toUpperCase().replace(/./g, (ch) => String.fromCodePoint(127397 + ch.charCodeAt(0)));
}

function initCountrySelect() {
  document.querySelectorAll('[data-country-select]').forEach((select) => {
    COUNTRIES.forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c.name;
      opt.textContent = `${flagEmoji(c.code)}  ${c.name}`;
      select.appendChild(opt);
    });
  });
}

function initLanguagePicker() {
  const select = document.querySelector('[data-language-select]');
  const addBtn = document.querySelector('[data-language-add]');
  const tags = document.querySelector('[data-language-tags]');
  if (!select || !tags) return;

  LANGUAGES.forEach((l) => {
    const opt = document.createElement('option');
    opt.value = l;
    opt.textContent = l;
    select.appendChild(opt);
  });

  const chosen = new Set();
  const addLang = (lang) => {
    if (!lang || chosen.has(lang)) return;
    chosen.add(lang);

    const tag = document.createElement('span');
    tag.className = 'lang-tag';
    const hidden = document.createElement('input');
    hidden.type = 'hidden';
    hidden.name = 'languages';
    hidden.value = lang;
    const text = document.createElement('span');
    text.textContent = lang;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.setAttribute('aria-label', t('Remove {lang}', { lang }));
    remove.textContent = '✕';
    remove.addEventListener('click', () => { chosen.delete(lang); tag.remove(); });
    tag.append(hidden, text, remove);
    tags.appendChild(tag);
    select.value = '';
  };

  addBtn?.addEventListener('click', () => addLang(select.value));
  select.addEventListener('change', () => { if (select.value) addLang(select.value); });
}

/* ---------- Photo (avatar) ---------- */

function renderAvatarInto(el, url, fallback) {
  if (!el) return;
  if (url) {
    el.style.backgroundImage = `url("${url}")`;
    el.classList.add('has-photo');
    el.textContent = '';
  } else {
    el.style.backgroundImage = '';
    el.classList.remove('has-photo');
    el.textContent = fallback || '';
  }
}

// Shrink an avatar to a small square-ish JPEG so uploads are fast and it fits
// in localStorage when we have to stash it across email confirmation.
function downscaleImage(file, max = 512) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      canvas.toBlob((blob) => resolve(blob || file), 'image/jpeg', 0.85);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Upload to the `avatars` Storage bucket under a per-user folder, then save the
// public URL on the profile. Needs an active session (RLS on storage.objects).
async function uploadAvatar(userId, file) {
  const blob = await downscaleImage(file, 512);
  const path = `${userId}/avatar.jpg`;
  const { error } = await supabase.storage
    .from('avatars')
    .upload(path, blob, { upsert: true, contentType: 'image/jpeg' });
  if (error) throw error;
  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  const url = `${data.publicUrl}?t=${Date.now()}`; // bust the CDN cache on re-upload
  await supabase.from('profiles').update({ avatar_url: url }).eq('id', userId);
  return url;
}

// Signup-form photo picker: live preview of the chosen file, with a remove button.
function initPhotoPicker() {
  const input = document.getElementById('su-photo');
  const preview = document.querySelector('[data-photo-preview]');
  if (!input || !preview) return;
  const label = document.querySelector('[data-photo-label]');
  const clearBtn = document.querySelector('[data-photo-clear]');

  const reset = () => {
    input.value = '';
    renderAvatarInto(preview, null, '+');
    if (label) label.textContent = t('Tap the circle to add a photo');
    if (clearBtn) clearBtn.hidden = true;
  };

  reset(); // show the "+" prompt from the start

  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file) { reset(); return; }
    renderAvatarInto(preview, URL.createObjectURL(file), '+');
    if (label) label.textContent = t('Looking lovely. Tap to change.');
    if (clearBtn) clearBtn.hidden = false;
  });
  clearBtn?.addEventListener('click', reset);
}

// Dashboard photo control: shows the saved avatar and lets them change it anytime.
function initDashPhoto(user, currentUrl) {
  const input = document.getElementById('dash-photo-input');
  const preview = document.querySelector('[data-dash-photo]');
  if (!input || !preview) return;
  const label = document.querySelector('[data-dash-photo-label]');

  renderAvatarInto(preview, currentUrl, '+');
  if (label) label.textContent = currentUrl ? t('Tap to change your photo') : t('Tap the circle to add a photo');

  if (input.dataset.bound) return;
  input.dataset.bound = '1';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    if (label) label.textContent = t('Uploading…');
    try {
      const url = await uploadAvatar(user.id, file);
      renderAvatarInto(preview, url, '+');
      if (label) label.textContent = t('Change photo');
      status(els.dashStatus, 'success', t('Your photo has been saved.'));
    } catch {
      if (label) label.textContent = currentUrl ? t('Change photo') : t('Tap the circle to add a photo');
      status(els.dashStatus, 'error', t('Could not save your photo right now. Please try again in a moment.'));
    }
  });
}

/* ---------- Dashboard ---------- */

async function renderDashboard(user) {
  hide(els.authView);
  hide(els.loading);
  show(els.dashView);

  // Profile (own row only, via RLS)
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, nickname, whatsapp, city, nationality, avatar_url, share_name, share_age, share_languages, share_photo')
    .eq('id', user.id)
    .maybeSingle();

  const greetName = (profile?.nickname || '').trim() || (profile?.full_name || '').split(' ')[0] || t('there');
  dashGreetName = greetName;
  els.greeting.textContent = t('Hello, {name}', { name: greetName });

  // If they chose a photo at signup (before confirming their email), upload it now.
  let avatarUrl = profile?.avatar_url || null;
  let pending = null;
  try { pending = localStorage.getItem('mc_pending_avatar'); } catch { /* ignore */ }
  if (!avatarUrl && pending) {
    try {
      const blob = await (await fetch(pending)).blob();
      avatarUrl = await uploadAvatar(user.id, blob);
    } catch { /* non-fatal */ }
    try { localStorage.removeItem('mc_pending_avatar'); } catch { /* ignore */ }
  }

  initDashPhoto(user, avatarUrl);
  initDetails(user, profile || {});

  await Promise.all([renderNextCruises(user), renderUpcoming(user)]);
}

// Editable "Your details" card: prefill from the profile and save changes back.
// DOB is shown and entered as DD/MM/YYYY (never the US format), stored as an ISO
// date. Empty or malformed input saves null rather than erroring.
function isoToDob(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}
function dobToIso(s) {
  const m = String(s || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const d = m[1].padStart(2, '0'), mo = m[2].padStart(2, '0'), y = m[3];
  if (+mo < 1 || +mo > 12 || +d < 1 || +d > 31) return null;
  return `${y}-${mo}-${d}`;
}

// A self-contained language picker for the dashboard "Your details" form, kept
// separate from the signup picker. Returns a getter for the chosen languages.
function initDetailsLanguages(initial) {
  const select = document.querySelector('[data-details-language-select]');
  const addBtn = document.querySelector('[data-details-language-add]');
  const tags = document.querySelector('[data-details-language-tags]');
  const chosen = new Set(Array.isArray(initial) ? initial : []);
  if (!select || !tags) return () => [...chosen];

  if (!select.dataset.filled) {
    LANGUAGES.forEach((l) => { const o = document.createElement('option'); o.value = l; o.textContent = l; select.appendChild(o); });
    select.dataset.filled = '1';
  }
  const render = () => {
    tags.innerHTML = '';
    chosen.forEach((lang) => {
      const tag = document.createElement('span'); tag.className = 'lang-tag';
      const text = document.createElement('span'); text.textContent = lang;
      const remove = document.createElement('button'); remove.type = 'button';
      remove.setAttribute('aria-label', t('Remove {lang}', { lang })); remove.textContent = '✕';
      remove.addEventListener('click', () => { chosen.delete(lang); render(); });
      tag.append(text, remove); tags.appendChild(tag);
    });
  };
  const add = (lang) => { if (lang && !chosen.has(lang)) { chosen.add(lang); render(); } select.value = ''; };
  if (!select.dataset.bound) {
    addBtn?.addEventListener('click', () => add(select.value));
    select.addEventListener('change', () => { if (select.value) add(select.value); });
    select.dataset.bound = '1';
  }
  render();
  return () => [...chosen];
}

function initDetails(user, profile) {
  const form = document.getElementById('details-form');
  if (!form) return;

  const set = (id, value) => { const elx = document.getElementById(id); if (elx) elx.value = value || ''; };
  const check = (id, value) => { const elx = document.getElementById(id); if (elx) elx.checked = !!value; };

  set('ed-nickname', profile.nickname);
  set('ed-whatsapp', profile.whatsapp);
  set('ed-nationality', profile.nationality);
  set('ed-dob', isoToDob(profile.date_of_birth));
  set('ed-tshirt', profile.tshirt_size);
  const getLangs = initDetailsLanguages(profile.languages);
  check('ed-share_name', profile.share_name);
  check('ed-share_age', profile.share_age);
  check('ed-share_languages', profile.share_languages);
  check('ed-share_photo', profile.share_photo);
  syncShareMaster(form, profile);

  if (form.dataset.bound) return;
  form.dataset.bound = '1';
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = t('Saving…');
    const { error } = await supabase.from('profiles').update({
      nickname: document.getElementById('ed-nickname').value.trim() || null,
      whatsapp: document.getElementById('ed-whatsapp').value.trim() || null,
      nationality: document.getElementById('ed-nationality').value || null,
      date_of_birth: dobToIso(document.getElementById('ed-dob').value),
      tshirt_size: document.getElementById('ed-tshirt').value || null,
      languages: getLangs(),
      share_name: document.getElementById('ed-share_name').checked,
      share_age: document.getElementById('ed-share_age').checked,
      share_languages: document.getElementById('ed-share_languages').checked,
      share_photo: document.getElementById('ed-share_photo').checked,
    }).eq('id', user.id);
    btn.disabled = false;
    btn.textContent = t('Save my details');
    if (error) {
      status(els.dashStatus, 'error', t('Could not save your details right now. Please try again.'));
      return;
    }
    status(els.dashStatus, 'success', t('Your details have been saved.'));
  });
}

async function renderNextCruises(user) {
  const nowIso = new Date().toISOString();
  const now = Date.now();
  const { data: regs, error } = await supabase
    .from('registrations')
    .select('seats, cruises(id, title, starts_at, ends_at, port_name, port_address, contact_number, what_to_bring, age_band, capacity)')
    .eq('user_id', user.id)
    .eq('status', 'registered');

  if (error) {
    els.nextCruise.innerHTML = `<p class="form-note">${t('Could not load your cruises right now.')}</p>`;
    return;
  }

  // "Cruises sailed" counter: registrations whose cruise has already ended.
  if (els.cruiseCount) {
    const done = (regs || []).filter((r) => {
      const c = r.cruises;
      if (!c) return false;
      const end = c.ends_at ? Date.parse(c.ends_at) : Date.parse(c.starts_at) + 3 * 3600 * 1000;
      return end < now;
    }).length;
    els.cruiseCount.textContent = done > 0
      ? (done > 1 ? t('{n} cruises sailed', { n: done }) : t('{n} cruise sailed', { n: done }))
      : t('Your first cruise awaits');
  }

  const upcoming = (regs || [])
    .filter((r) => r.cruises && r.cruises.starts_at >= nowIso)
    .sort((a, b) => a.cruises.starts_at.localeCompare(b.cruises.starts_at));

  if (!upcoming.length) {
    els.nextCruise.innerHTML = `<div class="way-card"><p>${t('No cruise booked yet. Reserve a seat below and it will appear here with your port, timing and everything to bring.')}</p></div>`;
    return;
  }

  const cards = await Promise.all(upcoming.map(async (r) => {
    const c = r.cruises;
    const [{ data: summary }, { data: roster }] = await Promise.all([
      supabase.rpc('cruise_guest_summary', { p_cruise_id: c.id }),
      supabase.rpc('cruise_roster', { p_cruise_id: c.id }),
    ]);
    const count = Number(summary?.[0]?.guest_count ?? 0);
    const countLine = count > 1
      ? t('You are {count} members on this cruise.', { count })
      : t('You are the first member aboard. More will join soon.');

    const others = roster || [];
    // Tooltip per booked icon: you first, then the guests who agreed to share.
    // Guests who kept their details private have no tooltip (just a plain icon).
    const people = ['You', ...others.map((o) => {
      const age = o.age ? `, ${o.age}` : '';
      const langs = o.languages && o.languages.length ? ` · ${langList(o.languages)}` : '';
      return `${o.display_name}${age}${langs}`;
    })];
    const rosterBlock = others.length
      ? `<div class="roster">
           <p class="roster-title">${t('On board with you')}</p>
           <ul>${others.map((o) => `
             <li>${o.photo_url ? `<img class="roster-avatar" src="${escapeHtml(o.photo_url)}" alt="" loading="lazy" />` : ''}<span><strong>${escapeHtml(o.display_name)}</strong>${o.age ? `, ${escapeHtml(o.age)}` : ''}${o.languages && o.languages.length ? ` <span class="roster-langs">${escapeHtml(langList(o.languages))}</span>` : ''}</span></li>`).join('')}
           </ul>
         </div>`
      : '';

    return `
      <div class="way-card featured next-cruise-card">
        <span class="eyebrow">${t('Next cruise')}</span>
        <h3>${escapeHtml(c.title)}</h3>
        <ul class="cruise-facts">
          <li><strong>${t('When')}</strong><span>${escapeHtml(formatDateTime(c.starts_at))}</span></li>
          <li><strong>${t('Port')}</strong><span>${escapeHtml(c.port_name)}</span></li>
          <li><strong>${t('Address')}</strong><span>${escapeHtml(c.port_address)}</span></li>
          <li><strong>${t('Day-of contact')}</strong><span><a href="https://wa.me/${escapeHtml((c.contact_number || '').replace(/[^0-9]/g, ''))}">${escapeHtml(c.contact_number)}</a></span></li>
          ${c.age_band ? `<li><strong>${t('Age group')}</strong><span>${escapeHtml(c.age_band)}</span></li>` : ''}
          <li><strong>${t('Your seats')}</strong><span>${escapeHtml(r.seats)}</span></li>
          ${c.what_to_bring ? `<li><strong>${t('What to bring')}</strong><span>${escapeHtml(c.what_to_bring)}</span></li>` : ''}
        </ul>
        ${seatIcons(count, c.capacity || 8, 0, people)}
        <p class="companions">${countLine}</p>
        ${rosterBlock}
      </div>`;
  }));

  els.nextCruise.innerHTML = cards.join('');
}

// Celebratory confirmation shown right after a guest reserves a seat.
function showJoinedModal(cruise, count = 0) {
  document.querySelector('.mc-modal')?.remove();
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
        <p class="joined-sub">${escapeHtml(cruise.title)}<br /><strong>${escapeHtml(formatDateTime(cruise.starts_at))}</strong><br />${escapeHtml(cruise.port_name)}</p>
        <p class="joined-count">${companions}</p>
        <p class="joined-note">${t('Everything you need, date, port and what to bring, plus who is aboard, is now in your account.')}</p>
        <button type="button" class="btn btn-primary" data-close>${t('Wonderful')}</button>
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

async function renderUpcoming(user) {
  const nowIso = new Date().toISOString();

  const [{ data: cruises }, { data: myRegs }] = await Promise.all([
    supabase.from('cruises').select('*').eq('status', 'open').gte('starts_at', nowIso).order('starts_at'),
    supabase.from('registrations').select('cruise_id').eq('user_id', user.id).eq('status', 'registered'),
  ]);

  const registeredIds = new Set((myRegs || []).map((r) => r.cruise_id));
  const available = (cruises || []).filter((c) => !registeredIds.has(c.id));

  if (!available.length) {
    els.upcoming.innerHTML = `<div class="way-card"><p>${t('No open departures right now. We will email you the moment a new cruise is scheduled.')}</p></div>`;
    return;
  }

  // Aggregate per cruise (no names): guests = distinct members (icons + roster),
  // seats = total seats reserved (seats left). Re-fetched on each visit.
  const counts = await Promise.all(
    available.map((c) =>
      supabase.rpc('cruise_guest_summary', { p_cruise_id: c.id })
        .then(({ data }) => ({
          guests: Number(data?.[0]?.guest_count ?? 0),
          seats: Number(data?.[0]?.seat_count ?? 0),
        }))
        .catch(() => ({ guests: 0, seats: 0 }))
    )
  );
  const byId = new Map(available.map((c) => [c.id, c]));

  els.upcoming.innerHTML = available.map((c, i) => `
    <div class="way-card" data-cruise="${escapeHtml(c.id)}">
      <h3>${escapeHtml(c.title)}</h3>
      <p class="way-price">${c.price_per_seat ? `AED ${escapeHtml(c.price_per_seat)} / ${t('seat')}` : t('By the seat')}</p>
      <ul class="cruise-facts">
        <li><strong>${t('When')}</strong><span>${escapeHtml(formatDateTime(c.starts_at))}</span></li>
        <li><strong>${t('Port')}</strong><span>${escapeHtml(c.port_name)}</span></li>
        ${c.age_band ? `<li><strong>${t('Age group')}</strong><span>${escapeHtml(c.age_band)}</span></li>` : ''}
        ${c.capacity ? `<li><strong>${t('Seats left')}</strong><span>${Math.max(0, c.capacity - counts[i].seats)}</span></li>` : ''}
      </ul>
      ${seatIcons(counts[i].guests, c.capacity || 8, 1)}
      <p class="companions">${madameLine(counts[i].guests)}</p>
      <div class="reserve-row">
        <label>${t('Seats')}
          <select class="seat-select">${Array.from({ length: Math.max(1, Math.min(c.capacity ? c.capacity - counts[i].seats : 8, 12)) }, (_, k) => `<option value="${k + 1}">${k + 1}</option>`).join('')}</select>
        </label>
        <button class="btn btn-primary reserve-btn" type="button">${t('Reserve my seat')}</button>
      </div>
    </div>`).join('');

  els.upcoming.querySelectorAll('.way-card').forEach((card, idx) => {
    const btn = card.querySelector('.reserve-btn');
    const sel = card.querySelector('.seat-select');
    const cap = (byId.get(card.dataset.cruise)?.capacity) || 8;
    // Live preview: picked seats light up in gold on the member icons.
    sel.addEventListener('change', () => {
      card.querySelector('.seat-icons').outerHTML = seatIcons(counts[idx].guests, cap, Number(sel.value));
    });
    btn.addEventListener('click', async () => {
      const cruiseId = card.dataset.cruise;
      const seats = Number(card.querySelector('.seat-select').value);
      btn.disabled = true;
      btn.textContent = t('Going to payment…');
      // Record their seat, then take payment on the live Stripe link.
      await supabase
        .from('registrations')
        .insert({ cruise_id: cruiseId, user_id: user.id, seats })
        .then(() => {}, () => {});
      const ref = encodeURIComponent(`${cruiseId}|${user.id}|${seats}`);
      const email = encodeURIComponent(user.email || '');
      window.location.href = `${PAYMENT_LINK}?client_reference_id=${ref}&prefilled_email=${email}`;
    });
  });
}

/* ---------- Boot ---------- */

// A guest who booked without setting a password has an account but no password
// yet. This lets them request a set-password link, and handles the recovery landing.
function initPasswordReset() {
  const form = els.signinForm;
  if (!form || form.dataset.resetBound) return;
  form.dataset.resetBound = '1';
  const link = document.createElement('button');
  link.type = 'button';
  link.className = 'auth-forgot';
  link.textContent = t('Booked already? Set or reset my password');
  form.appendChild(link);
  link.addEventListener('click', async () => {
    const email = (form.email.value || '').trim();
    if (!email) { status(els.authStatus, 'error', t('Type your email above first, then tap this again.')); return; }
    link.disabled = true;
    const orig = link.textContent; link.textContent = t('Sending…');
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}${langHref('/account.html')}` });
    link.disabled = false; link.textContent = orig;
    status(els.authStatus, error ? 'error' : 'success', error ? error.message : t('Link sent. Check your inbox, and your spam or promotions folder just in case.'));
  });
}

function renderSetPassword() {
  hide(els.loading); hide(els.dashView); show(els.authView);
  els.authView.innerHTML = `
    <div class="form-card" style="max-width:460px;margin-inline:auto;">
      <span class="eyebrow">${t('Almost there')}</span>
      <h2>${t('Set your password')}</h2>
      <p class="form-note">${t('Choose a password to manage your booking, see who is aboard and add your photo.')}</p>
      <form data-setpw class="auth-form">
        <div class="field"><label for="np-set">${t('New password')}</label>
          <input id="np-set" type="password" required minlength="6" autocomplete="new-password" /></div>
        <button class="btn btn-primary" type="submit">${t('Save my password')}</button>
        <p class="form-status" data-setpw-status role="status"></p>
      </form>
    </div>`;
  initPasswordToggles();
  const f = els.authView.querySelector('[data-setpw]');
  f.addEventListener('submit', async (event) => {
    event.preventDefault();
    const btn = f.querySelector('button'); const st = f.querySelector('[data-setpw-status]');
    btn.disabled = true; btn.textContent = t('Saving…');
    const { error } = await supabase.auth.updateUser({ password: f.querySelector('#np-set').value });
    if (error) { st.className = 'form-status error'; st.textContent = error.message; btn.disabled = false; btn.textContent = t('Save my password'); return; }
    const { data: { user } } = await supabase.auth.getUser();
    history.replaceState({}, '', langHref('/account.html'));
    if (user) await renderDashboard(user);
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------- Google sign-in ---------- */

// One-click Google OAuth. Google returns a verified email + name, so there is no
// confirmation email to chase. Age cannot come from Google, so an age
// attestation is still collected right after (see needsAttestation / showCompleteProfile).
function initGoogleAuth() {
  const btn = document.getElementById('google-auth');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}${langHref('/account.html')}` },
    });
    if (error) { btn.disabled = false; status(els.authStatus, 'error', authErrorMessage(error)); }
  });
}

// A member counts as eligible once they have confirmed they are 18+.
// Email/wizard signups set this at the point of consent; Google users have not
// yet, so they are routed through the one-step attestation below.
function needsAttestation(user) {
  return !(user && user.user_metadata && user.user_metadata.eligibility_confirmed);
}

// Shown after a Google sign-in when the age attestation is still missing.
// Nothing on the account works until they confirm; then we stamp their metadata,
// make sure a profile row exists, and drop them into the dashboard.
function showCompleteProfile(user) {
  hide(els.authView);
  hide(els.loading);
  const view = document.getElementById('complete-view');
  show(view);

  const form = document.getElementById('complete-form');
  if (!form || form.dataset.bound) return;
  form.dataset.bound = '1';
  const st = form.querySelector('[data-cp-status]');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!document.getElementById('cp-eligibility').checked) {
      status(st, 'error', t('Please confirm you are 18 or older to join.'));
      return;
    }
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = t('Saving…');

    const meta = user.user_metadata || {};
    const fullName = (meta.full_name || meta.name || '').trim();
    const nickname = document.getElementById('cp-nickname').value.trim() || null;

    const { error } = await supabase.auth.updateUser({
      data: { eligibility_confirmed: true, lang: LANG, full_name: fullName || undefined },
    });
    // Google users may not have a profile row yet; create or update it. Non-fatal.
    try {
      await supabase.from('profiles').upsert(
        { id: user.id, full_name: fullName || null, nickname },
        { onConflict: 'id' },
      );
    } catch { /* ignore, RLS or trigger may already own the row */ }

    btn.disabled = false;
    btn.textContent = t('Enter Bonjour Cruise');
    if (error) { status(st, 'error', authErrorMessage(error)); return; }

    hide(view);
    const { data: { user: fresh } } = await supabase.auth.getUser();
    await renderDashboard(fresh || user);
  });
}

async function boot() {
  // Capture the auth callback type BEFORE Supabase parses and clears the URL.
  // An email-confirmation link lands here as `#...&type=signup`, so we can greet
  // them with a real "your email is confirmed" moment instead of a silent dashboard.
  const authType = new URLSearchParams((location.hash || '').replace(/^#/, '')).get('type')
    || new URLSearchParams(location.search).get('type');
  const justConfirmed = authType === 'signup';

  initTabs();
  initSignup();
  initSignin();
  initSignout();
  initCountrySelect();
  initLanguagePicker();
  initPhotoPicker();
  initPasswordToggles();
  initShareToggle();
  initPasswordReset();
  initGoogleAuth();

  // When someone clicks a set-password / recovery link in their email, show the form.
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') renderSetPassword();
  });

  const { data: { session } } = await supabase.auth.getSession();
  hide(els.loading);
  if (session) {
    // Google sign-in cannot prove age: gate on the confirmation first.
    if (needsAttestation(session.user)) {
      showCompleteProfile(session.user);
      return;
    }
    await renderDashboard(session.user);
    // They just clicked the confirmation link in their email: thank them for real.
    if (justConfirmed) {
      showConfirmedModal(dashGreetName);
      history.replaceState({}, '', langHref('/account.html'));
    }
    // Returning from a successful Stripe payment.
    if (new URLSearchParams(location.search).get('booked') === '1') {
      showPaidModal();
      // The webhook books the seat a moment after payment; refresh a few times.
      let tries = 0;
      const poll = setInterval(async () => {
        tries += 1;
        await renderNextCruises(session.user);
        if (tries >= 5) clearInterval(poll);
      }, 2500);
      history.replaceState({}, '', langHref('/account.html'));
    }
  } else {
    show(els.authView);
  }
}

// Shown the instant someone taps the confirmation link in their email and lands here.
// This is the "thank you, your email is confirmed" moment they were missing.
function showConfirmedModal(name) {
  document.querySelector('.mc-modal')?.remove();
  const first = (name || '').trim();
  const hello = first && first.toLowerCase() !== 'there' ? `, ${escapeHtml(first)}` : '';
  const modal = document.createElement('div');
  modal.className = 'mc-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.innerHTML = `
    <div class="mc-modal-backdrop" data-close></div>
    <div class="mc-modal-card">
      <button class="mc-modal-close" type="button" aria-label="Close" data-close>&#10005;</button>
      <div class="joined">
        <span class="joined-mark" aria-hidden="true">&#127800;</span>
        <span class="eyebrow">${t('Email confirmed')}</span>
        <h2>${t('Thank you{hello}, your email is confirmed.', { hello })}</h2>
        <p class="joined-sub">${t('Welcome aboard Bonjour Cruise. Your account is now active.')}</p>
        <p class="joined-note">${t('You are all set. Your upcoming cruises, who is aboard and your photo are right here in your account.')}</p>
        <button type="button" class="btn btn-primary" data-close>${t('Wonderful')}</button>
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

// Generic celebration after a paid booking (we no longer hold the cruise object).
function showPaidModal() {
  document.querySelector('.mc-modal')?.remove();
  const modal = document.createElement('div');
  modal.className = 'mc-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.innerHTML = `
    <div class="mc-modal-backdrop" data-close></div>
    <div class="mc-modal-card">
      <button class="mc-modal-close" type="button" aria-label="Close" data-close>&#10005;</button>
      <div class="joined">
        <span class="joined-mark" aria-hidden="true">&#9875;</span>
        <span class="eyebrow">${t('Payment received')}</span>
        <h2>${t('You are confirmed for your cruise.')}</h2>
        <p class="joined-note">${t('Your seat is confirmed. Your cruise details and who is aboard are just below, in "Your next cruise".')}</p>
        <button type="button" class="btn btn-primary" data-close>${t('Wonderful')}</button>
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

boot();
