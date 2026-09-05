// Supabase Edge Function: announce-cruises (admin only).
// Lists the next open cruises and emails EVERY registered member with an
// individual message (one recipient per Brevo send — never a shared BCC list,
// so no member ever sees another member's address). Callers: admin dashboard.
//
// Body: { subject?, preview?: string, lang?: 'en'|'ar'|'both' }
// Secrets: BREVO_API_KEY, FROM_EMAIL, REPLY_TO_EMAIL

const BREVO_KEY = Deno.env.get('BREVO_API_KEY') || '';
const FROM = Deno.env.get('FROM_EMAIL') || 'hello@madamecruise.com';
const REPLY_TO = Deno.env.get('REPLY_TO_EMAIL') || 'hello@madamecruise.com';
const SITE = Deno.env.get('SITE_NAME') || 'Cruise';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

async function sendBrevo(opts: { to: { email: string; name?: string }[]; subject: string; htmlContent: string; textContent: string }) {
  return fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': BREVO_KEY!, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ sender: { email: FROM }, replyTo: { email: REPLY_TO }, ...opts }),
  });
}

function esc(v: unknown) { return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const arDigits = (s: string | number): string => String(s).replace(/[0-9]/g, (d) => AR_DIGITS[+d]);

function fmtDate(iso: string, lang: string) {
  try {
    const out = new Intl.DateTimeFormat(lang === 'ar' ? 'ar-AE' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Dubai' }).format(new Date(iso));
    return lang === 'ar' ? arDigits(out) : out;
  } catch { return iso; }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const auth = req.headers.get('authorization') || '';
  const jwt = auth.replace(/^Bearer\s+/i, '');

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  // Admin check: decode the JWT payload to get the uid, then ask the RPC.
  let uid = '';
  try {
    const payload = JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    uid = payload.sub || '';
  } catch { /* invalid jwt */ }

  if (!uid) {
    return new Response(JSON.stringify({ error: 'Admin access required.' }), { status: 403, headers: cors });
  }

  const admin = await fetch(`${supabaseUrl}/rest/v1/rpc/has_admin_permission`, {
    method: 'POST',
    headers: { 'apikey': Deno.env.get('SUPABASE_ANON_KEY') || '', 'Authorization': `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid, perm: 'cruises' }),
  }).then((r) => r.json()).catch(() => false);

  if (!admin) {
    return new Response(JSON.stringify({ error: 'Admin access required.' }), { status: 403, headers: cors });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const lang = body.lang === 'ar' ? 'ar' : body.lang === 'both' ? 'both' : 'en';
    const subject = body.subject || (lang === 'ar' ? 'رحلاتنا القادمة 🌸' : 'Our next cruises are here 🌸');
    const preview = body.preview || '';
    const dryRun = !!body.dry_run;

    // Next open cruises (from now, max 6).
    const nowIso = new Date().toISOString();
    const cruises = await fetch(`${supabaseUrl}/rest/v1/cruises?select=title,starts_at,port_name,price_per_seat&status=eq.open&starts_at=gte.${encodeURIComponent(nowIso)}&order=starts_at.asc&limit=6`, {
      headers: { 'apikey': Deno.env.get('SUPABASE_ANON_KEY') || '', 'Authorization': `Bearer ${jwt}` },
    }).then((r) => r.json()).catch(() => []);

    // All registered members via the security-definer helper (bypasses RLS,
    // returns only non-admin members with marketing consent — RGPD).
    const members = await fetch(`${supabaseUrl}/rest/v1/rpc/list_member_emails`, {
      method: 'POST',
      headers: { 'apikey': Deno.env.get('SUPABASE_ANON_KEY') || '', 'Authorization': `Bearer ${jwt}`, 'Content-Type': 'application/json' },
      body: '{}',
    }).then((r) => r.json()).catch(() => []);

    if (!Array.isArray(members) || members.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0, members: 0, cruises: Array.isArray(cruises) ? cruises.length : 0, message: 'No confirmed members yet.' }), { headers: cors });
    }

    // Dry run: report counts without sending anything.
    if (dryRun) {
      return new Response(JSON.stringify({ ok: true, sent: 0, dry_run: true, members: members.length, cruises: Array.isArray(cruises) ? cruises.length : 0 }), { headers: cors });
    }

    // Build the HTML body (brand rose, matching the auth emails).
    const listHtml = (Array.isArray(cruises) ? cruises : []).map((c: any) => {
      const d = fmtDate(c.starts_at, lang === 'both' ? 'en' : lang);
      const p = c.price_per_seat ? `${Number(c.price_per_seat).toLocaleString('en-US')} AED` : (lang === 'ar' ? 'السعر عند الطلب' : 'Price on request');
      return `<tr><td style="padding:12px 0;border-bottom:1px solid #F0E0E0;"><span style="font-family:Georgia,serif;font-style:italic;font-size:17px;color:#4A2634;">${esc(d)}</span><br><span style="color:#7a4a5a;font-size:14px;">${esc(c.title)} · ${esc(c.port_name || 'Dubai Marina')}</span></td><td style="text-align:right;padding:12px 0;border-bottom:1px solid #F0E0E0;color:#4A2634;font-weight:600;white-space:nowrap;">${esc(p)}</td></tr>`;
    }).join('');

    const ar = lang === 'ar' || lang === 'both';
    const en = lang === 'en' || lang === 'both';

    let sent = 0;
    const errors: string[] = [];
    const results: { email: string; ok: boolean }[] = [];

    // One send per member — individual email, never a visible list.
    for (const m of members) {
      const mEmail = m.email as string;
      const mName = (m.full_name as string) || mEmail.split('@')[0];
      const mSubj = subject;
      const langFor = ar && !en ? 'ar' : 'en';

      const enHtml = `<div style="background:#FBF3F3;padding:24px;font-family:Inter,-apple-system,sans-serif;">
  <div style="max-width:520px;margin:auto;background:#ffffff;border-radius:16px;overflow:hidden;">
    <div style="background:#4A2634;padding:26px 30px;"><span style="font-family:Georgia,serif;font-style:italic;font-size:22px;color:#F7D9A8;">The sea, finally hers.</span></div>
    <div style="padding:28px 30px;color:#2B2F3A;font-size:15px;line-height:1.6;">
      <p>Dear ${esc(mName)},</p>
      <p>${esc(preview) || 'We have new ladies-only departures from Dubai Marina — reserve your seat before they go.'}</p>
      <table style="width:100%;border-collapse:collapse;margin:12px 0;">${listHtml}</table>
      <p style="margin-top:16px;"><a href="https://madamecruise.com/experiences" style="background:#C9A86A;color:#14213A;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:600;display:inline-block;">View cruises and reserve</a></p>
      <p style="color:#9a8a92;font-size:12px;margin-top:18px;">You received this email because you have a ${esc(SITE)} member account. Reply to this email and we will help you directly.</p>
    </div>
  </div>
</div>`;
      const arHtml = `<div style="background:#FBF3F3;padding:24px;font-family:Inter,-apple-system,sans-serif;" dir="rtl">
  <div style="max-width:520px;margin:auto;background:#ffffff;border-radius:16px;overflow:hidden;">
    <div style="background:#4A2634;padding:26px 30px;text-align:center;"><span style="font-family:Georgia,serif;font-style:italic;font-size:22px;color:#F7D9A8;">البحر أخيراً لها</span></div>
    <div style="padding:28px 30px;color:#2B2F3A;font-size:15px;line-height:1.8;">
      <p>عزيزتي ${esc(mName)}،</p>
      <p>${esc(preview) || 'لدينا رحلات نسائية جديدة من مرسى دبي — احجزي مقعدك قبل اكتمال العدد.'}</p>
      <table style="width:100%;border-collapse:collapse;margin:12px 0;">${listHtml}</table>
      <p style="margin-top:16px;text-align:center;"><a href="https://madamecruise.com/experiences" style="background:#C9A86A;color:#14213A;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:600;display:inline-block;">عرض الرحلات والحجز</a></p>
      <p style="color:#9a8a92;font-size:12px;margin-top:18px;">استلمت هذا البريد لأن لديك حساب عضوية في ${esc(SITE)}. ردّي على هذا البريد وسنساعدك مباشرة.</p>
    </div>
  </div>
</div>`;

      try {
        const r = await sendBrevo({
          to: [{ email: mEmail, name: mName }],
          subject: mSubj,
          htmlContent: en && ar ? enHtml + arHtml : ar ? arHtml : enHtml,
          textContent: `${preview || 'Our next cruises'}\n${(Array.isArray(cruises) ? cruises : []).map((c: any) => `${fmtDate(c.starts_at, 'en')} — ${c.title}`).join('\n')}`,
        });
        if (r.ok) { sent++; results.push({ email: mEmail, ok: true }); }
        else { results.push({ email: mEmail, ok: false }); errors.push(mEmail); }
      } catch { results.push({ email: mEmail, ok: false }); errors.push(mEmail); }
    }

    return new Response(JSON.stringify({ ok: true, sent, failed: errors.length, errors: errors.slice(0, 10), members: members.length, cruises: (Array.isArray(cruises) ? cruises : []).length }), { headers: cors });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'Failed' }), { status: 500, headers: cors });
  }
});
