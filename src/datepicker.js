/* ==========================================================================
   BONJOUR CRUISE — feminine date picker
   Native <input type="date"> popups are rendered by the OS/browser and cannot
   be styled. We keep the input (so the value stays ISO, `required` still works
   and forms submit unchanged) but suppress the native popup and open our own
   on-brand calendar instead. Auto-enhances every input[type="date"] on the page.
   ========================================================================== */

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const pad = (n) => String(n).padStart(2, '0');
const todayIso = () => {
  const t = new Date();
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
};

// Resolve a min/max attribute, treating "today" as a dynamic bound.
function bound(input, attr) {
  const dataVal = input.dataset[attr]; // data-min / data-max
  if (dataVal === 'today') return todayIso();
  return input.getAttribute(attr) || dataVal || '';
}

function enhance(input) {
  if (input.dataset.mcDate) return;
  input.dataset.mcDate = '1';
  input.setAttribute('autocomplete', 'off');

  // Anchor wrapper so the popup can position under the field.
  const wrap = document.createElement('div');
  wrap.className = 'mc-date-wrap';
  input.parentNode.insertBefore(wrap, input);
  wrap.appendChild(input);

  const cal = document.createElement('div');
  cal.className = 'mc-cal';
  cal.hidden = true;
  wrap.appendChild(cal);

  const min = () => bound(input, 'min');
  const max = () => bound(input, 'max');

  // View state: month currently shown. Seed from the value, else today.
  let view;
  function seedView() {
    const base = input.value || todayIso();
    const [y, m] = base.split('-').map(Number);
    view = { y, m: m - 1 };
  }
  seedView();

  function render() {
    const minV = min();
    const maxV = max();
    const sel = input.value;
    const first = new Date(view.y, view.m, 1).getDay(); // 0=Sun
    const days = new Date(view.y, view.m + 1, 0).getDate();

    let cells = '';
    for (let i = 0; i < first; i += 1) cells += '<span class="mc-cal-pad"></span>';
    for (let d = 1; d <= days; d += 1) {
      const iso = `${view.y}-${pad(view.m + 1)}-${pad(d)}`;
      const disabled = (minV && iso < minV) || (maxV && iso > maxV);
      const classes = ['mc-cal-day'];
      if (iso === sel) classes.push('is-selected');
      if (iso === todayIso()) classes.push('is-today');
      cells += `<button type="button" class="${classes.join(' ')}" data-iso="${iso}"${disabled ? ' disabled' : ''}>${d}</button>`;
    }

    // Fast month + year dropdowns (no more clicking arrows 37 times to reach 1989).
    const nowY = new Date().getFullYear();
    const topY = maxV ? Number(maxV.slice(0, 4)) : nowY;
    const botY = minV ? Number(minV.slice(0, 4)) : nowY - 100;
    let yearOpts = '';
    for (let y = topY; y >= botY; y -= 1) yearOpts += `<option value="${y}"${y === view.y ? ' selected' : ''}>${y}</option>`;
    const monthOpts = MONTHS.map((m, i) => `<option value="${i}"${i === view.m ? ' selected' : ''}>${m}</option>`).join('');

    cal.innerHTML = `
      <div class="mc-cal-head">
        <button type="button" class="mc-cal-nav" data-step="-1" aria-label="Previous month">&#8249;</button>
        <select class="mc-cal-select" data-cal-month aria-label="Month">${monthOpts}</select>
        <select class="mc-cal-select" data-cal-year aria-label="Year">${yearOpts}</select>
        <button type="button" class="mc-cal-nav" data-step="1" aria-label="Next month">&#8250;</button>
      </div>
      <div class="mc-cal-dow">${DOW.map((d) => `<span>${d}</span>`).join('')}</div>
      <div class="mc-cal-days">${cells}</div>
      <div class="mc-cal-foot">
        <button type="button" class="mc-cal-link mc-cal-clear">Clear</button>
        <button type="button" class="mc-cal-link mc-cal-today">Today</button>
      </div>`;
  }

  function open() {
    seedView();
    render();
    cal.hidden = false;
    wrap.classList.add('is-open');
  }
  function close() {
    cal.hidden = true;
    wrap.classList.remove('is-open');
  }
  const isOpen = () => !cal.hidden;

  function setValue(iso) {
    input.value = iso;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // Open our calendar on focus, but keep the field typeable (she can key the
  // date in directly). The native OS popup is hidden via CSS so only ours shows.
  input.addEventListener('focus', open);
  input.addEventListener('keydown', (e) => {
    if (['Enter', 'ArrowDown'].includes(e.key)) { e.preventDefault(); open(); }
    else if (e.key === 'Escape') close();
  });

  // Fast month / year jump via the header dropdowns.
  cal.addEventListener('change', (e) => {
    const my = e.target.closest('[data-cal-month]');
    const yr = e.target.closest('[data-cal-year]');
    if (my) { view.m = Number(my.value); render(); }
    else if (yr) { view.y = Number(yr.value); render(); }
  });

  cal.addEventListener('click', (e) => {
    const nav = e.target.closest('.mc-cal-nav');
    if (nav) {
      const step = Number(nav.dataset.step);
      const next = new Date(view.y, view.m + step, 1);
      view = { y: next.getFullYear(), m: next.getMonth() };
      render();
      return;
    }
    const day = e.target.closest('.mc-cal-day');
    if (day && !day.disabled) { setValue(day.dataset.iso); close(); return; }
    if (e.target.closest('.mc-cal-today')) {
      const t = todayIso();
      if ((!min() || t >= min()) && (!max() || t <= max())) { setValue(t); close(); }
      return;
    }
    if (e.target.closest('.mc-cal-clear')) { setValue(''); close(); }
  });

  document.addEventListener('mousedown', (e) => {
    if (isOpen() && !wrap.contains(e.target)) close();
  });
}

function init() {
  document.querySelectorAll('input[type="date"]').forEach(enhance);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
