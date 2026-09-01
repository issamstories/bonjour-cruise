// Supabase Edge Function: submit a booking request.
// Public flow (no account needed): guest picks a date on the calendar and sends
// a request. No payment is taken here. The team validates it later and the
// approve-booking function sends the Stripe Payment Link by email.
//
// Deploy: supabase functions deploy submit-booking-request
// Secrets: BREVO_API_KEY (email), FROM_EMAIL, SITE_URL (optional)

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
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Dubai',
    }).format(new Date(iso));
  } catch { return iso; }
}

function fmtAED(n?: number | null) {
  if (!n && n !== 0) return 'Price on request';
  return `AED ${Number(n).toLocaleString('en-US')}`;
}

function confirmationEmail(r: any, cruise: any, siteName: string) {
  const total = cruise?.price_per_seat && r.seats ? cruise.price_per_seat * r.seats : null;
  return `<!doctype html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#FBF5EF;font-family:Inter,-apple-system,sans-serif;color:#2B2F3A;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FBF5EF;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:16px;overflow:hidden;">
        <tr><td style="background:#1C2B4A;padding:28px 32px;">
          <h1 style="margin:0;color:#F7F5F0;font-size:22px;font-family:Georgia,serif;">${esc(siteName)}</h1>
          <p style="margin:6px 0 0;color:#C9A86A;font-size:13px;">Booking request received</p>
        </td></tr>
        <tr><td style="padding:28px 32px;">
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Hello ${esc(r.first_name)},<br>
          thank you for your request. Our team is reviewing it and will confirm availability shortly. You will receive an email with your secure payment link once it is approved.</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F8F4EE;border-radius:12px;padding:16px 20px;font-size:14px;">
            <tr><td style="padding:4px 0;color:#8A8F9C;">Date</td><td align="right" style="padding:4px 0;font-weight:600;">${fmtDate(r.requested_date)}</td></tr>
            <tr><td style="padding:4px 0;color:#8A8F9C;">Guests</td><td align="right" style="padding:4px 0;font-weight:600;">${r.seats} ${r.seats > 1 ? 'guests' : 'guest'}</td></tr>
            ${cruise?.title ? `<tr><td style="padding:4px 0;color:#8A8F9C;">Experience</td><td align="right" style="padding:4px 0;font-weight:600;">${esc(cruise.title)}</td></tr>` : ''}
            ${total ? `<tr><td style="padding:4px 0;color:#8A8F9C;">Estimated total</td><td align="right" style="padding:4px 0;font-weight:600;">${fmtAED(total)}</td></tr>` : ''}
          </table>
          <p style="margin:20px 0 0;font-size:13px;color:#8A8F9C;line-height:1.5;">Reference: <strong>${r.id.slice(0, 8).toUpperCase()}</strong><br>
          Questions? Reply to this email or message us on WhatsApp.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { cruise_id, requested_date, seats, first_name, last_name, email, whatsapp, guests_note, site_name } = await req.json();

    if (!requested_date || !first_name || !email) {
      return new Response(JSON.stringify({ error: 'Date, name and email are required.' }), { status: 400, headers: cors });
    }

    const seatCount = Math.max(1, Math.min(30, Number(seats) || 1));

    // Fetch the cruise if given, so the email can show the experience + price.
    let cruise = null;
    if (cruise_id) {
      const { data } = await admin.from('cruises').select('title, price_per_seat').eq('id', cruise_id).maybeSingle();
      cruise = data;
    }

    const { data: row, error } = await admin
      .from('booking_requests')
      .insert({
        cruise_id: cruise_id || null,
        requested_date,
        seats: seatCount,
        first_name: first_name.trim(),
        last_name: last_name?.trim() || null,
        email: email.trim().toLowerCase(),
        whatsapp: whatsapp?.trim() || null,
        guests_note: guests_note?.trim() || null,
        status: 'pending',
      })
      .select()
      .single();

    if (error) throw error;

    const siteName = site_name || 'Cruise';
    if (BREVO_KEY) {
      try {
        await sendBrevo({
          to: [{ email: row.email, name: row.first_name }],
          subject: `We received your request ${siteName === 'Madame Cruise' ? '🌸' : '⚓'}`,
          htmlContent: confirmationEmail(row, cruise, siteName),
          textContent: `Hello ${row.first_name}, thank you for your request. Our team will confirm availability and send your secure payment link once approved.`,
        });
      } catch { /* email is best-effort */ }
    }

    return new Response(JSON.stringify({ ok: true, id: row.id, status: row.status }), { status: 201, headers: cors });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'Could not submit request.' }), { status: 500, headers: cors });
  }
});
