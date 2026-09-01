// Supabase Edge Function: reject a booking request.
// Admin action. Marks the request rejected and emails the guest politely.
//
// Deploy: supabase functions deploy reject-booking
// Secrets: BREVO_API_KEY, FROM_EMAIL

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const BREVO_KEY = Deno.env.get('BREVO_API_KEY') ?? '';
const FROM = Deno.env.get('FROM_EMAIL') ?? 'info@bonjourcruise.com';
const REPLY_TO = Deno.env.get('REPLY_TO_EMAIL') ?? 'info@bonjourcruise.com';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

async function sendBrevo(opts: {
  to: { email: string; name?: string }[];
  subject: string;
  htmlContent: string;
  textContent: string;
}) {
  return fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': BREVO_KEY!, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ sender: { email: FROM }, replyTo: { email: REPLY_TO }, ...opts }),
  });
}

function esc(v: unknown) {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fmtDate(iso: string) {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Dubai',
    }).format(new Date(iso));
  } catch { return iso; }
}

async function isAdmin(jwt: string | null) {
  if (!jwt) return false;
  const { data: { user }, error } = await admin.auth.getUser(jwt);
  if (error || !user) return false;
  const { data: profile } = await admin
    .from('profiles').select('is_admin').eq('id', user.id).single();
  return !!profile?.is_admin;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    if (!(await isAdmin(jwt))) {
      return new Response(JSON.stringify({ error: 'Admin access required.' }), { status: 403, headers: cors });
    }

    const { request_id, reason, site_name } = await req.json();
    if (!request_id) return new Response(JSON.stringify({ error: 'request_id required.' }), { status: 400, headers: cors });

    const { data: reqRow, error: fetchError } = await admin
      .from('booking_requests').select('*').eq('id', request_id).single();
    if (fetchError || !reqRow) {
      return new Response(JSON.stringify({ error: 'Request not found.' }), { status: 404, headers: cors });
    }
    if (reqRow.status !== 'pending') {
      return new Response(JSON.stringify({ error: `Request already ${reqRow.status}.` }), { status: 400, headers: cors });
    }

    const { error: updErr } = await admin
      .from('booking_requests')
      .update({ status: 'rejected', rejected_at: new Date().toISOString() })
      .eq('id', reqRow.id);
    if (updErr) throw updErr;

    if (BREVO_KEY) {
      try {
        const userReason = reason?.trim() ? `<p style="margin:12px 0 0;font-size:14px;color:#5A6070;line-height:1.6;">${esc(reason)}</p>` : '';
        await sendBrevo({
          to: [{ email: reqRow.email, name: reqRow.first_name }],
          subject: `Update on your request — ${site_name || 'Cruise'}`,
          htmlContent: `<!doctype html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#FBF5EF;font-family:Inter,-apple-system,sans-serif;color:#2B2F3A;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FBF5EF;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border-radius:16px;overflow:hidden;">
        <tr><td style="background:#1C2B4A;padding:28px 32px;">
          <h1 style="margin:0;color:#F7F5F0;font-size:22px;font-family:Georgia,serif;">${esc(site_name || 'Cruise')}</h1>
          <p style="margin:6px 0 0;color:#C9A86A;font-size:13px;">About your request</p>
        </td></tr>
        <tr><td style="padding:28px 32px;">
          <p style="margin:0;font-size:15px;line-height:1.6;">Hello ${esc(reqRow.first_name)},<br>
          thank you for your request for <strong>${fmtDate(reqRow.requested_date)}</strong>. Unfortunately we are not able to confirm this date at the moment.</p>
          ${userReason}
          <p style="margin:16px 0 0;font-size:15px;line-height:1.6;">We would love to welcome you another day, or we can suggest an alternative experience. Just reply to this email.</p>
          <p style="margin:20px 0 0;font-size:13px;color:#8A8F9C;">Reference: <strong>${reqRow.id.slice(0, 8).toUpperCase()}</strong></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`,
          textContent: `Hello ${reqRow.first_name}, thank you for your request for ${fmtDate(reqRow.requested_date)}. Unfortunately we cannot confirm this date. We would love to welcome you another day.`,
        });
      } catch { /* best-effort */ }
    }

    return new Response(JSON.stringify({ ok: true, status: 'rejected' }), { headers: cors });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'Could not reject request.' }), { status: 500, headers: cors });
  }
});
