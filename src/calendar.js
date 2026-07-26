/* ==========================================================================
   MADAME CRUISE, shared month calendar
   A month grid that drops a little boat marker on every day that has a
   departure, with a clear "seats booked / capacity" label and a fill bar.
   Colour is never the only signal (Issam is colour-blind): every state also
   carries text and a bar length.
   ========================================================================== */

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Local YYYY-MM-DD key for a Date (avoids UTC off-by-one at midnight).
export function dayKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// A small boat sitting on water, sized to a marker.
function boatSvg() {
  return `<svg viewBox="0 0 40 26" width="34" height="22" aria-hidden="true">
    <path d="M4 17h32l-3 5H7z" fill="#C98A8E"/>
    <rect x="19" y="5" width="2" height="8" fill="#1C2B4A"/>
    <path d="M21 6l7 4-7 3z" fill="#FBF5EF" stroke="#C9A86A" stroke-width="0.6"/>
    <path d="M18 10l-6 3 6 1z" fill="#E9C9CB"/>
  </svg>`;
}

// Marker for a day that has one or more departures.
function dayMarker(dayCruises) {
  const totalCap = dayCruises.reduce((s, c) => s + Number(c.capacity || 0), 0);
  const totalBooked = dayCruises.reduce((s, c) => s + Number(c.booked || 0), 0);
  const remaining = Math.max(0, totalCap - totalBooked);
  const ratio = totalCap ? Math.min(1, totalBooked / totalCap) : 0;
  const state = remaining <= 0 ? 'full' : ratio >= 0.75 ? 'filling' : 'open';
  const label = remaining <= 0 ? 'Full' : `${remaining} left`;
  const count = dayCruises.length > 1 ? `<span class="cal-count">${dayCruises.length}</span>` : '';
  return `
    <div class="cal-marker is-${state}">
      ${boatSvg()}${count}
      <span class="cal-seats">${totalBooked}/${totalCap}</span>
      <span class="cal-left">${label}</span>
      <span class="cal-bar"><i style="inline-size:${Math.round(ratio * 100)}%"></i></span>
    </div>`;
}

/**
 * Mount a calendar.
 * @param {HTMLElement} mount
 * @param {object} opts
 * @param {Array} opts.cruises  each: { id, starts_at, capacity, booked, ... }
 * @param {(dateStr:string, dayCruises:Array)=>void} opts.onSelectDay
 * @param {Date} [opts.initial]  month to open on (defaults to today)
 */
export function createCalendar(mount, opts) {
  const cruises = opts.cruises || [];
  const byDay = new Map();
  cruises.forEach((c) => {
    const k = dayKey(new Date(c.starts_at));
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push(c);
  });

  let shown = opts.initial ? new Date(opts.initial) : new Date();
  shown = new Date(shown.getFullYear(), shown.getMonth(), 1);
  const todayKey = dayKey(new Date());

  function render() {
    const year = shown.getFullYear();
    const month = shown.getMonth();
    const first = new Date(year, month, 1);
    // Monday-first offset.
    const offset = (first.getDay() + 6) % 7;
    const daysIn = new Date(year, month + 1, 0).getDate();

    const cells = [];
    for (let i = 0; i < offset; i += 1) cells.push('<div class="cal-cell is-empty"></div>');
    for (let d = 1; d <= daysIn; d += 1) {
      const date = new Date(year, month, d);
      const k = dayKey(date);
      const dayCruises = byDay.get(k) || [];
      const has = dayCruises.length > 0;
      const isPast = k < todayKey;
      const cls = ['cal-cell'];
      if (has) cls.push('has-cruise');
      if (k === todayKey) cls.push('is-today');
      if (isPast) cls.push('is-past');
      cells.push(`
        <button type="button" class="${cls.join(' ')}" data-day="${k}" ${has ? '' : 'tabindex="-1"'}>
          <span class="cal-date">${d}</span>
          ${has ? dayMarker(dayCruises) : ''}
        </button>`);
    }

    mount.innerHTML = `
      <div class="cal">
        <div class="cal-head">
          <button type="button" class="cal-nav" data-prev aria-label="Previous month">‹</button>
          <p class="cal-title">${MONTH_NAMES[month]} ${year}</p>
          <button type="button" class="cal-nav" data-next aria-label="Next month">›</button>
        </div>
        <div class="cal-dow">${DOW.map((d) => `<span>${d}</span>`).join('')}</div>
        <div class="cal-grid">${cells.join('')}</div>
      </div>`;

    mount.querySelector('[data-prev]').addEventListener('click', () => { shown = new Date(year, month - 1, 1); render(); });
    mount.querySelector('[data-next]').addEventListener('click', () => { shown = new Date(year, month + 1, 1); render(); });
    mount.querySelectorAll('[data-day]').forEach((btn) => {
      const k = btn.dataset.day;
      const dayCruises = byDay.get(k) || [];
      btn.addEventListener('click', () => opts.onSelectDay?.(k, dayCruises));
    });
  }

  render();
  return { refresh: render };
}
