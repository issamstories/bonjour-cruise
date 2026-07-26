// Supabase Edge Function: Stripe webhook.
//   checkout.session.completed -> create the paid registration + send the guest
//     their branded confirmation email with the programme.
//   checkout.session.expired   -> one gentle recovery reminder (~1h after they
//     started and did not pay), with a fresh link. Never more than one.
// Deploy: supabase functions deploy stripe-webhook --no-verify-jwt
//   (--no-verify-jwt because Stripe calls it, not a logged-in user)
// Secrets needed: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, BREVO_API_KEY.
import Stripe from 'https://esm.sh/stripe@14?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const stripe = new Stripe((Deno.env.get('STRIPE_SECRET_KEY_BONJOUR_CRUISE') ?? Deno.env.get('STRIPE_SECRET_KEY'))!, { apiVersion: '2024-06-20' });
const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const BREVO_KEY = Deno.env.get('BREVO_API_KEY');

const FROM = { email: 'notifications@bonjourcruise.com', name: 'Bonjour Cruise' };
const REPLY_TO = { email: 'info@bonjourcruise.com', name: 'Bonjour Cruise' };

Deno.serve(async (req) => {
  const sig = req.headers.get('stripe-signature') ?? '';
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret);
  } catch (e) {
    return new Response(`Webhook signature error: ${(e as Error).message}`, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const s = event.data.object as Stripe.Checkout.Session;
    const md = s.metadata ?? {};
    if (md.cruise_id && md.user_id) {
      await admin.from('registrations').upsert(
        {
          cruise_id: md.cruise_id,
          user_id: md.user_id,
          seats: Number(md.seats) || 1,
          status: 'registered',
          stripe_session_id: s.id,
          amount_total: s.amount_total,
        },
        { onConflict: 'cruise_id,user_id' },
      );
    }
    const email = s.customer_details?.email || s.customer_email;
    if (email && BREVO_KEY) {
      await sendBrevo({
        to: [{ email, name: md.first_name || '' }],
        subject: 'Your Bonjour Cruise is booked 🌸',
        htmlContent: confirmationEmail(md, s.amount_total),
        textContent: confirmationText(md, s.amount_total),
      });
    }
  }

  if (event.type === 'checkout.session.expired') {
    const s = event.data.object as Stripe.Checkout.Session;
    const md = s.metadata ?? {};
    const recovery = s.after_expiration?.recovery?.url;
    const email = s.customer_details?.email || s.customer_email;
    if (email && recovery && BREVO_KEY) {
      await sendBrevo({
        to: [{ email, name: md.first_name || '' }],
        subject: 'Your seat is still waiting 🌸',
        htmlContent: reminderEmail(md, recovery),
        textContent: reminderText(md, recovery),
      });
    }
  }

  return new Response('ok');
});

// ---------------------------------------------------------------------------
async function sendBrevo(opts: { to: { email: string; name?: string }[]; subject: string; htmlContent: string; textContent: string }) {
  return fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': BREVO_KEY!, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ sender: FROM, replyTo: REPLY_TO, ...opts }),
  });
}

function esc(v: unknown) {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fmtWhen(iso?: string) {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long',
      hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dubai',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function fmtAED(total?: number | null) {
  if (!total && total !== 0) return '';
  return `AED ${(Number(total) / 100).toLocaleString('en-US')}`;
}

const PROGRAM: [string, string][] = [
  ['Welcome aboard', 'Step on to a deck that is entirely yours, with Arabic coffee and dates to greet you.'],
  ['Meet the crew', 'A warm, attentive crew focused on making the day easy and fun for everyone aboard.'],
  ['Sail and swim', 'Glide past the Dubai skyline, pause to swim in clear water, and unwind.'],
  ['Refresh', 'Halal refreshments and any touches you have added to your day.'],
  ['Golden finish', 'Cruise back along the coast as the light turns soft and gold.'],
];

function shell(headline: string, inner: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FBF5EF;font-family:Inter,-apple-system,sans-serif;color:#2B2F3A;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FBF5EF;">
    <tr><td align="center" style="padding:40px 20px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#FFFFFF;border-radius:22px;overflow:hidden;box-shadow:0 26px 64px rgba(28,43,74,0.13);">
        <tr><td style="background:linear-gradient(135deg,#E3B9BB 0%,#C98A8E 55%,#A8555C 100%);padding:46px 40px 40px;text-align:center;">
          <p style="margin:0 0 10px;font-size:11px;letter-spacing:0.26em;text-transform:uppercase;color:#FFF3EF;">Bonjour Cruise &middot; Dubai &#127800;</p>
          <h1 style="margin:0;font-family:'Cormorant Garamond',Georgia,serif;font-size:34px;font-weight:400;font-style:italic;color:#FFFFFF;">${headline}</h1>
        </td></tr>
        ${inner}
        <tr><td style="background:#F3E7DC;padding:24px 40px;text-align:center;">
          <p style="margin:0 0 4px;font-family:'Cormorant Garamond',Georgia,serif;font-size:16px;font-style:italic;color:#1C2B4A;">Shared yacht charters, Dubai</p>
          <p style="margin:0;font-size:13px;color:#5C5A5E;">info@bonjourcruise.com &middot; bonjourcruise.com</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function summaryBox(md: Record<string, string>, total?: number | null) {
  const rows: [string, string][] = [];
  if (md.cruise_title) rows.push(['Cruise', esc(md.cruise_title)]);
  if (md.starts_at) rows.push(['When', esc(fmtWhen(md.starts_at))]);
  if (md.port_name) {
    const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(md.port_name)}`;
    rows.push(['Where to meet', `${esc(md.port_name)}<br><a href="${maps}" style="color:#A8555C;font-weight:600;">Open in Google Maps</a>`]);
  }
  if (md.seats) rows.push(['Seats', esc(md.seats)]);
  if (total || total === 0) rows.push(['Paid', esc(fmtAED(total))]);
  if (!rows.length) return '';
  const html = rows.map(([k, v]) => `
    <tr>
      <td style="padding:12px 20px;border-bottom:1px solid rgba(201,138,142,0.18);font-family:'Cormorant Garamond',Georgia,serif;font-size:14px;letter-spacing:0.06em;text-transform:uppercase;color:#B0656C;width:38%;vertical-align:top;">${k}</td>
      <td style="padding:12px 20px;border-bottom:1px solid rgba(28,43,74,0.08);font-size:16px;line-height:1.6;color:#2B2F3A;">${v}</td>
    </tr>`).join('');
  return `<tr><td style="padding:12px 40px 4px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FBF5EF;border-radius:12px;">${html}</table></td></tr>`;
}

function confirmationEmail(md: Record<string, string>, total?: number | null) {
  const name = md.first_name ? esc(md.first_name) : 'there';
  const steps = PROGRAM.map(([t, d]) => `
    <tr>
      <td style="padding:10px 0;vertical-align:top;width:26px;"><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:#C98A8E;margin-top:6px;"></span></td>
      <td style="padding:10px 0;"><p style="margin:0;font-family:'Cormorant Garamond',Georgia,serif;font-size:18px;color:#1C2B4A;">${t}</p><p style="margin:2px 0 0;font-size:14px;line-height:1.6;color:#5C5A5E;">${d}</p></td>
    </tr>`).join('');
  const inner = `
    <tr><td style="padding:36px 40px 8px;">
      <p style="margin:0 0 16px;font-family:'Cormorant Garamond',Georgia,serif;font-size:22px;color:#A8555C;">Hi ${name},</p>
      <p style="margin:0;font-size:16px;line-height:1.7;color:#2B2F3A;">Your payment went through and your seat is confirmed. We cannot wait to have you aboard. Here is everything for your day.</p>
    </td></tr>
    ${summaryBox(md, total)}
    <tr><td style="padding:24px 40px 4px;">
      <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#B0656C;">A taste of your day</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${steps}</table>
    </td></tr>
    <tr><td style="padding:16px 40px 4px;">
      <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#B0656C;">What to bring</p>
      <p style="margin:0;font-size:15px;line-height:1.7;color:#2B2F3A;">Swimwear and a cover-up, sunglasses, sunscreen, a light layer for the breeze, and above all your good mood. We take care of the rest.</p>
    </td></tr>
    <tr><td style="padding:20px 40px 36px;text-align:center;">
      <a href="https://wa.me/971585986118" style="display:inline-block;background:#C98A8E;color:#FFFFFF;text-decoration:none;font-size:15px;padding:14px 30px;border-radius:999px;">Message us on WhatsApp</a>
    </td></tr>`;
  return shell('You are booked', inner);
}

function confirmationText(md: Record<string, string>, total?: number | null) {
  const lines = [
    'BONJOUR CRUISE',
    '',
    `Hi ${md.first_name || 'there'},`,
    '',
    'Your payment went through and your seat is confirmed.',
    '',
  ];
  if (md.cruise_title) lines.push(`Cruise: ${md.cruise_title}`);
  if (md.starts_at) lines.push(`When: ${fmtWhen(md.starts_at)}`);
  if (md.port_name) lines.push(`Meeting point: ${md.port_name}`);
  if (md.seats) lines.push(`Seats: ${md.seats}`);
  if (total || total === 0) lines.push(`Paid: ${fmtAED(total)}`);
  lines.push('', 'What to bring: swimwear and a cover-up, sunglasses, sunscreen, a light layer, and above all your good mood.', '', 'WhatsApp: +971 58 598 6118', 'info@bonjourcruise.com');
  return lines.join('\n');
}

function reminderEmail(md: Record<string, string>, recovery: string) {
  const name = md.first_name ? esc(md.first_name) : 'there';
  const when = md.starts_at ? esc(fmtWhen(md.starts_at)) : '';
  const inner = `
    <tr><td style="padding:36px 40px 8px;">
      <p style="margin:0 0 16px;font-family:'Cormorant Garamond',Georgia,serif;font-size:22px;color:#A8555C;">Hi ${name},</p>
      <p style="margin:0 0 10px;font-size:16px;line-height:1.7;color:#2B2F3A;">Your seat${md.cruise_title ? ` on <strong>${esc(md.cruise_title)}</strong>` : ''}${when ? `, ${when},` : ''} is still held for you. No rush, and no pressure. Whenever you are ready, you can finish in a tap.</p>
    </td></tr>
    <tr><td style="padding:12px 40px 36px;text-align:center;">
      <a href="${esc(recovery)}" style="display:inline-block;background:#C98A8E;color:#FFFFFF;text-decoration:none;font-size:15px;padding:14px 34px;border-radius:999px;">Finish my booking</a>
      <p style="margin:18px 0 0;font-size:13px;color:#5C5A5E;font-style:italic;">Come as one, leave with friends.</p>
    </td></tr>`;
  return shell('Your seat is waiting', inner);
}

function reminderText(md: Record<string, string>, recovery: string) {
  return [
    'BONJOUR CRUISE',
    '',
    `Hi ${md.first_name || 'there'},`,
    '',
    `Your seat${md.cruise_title ? ` on ${md.cruise_title}` : ''}${md.starts_at ? `, ${fmtWhen(md.starts_at)},` : ''} is still held for you. No rush.`,
    '',
    `Finish your booking: ${recovery}`,
    '',
    'Come as one, leave with friends.',
    'info@bonjourcruise.com',
  ].join('\n');
}
