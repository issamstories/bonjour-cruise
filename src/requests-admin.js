// ============================================================================
// Booking requests module for the admin dashboard.
// Lists pending/approved/rejected requests; Approve generates a Stripe Payment
// Link via the approve-booking edge function and emails the guest; Reject
// emails a polite decline via reject-booking.
// ============================================================================

export async function renderRequestsTab(root, { switchTab }) {
  const { supabase } = await import('./supabase.js');
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { location.reload(); return; }

  // Permissions of the signed-in user
  const { data: me } = await supabase
    .from('profiles').select('is_master, is_admin, admin_permissions').eq('id', session.user.id).single();
  const perms = new Set(me?.admin_permissions || []);
  if (me?.is_master) perms.add('master');
  const canView = me?.is_master || perms.has('master') || perms.has('requests');
  const canApprove = me?.is_master || perms.has('master') || perms.has('approve');

  root.innerHTML = `
    <div class="admin-top">
      <p class="admin-hello" data-count>Loading requests…</p>
      <button class="btn btn-outline btn-small" data-signout>Sign out</button>
    </div>
    <div class="admin-tabs">
      <button class="admin-tab" data-tab="calendar">Calendar</button>
      <button class="admin-tab admin-tab-active" data-tab="requests">Requests</button>
      ${me?.is_master || perms.has('team') || perms.has('master') ? '<button class="admin-tab" data-tab="team">Team</button>' : ''}
    </div>
    <div data-requests></div>`;

  root.querySelector('[data-signout]').addEventListener('click', async () => {
    await supabase.auth.signOut();
    location.reload();
  });
  root.querySelector('[data-tab="calendar"]').addEventListener('click', () => switchTab('calendar'));
  const teamBtn = root.querySelector('[data-tab="team"]');
  if (teamBtn) teamBtn.addEventListener('click', async () => {
    const { renderTeamTab } = await import('./team-admin.js');
    renderTeamTab(root, { switchTab: () => location.reload() });
  });

  if (!canView) {
    root.querySelector('[data-count]').textContent = 'No access';
    root.querySelector('[data-requests]').innerHTML =
      '<p class="form-status error">You do not have permission to view requests. Ask the master admin to grant the "View requests" access.</p>';
    return;
  }

  const { data, error } = await supabase
    .from('booking_requests')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) {
    root.querySelector('[data-requests]').innerHTML = `<p class="form-status error">Could not load requests: ${error.message}</p>`;
    return;
  }

  const pending = (data || []).filter((r) => r.status === 'pending');
  const done = (data || []).filter((r) => r.status !== 'pending');
  root.querySelector('[data-count]').textContent =
    `${pending.length} pending · ${done.length} processed`;

  root.querySelector('[data-requests]').innerHTML = `
    ${pending.length ? `<h3 class="admin-section">Pending</h3>${pending.map((r) => requestCard(r, canApprove)).join('')}`
      : '<p class="form-note">No pending requests. New bookings will appear here.</p>'}
    ${done.length ? `<h3 class="admin-section" style="margin-top:28px;">Processed</h3>${done.map((r) => requestCard(r, false)).join('')}` : ''}`;

  root.querySelectorAll('[data-approve]').forEach((btn) =>
    btn.addEventListener('click', () => approve(root, btn.dataset.approve)));
  root.querySelectorAll('[data-reject]').forEach((btn) =>
    btn.addEventListener('click', () => reject(root, btn.dataset.reject)));
}

function fmtWhen(iso) {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dubai',
    }).format(new Date(iso));
  } catch { return iso; }
}

function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function requestCard(r, actionable) {
  const statusClass = { pending: 'pending', approved: 'ok', rejected: 'muted', paid: 'ok' }[r.status] || '';
  return `
    <div class="admin-request" data-request="${r.id}">
      <div class="admin-request-head">
        <strong>${esc(r.first_name)} ${esc(r.last_name || '')}</strong>
        <span class="admin-request-status ${statusClass}">${esc(r.status)}</span>
        <span class="admin-request-ref">#${esc(r.id.slice(0, 6).toUpperCase())}</span>
      </div>
      <div class="admin-request-meta">
        <span>📅 ${esc(fmtWhen(r.requested_date))}</span>
        <span>👥 ${r.seats} ${r.seats > 1 ? 'guests' : 'guest'}</span>
        ${r.whatsapp ? `<span>📱 ${esc(r.whatsapp)}</span>` : ''}
      </div>
      <div class="admin-request-meta">
        <span>✉️ <a href="mailto:${esc(r.email)}">${esc(r.email)}</a></span>
        <span>🕘 ${esc(fmtWhen(r.created_at))}</span>
      </div>
      ${r.guests_note ? `<p class="admin-request-note">${esc(r.guests_note)}</p>` : ''}
      ${r.payment_link ? `<p class="admin-request-link"><a href="${esc(r.payment_link)}" target="_blank" rel="noopener">🔗 Payment link</a></p>` : ''}
      ${actionable ? `
        <div class="admin-inline" style="margin-top:10px;">
          <button class="btn btn-primary btn-small" data-approve="${r.id}">Approve &amp; send payment link</button>
          <button class="btn btn-outline btn-small" data-reject="${r.id}">Reject</button>
        </div>` : ''}
    </div>`;
}

async function approve(root, id) {
  const btn = root.querySelector(`[data-approve="${id}"]`);
  if (!btn) return;
  btn.disabled = true; btn.textContent = 'Creating payment link…';
  try {
    const { supabase } = await import('./supabase.js');
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not signed in.');
    const siteName = document.title.includes('Madame') ? 'Madame Cruise' : 'Bonjour Cruise';
    const { data, error } = await supabase.functions.invoke('approve-booking', {
      body: { request_id: id, site_name: siteName },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    // Refresh the list.
    renderRequestsTab(root, { switchTab: () => location.reload() });
  } catch (e) {
    btn.disabled = false; btn.textContent = 'Approve &amp; send payment link';
    alert(`Could not approve: ${e.message}`);
  }
}

async function reject(root, id) {
  const reason = prompt('Reason to send to the guest (optional, shown in the email):');
  if (reason === null) return; // cancelled
  const btn = root.querySelector(`[data-reject="${id}"]`);
  if (!btn) return;
  btn.disabled = true; btn.textContent = 'Rejecting…';
  try {
    const { supabase } = await import('./supabase.js');
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not signed in.');
    const siteName = document.title.includes('Madame') ? 'Madame Cruise' : 'Bonjour Cruise';
    const { data, error } = await supabase.functions.invoke('reject-booking', {
      body: { request_id: id, reason, site_name: siteName },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    renderRequestsTab(root, { switchTab: () => location.reload() });
  } catch (e) {
    btn.disabled = false; btn.textContent = 'Reject';
    alert(`Could not reject: ${e.message}`);
  }
}
