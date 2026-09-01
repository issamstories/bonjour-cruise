// ============================================================================
// Team management for the admin dashboard (master only).
// Lists every admin, shows their permissions as checkboxes, lets the master
// toggle permissions live. Non-masters see a read-only view.
// ============================================================================

const PERMS = [
  { id: 'cruises', label: 'Manage cruises', desc: 'Create departures, set prices, capacity, status' },
  { id: 'requests', label: 'View requests', desc: 'See booking requests: names, emails, phones' },
  { id: 'approve', label: 'Approve & reject', desc: 'Validate requests, generate Stripe payment links, email guests' },
];

export async function renderTeamTab(root, { switchTab }) {
  const { supabase } = await import('./supabase.js');
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { location.reload(); return; }

  // Who am I?
  const { data: me } = await supabase
    .from('profiles').select('is_master, is_admin, admin_permissions').eq('id', session.user.id).single();
  const isMaster = !!me?.is_master || (me?.admin_permissions || []).includes('master');

  root.innerHTML = `
    <div class="admin-top">
      <p class="admin-hello">Team access${isMaster ? '' : ' (read-only)'}</p>
      <button class="btn btn-outline btn-small" data-signout>Sign out</button>
    </div>
    <div class="admin-tabs">
      <button class="admin-tab" data-tab="calendar">Calendar</button>
      <button class="admin-tab" data-tab="requests">Requests</button>
      <button class="admin-tab admin-tab-active" data-tab="team">Team</button>
    </div>
    <div data-team></div>`;

  root.querySelector('[data-signout]').addEventListener('click', async () => {
    await supabase.auth.signOut(); location.reload();
  });
  root.querySelector('[data-tab="calendar"]').addEventListener('click', () => switchTab('calendar'));
  root.querySelector('[data-tab="requests"]').addEventListener('click', () => switchTab('requests'));

  // All admins (masters + admins). Uses the 'team' permission path: masters
  // can read all profiles; this select is filtered to admin rows.
  const { data: admins, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, is_admin, is_master, admin_permissions')
    .or(`is_admin.eq.true,is_master.eq.true`)
    .order('is_master', { ascending: false });
  if (error) {
    root.querySelector('[data-team]').innerHTML = `<p class="form-status error">Could not load team: ${error.message}</p>`;
    return;
  }

  const rows = (admins || []).map((a) => teamCard(a, isMaster)).join('');
  root.querySelector('[data-team]').innerHTML = rows || '<p class="form-note">No admin accounts yet.</p>';

  if (isMaster) {
    root.querySelectorAll('[data-perm]').forEach((cb) =>
      cb.addEventListener('change', () => setPerm(cb.dataset.perm, cb.dataset.user, cb.checked)));
  }
}

function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function teamCard(a, isMaster) {
  const perms = a.admin_permissions || [];
  const isMe = false; // highlight handled by caller if needed
  const boxes = PERMS.map((p) => {
    const checked = a.is_master || perms.includes('master') || perms.includes(p.id);
    return `
      <label class="team-perm">
        <input type="checkbox" data-perm="${p.id}" data-user="${a.id}"
          ${checked ? 'checked' : ''} ${(a.is_master || !isMaster) ? 'disabled' : ''} />
        <span><strong>${esc(p.label)}</strong><small>${esc(p.desc)}</small></span>
      </label>`;
  }).join('');

  return `
    <div class="admin-request">
      <div class="admin-request-head">
        <strong>${esc(a.full_name || a.email)}</strong>
        ${a.is_master ? '<span class="admin-request-status ok">Master</span>'
          : '<span class="admin-request-status pending">Admin</span>'}
      </div>
      <div class="admin-request-meta"><span>✉️ ${esc(a.email)}</span></div>
      <div class="team-perms">${boxes}</div>
      ${a.is_master ? '<p class="form-note" style="margin-top:6px;">Master has full access and cannot be limited.</p>' : ''}
    </div>`;
}

async function setPerm(userId, perm, checked) {
  const { supabase } = await import('./supabase.js');
  // Read current perms, toggle, write. Uses the master-only RLS policy.
  const { data: row } = await supabase.from('profiles').select('admin_permissions').eq('id', userId).single();
  const perms = new Set(row?.admin_permissions || []);
  if (checked) perms.add(perm); else perms.delete(perm);
  const { error } = await supabase
    .from('profiles')
    .update({ admin_permissions: [...perms] })
    .eq('id', userId);
  if (error) alert(`Could not update: ${error.message}`);
}
