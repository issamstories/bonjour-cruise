import './main.js';
import { t } from './i18n.js';

/* ==========================================================================
   BONJOUR CRUISE, book page extras
   Adds a small "details" link to every optional add-on that opens a pretty
   pop-up with a photo and a short description. Pure progressive enhancement.
   ========================================================================== */

// value (matches the checkbox value in book.html) -> { img, desc }
// img is an existing asset stem under /assets/img/ or null for a soft placeholder.
const EXTRA_INFO = {
  // Celebration & decoration
  'Balloon arch': { img: 'celebration', desc: 'A lush arch of balloons in your colours, framing the deck for photos and the big entrance.' },
  'Balloon garland': { img: 'celebration', desc: 'An organic garland of balloons draped along the rails or bar, soft and elegant.' },
  'Custom-name balloons': { img: 'celebration', desc: 'Individual letter balloons spelling a name or a word, "BRIDE", a first name, "30", you choose.' },
  'Custom neon sign': { img: 'celebration', desc: 'A warm light-up sign with the name or phrase of your choice. The photo moment of the day.' },
  'Fresh flower styling': { img: 'celebration', desc: 'Fresh seasonal florals styled across the table and lounge, in blush and cream or your palette.' },
  'Flower bouquet for guest of honour': { img: 'celebration', desc: 'A hand-tied bouquet waiting on board for the guest of honour.' },
  'Celebration cake': { img: 'celebration', desc: 'A custom cake, halal, made to your flavour and design, with their name if you like.' },
  'Sash and tiara': { img: 'celebration', desc: 'A satin sash and tiara so the guest of honour shines from the first step on deck.' },
  'Photo backdrop': { img: 'celebration', desc: 'A styled backdrop with props for endless photos and reels with the skyline behind you.' },
  'Confetti or sparkler moment': { img: 'celebration', desc: 'A safe, crew-handled confetti or sparkler moment for the toast or the big reveal.' },
  'Gift bags and favours': { img: 'celebration', desc: 'A little something for each guest to take home, curated and wrapped, priced per bag.' },
  'Personalised robes': { img: 'celebration', desc: 'Soft robes embroidered with each name, perfect for the spa and the photos. Priced per robe.' },
  'Full glam decoration': { img: 'celebration', desc: 'The complete styling package: balloons, florals, table, signage and props, all done for you.' },

  // Beauty & glam
  'Makeup artist': { img: 'henna-spa', desc: 'A professional makeup artist on board for the guest of honour or the whole group.' },
  'Hair styling': { img: 'henna-spa', desc: 'A hairstylist for blow-dries and styling, so everyone looks their best for photos.' },
  'Hijab styling': { img: 'henna-spa', desc: 'Elegant hijab styling by a specialist, draping and pinning to match your look.' },
  'Lashes and brows': { img: 'henna-spa', desc: 'A quick lash and brow touch-up on board so you feel camera-ready.' },

  // Relaxation & wellness
  'Henna artist': { img: 'henna-spa', desc: 'A henna artist creates delicate designs while you sail, a beautiful keepsake of the day.' },
  'Massage therapist': { img: 'henna-spa', desc: 'A massage therapist offers relaxing treatments in a private corner of the deck.' },
  'Mani and pedi': { img: 'henna-spa', desc: 'On-board manicure and pedicure so you step off polished and pampered.' },
  'Facial and skincare ritual': { img: 'henna-spa', desc: 'A refreshing facial and skincare ritual with the sea breeze around you.' },
  'Yoga or stretch at anchor': { img: 'henna-spa', desc: 'A gentle guided yoga or stretch session while the yacht rests at anchor.' },
  'Sound bath and meditation': { img: 'henna-spa', desc: 'A calming sound bath and guided meditation, the most peaceful moment on the water.' },

  // Food & drinks
  'Mocktail bar': { img: 'mocktails', desc: 'A bar of fresh, alcohol-free signature mocktails, mixed to order on board.' },
  'Smoothie and juice bar': { img: 'mocktails', desc: 'Cold-pressed juices and smoothies, fresh and healthy, made throughout the cruise.' },
  'Fresh fruit platter': { img: 'sunset-brunch', desc: 'A generous platter of seasonal fruit, beautifully arranged.' },
  'Cheese platter': { img: 'sunset-brunch', desc: 'A curated cheese board with crackers, nuts and fruit.' },
  'Mezze and cold-cut platter': { img: 'sunset-brunch', desc: 'A halal mezze and cold-cut spread, perfect to share while you sail.' },
  'Sushi platter': { img: 'sunset-brunch', desc: 'A fresh sushi and maki platter, elegantly presented.' },
  'Gourmet brunch spread': { img: 'sunset-brunch', desc: 'A full gourmet brunch, savoury and sweet, the centrepiece of a sunset cruise.' },
  'Afternoon tea': { img: 'sunset-brunch', desc: 'A dainty afternoon tea with pastries, scones and fine teas.' },
  'Dessert and patisserie tower': { img: 'sunset-brunch', desc: 'A tower of French-style patisserie and desserts to wow the table.' },
  'Chocolate fondue': { img: 'sunset-brunch', desc: 'Warm chocolate fondue with fruit and treats to dip, a playful sweet moment.' },
  'Healthy bowls': { img: 'sunset-brunch', desc: 'Fresh, balanced bowls for those who like to eat light and clean.' },
  'Arabic coffee and dates': { img: 'mocktails', desc: 'Traditional Arabic coffee served with premium dates, a warm welcome on board.' },

  // Entertainment
  'Live singer or oud': { img: 'day-cruise', desc: 'A live singer or oud player to set the mood, soulful and intimate.' },
  'DJ': { img: 'day-cruise', desc: 'A DJ spinning your vibe so everyone can dance freely, all afternoon.' },
  'Dance class': { img: 'day-cruise', desc: 'A fun on-board dance class, dabke, latin or whatever your group fancies.' },
  'Games and cards': { img: 'day-cruise', desc: 'Party games and cards to keep the laughter going between swims.' },

  // Content & keepsakes
  'Photographer': { img: 'day-cruise', desc: 'A professional photographer captures the day. Every photo belongs to you alone.' },
  'Reels and content creator': { img: 'day-cruise', desc: 'A creator shoots and edits ready-to-post reels of your cruise.' },
  'Polaroid corner': { img: 'day-cruise', desc: 'Instant Polaroid photos to take home from the day, a lovely keepsake.' },
  'Printed photo album': { img: 'day-cruise', desc: 'A printed album of your cruise, delivered after the day.' },
};

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

function showExtraModal(value, priceText, checkbox) {
  document.querySelector('.mc-modal')?.remove();
  const info = EXTRA_INFO[value] || { img: null, desc: '' };
  const media = info.img
    ? `<div class="extra-img" style="background-image:url('/assets/img/${info.img}.webp');"></div>`
    : `<div class="extra-img extra-img--ph" aria-hidden="true">&#9875;</div>`;

  const modal = el(`
    <div class="mc-modal" role="dialog" aria-modal="true">
      <div class="mc-modal-backdrop" data-close></div>
      <div class="mc-modal-card extra-card">
        <button class="mc-modal-close" type="button" aria-label="${t('Close')}" data-close>&#10005;</button>
        ${media}
        <span class="eyebrow">${esc(priceText)}</span>
        <h2 class="extra-title">${esc(t(value))}</h2>
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

  const close = () => {
    modal.classList.remove('is-open');
    document.body.style.overflow = '';
    setTimeout(() => modal.remove(), 300);
  };
  modal.querySelectorAll('[data-close]').forEach((n) => n.addEventListener('click', close));
  modal.querySelector('[data-add]').addEventListener('click', () => {
    if (checkbox) checkbox.checked = true;
    close();
  });
}

function initExtraDetails() {
  document.querySelectorAll('.addon-grid label').forEach((label) => {
    if (label.querySelector('.addon-info')) return;
    const checkbox = label.querySelector('input[type="checkbox"]');
    if (!checkbox) return;
    const value = checkbox.value;
    if (!EXTRA_INFO[value]) return;
    const priceText = label.querySelector('span')?.textContent || '';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'addon-info';
    btn.textContent = t('details');
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showExtraModal(value, priceText, checkbox);
    });
    label.appendChild(btn);
  });
}

initExtraDetails();
