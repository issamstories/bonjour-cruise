import './styles.css';
import './member.js';
import { COUNTRIES } from './data.js';
import { araDigits, t } from './i18n.js';
import { supabase } from './supabase.js';

/* JS is available: flag <html class="js"> so CSS can gate progressive
   enhancements (scroll-reveal starts hidden only when JS can reveal it). */
document.documentElement.classList.add('js');

/* ==========================================================================
   BONJOUR CRUISE, site behavior
   No frameworks: small vanilla modules, each guarded so every page can load
   the same bundle safely.
   ========================================================================== */

/* ---------- Mobile navigation ---------- */

function initNav() {
  const toggle = document.querySelector('.nav-toggle');
  const menu = document.querySelector('.mobile-menu');
  if (!toggle || !menu) return;

  toggle.addEventListener('click', () => {
    const open = menu.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
  });
}

/* ---------- Scroll reveal (IntersectionObserver, no libraries) ---------- */

function initReveal() {
  const targets = document.querySelectorAll('.reveal');
  if (!targets.length) return;

  if (!('IntersectionObserver' in window)) {
    targets.forEach((el) => el.classList.add('visible'));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
  );

  targets.forEach((el) => observer.observe(el));
}

/* ---------- Testimonials carousel ---------- */

function initCarousel() {
  const carousel = document.querySelector('.carousel');
  if (!carousel) return;

  const slides = carousel.querySelectorAll('.testimonial');
  const dots = carousel.querySelectorAll('.carousel-dots button');

  // The homepage ships an empty, hidden social-proof carousel waiting for real
  // guest quotes. With no slides, or with fewer dots than slides, show() would
  // read undefined and throw on the first auto-advance, taking the rest of the
  // page's JS down with it. Nothing to rotate means nothing to do.
  if (slides.length < 2 || dots.length < slides.length) return;

  let current = 0;
  let timer;

  function show(index) {
    slides[current].classList.remove('active');
    dots[current].setAttribute('aria-pressed', 'false');
    current = index;
    slides[current].classList.add('active');
    dots[current].setAttribute('aria-pressed', 'true');
  }

  function next() {
    show((current + 1) % slides.length);
  }

  function startAuto() {
    timer = setInterval(next, 6000);
  }

  dots.forEach((dot, i) => {
    dot.addEventListener('click', () => {
      clearInterval(timer);
      show(i);
      startAuto();
    });
  });

  startAuto();
}

/* ---------- Booking form prefill ---------- */
/* "Request this cruise" buttons link to book.html?experience=<value>;
   we preselect that experience in the form. */

function initPrefill() {
  const params = new URLSearchParams(window.location.search);
  const requestedExp = params.get('experience');
  const requestedBooking = params.get('booking');

  const expSelect = document.querySelector('select[name="experience"]');
  if (expSelect && requestedExp) {
    const option = expSelect.querySelector(`option[value="${CSS.escape(requestedExp)}"]`);
    if (option) expSelect.value = requestedExp;
  }

  // ?booking=seat preselects the shared-cruise mode and reveals the seats field.
  const typeSelect = document.querySelector('select[name="booking-type"]');
  if (typeSelect && requestedBooking === 'seat') {
    typeSelect.value = 'seat';
    typeSelect.dispatchEvent(new Event('change'));
  }

  if (requestedExp || requestedBooking) {
    document.querySelector('form[data-netlify="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

/* Booking type toggle: private charter shows group size, by-the-seat shows seats. */

function initBookingType() {
  const select = document.querySelector('select[name="booking-type"]');
  if (!select) return;

  const seatField = document.querySelector('[data-seat-field]');
  const groupField = document.querySelector('[data-group-field]');
  const privateExtras = document.querySelector('[data-private-extras]');

  const apply = () => {
    const bySeat = select.value === 'seat';
    if (seatField) seatField.hidden = !bySeat;
    if (groupField) groupField.hidden = bySeat;
    // Add-ons (henna, decoration, platters…) only apply to a private charter.
    if (privateExtras) privateExtras.hidden = bySeat;
  };

  select.addEventListener('change', apply);
  apply();
}

/* ---------- Form submission: Supabase edge function (Brevo) ---------- */

// The contact form POSTs to the Supabase edge function contact-form, which
// emails the brand inbox via Brevo. This works on Cloudflare Pages (no
// Netlify Forms dependency) and on any static host.

const FORM_SITE_NAME = 'Bonjour Cruise';

async function sendViaEdgeFunction(form) {
  const fields = Object.fromEntries(new FormData(form).entries());
  const { data, error } = await supabase.functions.invoke('contact-form', {
    body: {
      site_name: FORM_SITE_NAME,
      first_name: fields.first_name || '',
      last_name: fields.last_name || '',
      email: fields.email || '',
      whatsapp: fields.whatsapp || '',
      subject: fields.subject || 'Website enquiry',
      message: fields.message || fields.enquiry || '',
    },
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error || t('Send failed'));
}

function initForms() {
  document.querySelectorAll('form[data-netlify="true"]').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      const status = form.parentElement.querySelector('.form-status');
      const submitBtn = form.querySelector('button[type="submit"]');
      const originalLabel = submitBtn.textContent;
      // Disabled for the whole round trip: no double submission, and the label
      // change is the loading feedback.
      submitBtn.disabled = true;
      submitBtn.textContent = t('Sending…');

      try {
        await sendViaEdgeFunction(form);
        showStatus(status, 'success', form.dataset.successMessage);
        form.reset();
      } catch (err) {
        showStatus(status, 'error', null);
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalLabel;
      }
    });
  });
}

// Pre-filled WhatsApp thread offered whenever a form fails to send. A broken
// submit must never be a dead end: the lead leaves through WhatsApp instead.
const WHATSAPP_FALLBACK_LINK =
  'https://wa.me/971585986118?text=' +
  encodeURIComponent(
    'Hello Bonjour Cruise, the contact form on your site did not go through. Here is my question:',
  );

function showStatus(statusEl, type, successMessage) {
  if (!statusEl) return;
  statusEl.className = `form-status ${type}`;

  if (type === 'success') {
    statusEl.textContent =
      successMessage ||
      t('Thank you. Your request is on its way, we will reply on WhatsApp within a few hours.');
  } else {
    // Build with the DOM rather than innerHTML: the message is static, but the
    // status element is also used for server-provided text elsewhere.
    statusEl.textContent = t('Something went wrong sending your request. Message us on WhatsApp instead and we will take care of you right away:') + ' ';
    const link = document.createElement('a');
    link.href = WHATSAPP_FALLBACK_LINK;
    link.rel = 'noopener';
    link.textContent = t('open WhatsApp');
    statusEl.appendChild(link);
  }

  statusEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* ---------- Country dropdown (contact form) ---------- */

// Turn a 2-letter ISO code into its flag emoji.
function flagEmoji(code) {
  return code.toUpperCase().replace(/./g, (ch) => String.fromCodePoint(127397 + ch.charCodeAt(0)));
}

// Populate any [data-country-select] with every country and its flag.
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

/* ---------- Footer year ---------- */

function initYear() {
  const year = document.querySelector('[data-year]');
  if (year) year.textContent = araDigits(new Date().getFullYear());
}

/* ---------- Boot ---------- */

initNav();
initReveal();
initCarousel();
initBookingType();
initPrefill();
initForms();
initCountrySelect();
initYear();
/* initHeaderShadow is provided by member.js (shared across every page) */
