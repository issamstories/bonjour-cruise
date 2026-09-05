import { supabase } from './supabase.js';

/* ==========================================================================
   MADAME CRUISE, admin — Announce tab.
   Lets an admin email every registered member about the next cruises.
   Emails go out INDIVIDUALLY (one recipient per send) through the
   announce-cruises edge function — no member ever sees another's address.
   ========================================================================== */

const SITE_EMOJI = '🌸';

function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export async function renderAnnounceTab(view, { switchTab } = {}) {
  const session = (await supabase.auth.getSession()).data.session;
  if (!session) return;

  let counts = null;
  try {
    const { data, error } = await supabase.functions.invoke('announce-cruises', {
      body: { dry_run: true },
    });
    if (!error) counts = data;
  } catch { /* keep counts null */ }

  view.innerHTML = `
    <div class="admin-announce">
      <p class="admin-hello">Email every member about the next cruises.</p>
      <p class="form-note">Each member receives an individual email (no shared address list).</p>

      <label class="wiz-label" for="ann-subject">Subject (optional)</label>
      <input id="ann-subject" class="wiz-input" type="text"
        placeholder="Our next cruises are here 🌸" />

      <label class="wiz-label" for="ann-preview">Intro line (optional)</label>
      <textarea id="ann-preview" class="wiz-input" rows="3"
        placeholder="We have new ladies-only departures from Dubai Marina — reserve your seat before they go."></textarea>

      <div id="ann-status" class="form-status"></div>

      <button class="btn" id="ann-send" ${counts && counts.members === 0 ? 'disabled' : ''}>
        Send to everyone
      </button>
      ${counts
        ? `<p class="form-note">${esc(counts.members ?? 0)} members · ${esc(counts.cruises ?? 0)} upcoming cruises in the email.</p>`
        : '<p class="form-note">Recipient count will show once you press send.</p>'}
      <button class="btn btn-outline" id="ann-back" style="margin-left:8px">Back</button>
    </div>`;

  view.querySelector('#ann-back')?.addEventListener('click', () => switchTab && switchTab());
  view.querySelector('#ann-send')?.addEventListener('click', async () => {
    const status = view.querySelector('#ann-status');
    const btn = view.querySelector('#ann-send');
    const subject = view.querySelector('#ann-subject').value.trim();
    const preview = view.querySelector('#ann-preview').value.trim();
    btn.disabled = true;
    status.className = 'form-status';
    status.textContent = 'Sending…';

    try {
      const { data, error } = await supabase.functions.invoke('announce-cruises', {
        body: { subject: subject || undefined, preview: preview || undefined },
      });
      if (error) throw error;
      status.className = 'form-status success';
      status.textContent = `${SITE_EMOJI} ${data.sent} individual emails sent${data.failed ? `, ${data.failed} failed` : ''}.`;
    } catch (e) {
      status.className = 'form-status error';
      status.textContent = 'Could not send: ' + (e?.message || 'unknown error');
    } finally {
      btn.disabled = false;
    }
  });
}
