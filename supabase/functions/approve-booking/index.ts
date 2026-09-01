// Supabase Edge Function: approve a booking request.
// Admin action (called from the admin dashboard with the admin's JWT).
// Generates a Stripe Payment Link for the exact amount (price_per_seat x seats),
// stores it on the request, and emails the guest with the link + T&Cs.
// The email follows the guest's language (lang column set at submit time):
// full Arabic template with RTL + Arabic-Indic numerals when lang = 'ar'.
//
// Deploy: supabase functions deploy approve-booking
// Secrets: STRIPE_SECRET_KEY (or STRIPE_SECRET_KEY_BONJOUR_CRUISE / _MADAME_CRUISE),
//          BREVO_API_KEY, FROM_EMAIL, SITE_URL (optional)

import Stripe from 'https://esm.sh/stripe@14?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const STRIPE_KEY = Deno.env.get('STRIPE_SECRET_KEY_BONJOUR_CRUISE')
  ?? Deno.env.get('STRIPE_SECRET_KEY_MADAME_CRUISE')
  ?? Deno.env.get('STRIPE_SECRET_KEY')!;
const stripe = new Stripe(STRIPE_KEY, { apiVersion: '2024-06-20' });

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const BREVO_KEY = Deno.env.get('BREVO_API_KEY') ?? '';
const FROM = Deno.env.get('FROM_EMAIL') ?? 'info@bonjourcruise.com';
const REPLY_TO = Deno.env.get('REPLY_TO_EMAIL') ?? 'info@bonjourcruise.com';
const SITE_URL = Deno.env.get('SITE_URL') ?? 'https://bonjourcruise.com';

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

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const arDigits = (s: string | number): string => String(s).replace(/[0-9]/g, (d) => AR_DIGITS[+d]);

function fmtDate(iso: string, lang: string) {
  try {
    const out = new Intl.DateTimeFormat(lang === 'ar' ? 'ar-AE' : 'en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Dubai',
    }).format(new Date(iso));
    return lang === 'ar' ? arDigits(out) : out;
  } catch { return iso; }
}

function fmtAED(n?: number | null, lang?: string) {
  if (!n && n !== 0) return lang === 'ar' ? 'السعر عند الطلب' : 'Price on request';
  const num = Number(n).toLocaleString('en-US');
  return lang === 'ar' ? `${arDigits(num)} د.إ` : `AED ${num}`;
}

const TERMS_EN = [
  'Payment confirms your date and seats. Your spot is reserved only once the payment is received.',
  'Full refund for cancellations made more than 72 hours before departure.',
  'Within 72 hours of departure, refunds are not possible, but we can move your booking to another available date.',
  'Please arrive 20 minutes before departure at the meeting point shown in your confirmation.',
  'Weather: if the captain cancels for safety, you get a full refund or a new date, your choice.',
];

const TERMS_AR = [
  'الدفع يؤكد تاريخك ومقاعدك. يتم حجز مكانك فقط بعد استلام الدفع.',
  'استرداد كامل للإلغاء قبل أكثر من 72 ساعة من موعد الرحلة.',
  'خلال 72 ساعة من موعد الرحلة، لا يمكن الاسترداد، لكن يمكننا نقل حجزك إلى تاريخ آخر متاح.',
  'يرجى الوصول قبل 20 دقيقة من موعد الرحلة إلى نقطة الالتقاء الموضحة في رسالة التأكيد.',
  'الطقس: إذا ألغى القبطان لأسباب تتعلق بالسلامة، ستحصل على استرداد كامل أو تاريخ جديد، حسب اختيارك.',
];

function paymentEmail(r: any, cruise: any, link: string, siteName: string, total: number | null, lang: string) {
  const ar = lang === 'ar';
  const dir = ar ? 'rtl' : 'ltr';
  const L = ar ? {
    approved: 'تمت الموافقة على حجزك',
    hello: `مرحباً ${esc(r.first_name)}،`,
    body: 'خبر رائع، تمت <strong>الموافقة</strong> على طلبك. أكّد تاريخك بإتمام الدفع أدناه.',
    date: 'التاريخ', guests: 'الضيوف', guest: 'ضيف', guests2: 'ضيوف', exp: 'التجربة', total: 'الإجمالي',
    pay: 'ادفع الآن وأكّد',
    linkHint: 'إذا لم يعمل الزر، انسخ هذا الرابط في متصفحك:',
    expires: 'رابط الدفع الخاص بك صالح لمدة 7 أيام.',
    terms: 'الشروط والأحكام',
    ref: 'المرجع', questions: 'أسئلة؟ رد على هذا البريد أو راسلنا على واتساب.',
  } : {
    approved: 'Your booking is approved',
    hello: `Hello ${esc(r.first_name)},<br>`,
    body: 'great news, your request is <strong>approved</strong>. Secure your date by completing the payment below.',
    date: 'Date', guests: 'Guests', guest: 'guest', guests2: 'guests', exp: 'Experience', total: 'Total',
    pay: 'Pay now and confirm',
    linkHint: 'If the button does not work, copy this link into your browser:',
    expires: 'Your payment link expires in 7 days.',
    terms: 'Terms and conditions',
    ref: 'Reference', questions: 'Questions? Reply to this email or message us on WhatsApp.',
  };
  const termsRows = (ar ? TERMS_AR : TERMS_EN)
    .map((t) => `<tr><td style="padding:5px 0;color:#5A6070;font-size:14px;line-height:1.5;">• ${esc(t)}</td></tr>`).join('');
  return `<!doctype html><html dir="${dir}"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#FBF5EF;font-family:Inter,-apple-system,sans-serif;color:#2B2F3A;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FBF5EF;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:16px;overflow:hidden;">
        <tr><td style="background:#1C2B4A;padding:28px 32px;${ar ? 'text-align:right;' : ''}">
          <h1 style="margin:0;color:#F7F5F0;font-size:22px;font-family:Georgia,serif;">${esc(siteName)}</h1>
          <p style="margin:6px 0 0;color:#C9A86A;font-size:13px;">${L.approved}</p>
        </td></tr>
        <tr><td style="padding:28px 32px;">
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">${L.hello}
          ${L.body}</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F8F4EE;border-radius:12px;padding:16px 20px;font-size:14px;">
            <tr><td style="padding:4px 0;color:#8A8F9C;">${L.date}</td><td align="${ar ? 'left' : 'right'}" style="padding:4px 0;font-weight:600;">${fmtDate(r.requested_date, lang)}</td></tr>
            <tr><td style="padding:4px 0;color:#8A8F9C;">${L.guests}</td><td align="${ar ? 'left' : 'right'}" style="padding:4px 0;font-weight:600;">${r.seats} ${r.seats > 1 ? L.guests2 : L.guest}</td></tr>
            ${cruise?.title ? `<tr><td style="padding:4px 0;color:#8A8F9C;">${L.exp}</td><td align="${ar ? 'left' : 'right'}" style="padding:4px 0;font-weight:600;">${esc(cruise.title)}</td></tr>` : ''}
            ${total ? `<tr><td style="padding:4px 0;color:#8A8F9C;">${L.total}</td><td align="${ar ? 'left' : 'right'}" style="padding:4px 0;font-weight:600;font-size:17px;">${fmtAED(total, lang)}</td></tr>` : ''}
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
            <tr><td align="center">
              <a href="${esc(link)}" style="display:inline-block;background:#C9A86A;color:#1C2B4A;text-decoration:none;font-weight:700;font-size:15px;padding:14px 36px;border-radius:999px;">${L.pay}</a>
            </td></tr>
          </table>
          <p style="margin:0 0 8px;font-size:13px;color:#8A8F9C;">${L.linkHint}</p>
          <p style="margin:0 0 20px;font-size:13px;word-break:break-all;color:#4A6FA5;"><a href="${esc(link)}" style="color:#4A6FA5;">${esc(link)}</a></p>
          <p style="margin:0 0 8px;font-size:13px;color:#8A8F9C;">${L.expires}</p>
          <p style="margin:0 0 8px;font-size:14px;font-weight:600;color:#2B2F3A;">${L.terms}</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${termsRows}</table>
          <p style="margin:20px 0 0;font-size:13px;color:#8A8F9C;line-height:1.5;">${L.ref}: <strong>${r.id.slice(0, 8).toUpperCase()}</strong><br>
          ${L.questions}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

// Verify the caller is an admin (JWT from the admin dashboard).
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

    const { request_id, site_name } = await req.json();
    if (!request_id) return new Response(JSON.stringify({ error: 'request_id required.' }), { status: 400, headers: cors });

    const { data: reqRow, error: fetchError } = await admin
      .from('booking_requests').select('*').eq('id', request_id).single();
    if (fetchError || !reqRow) {
      return new Response(JSON.stringify({ error: 'Request not found.' }), { status: 404, headers: cors });
    }
    if (reqRow.status !== 'pending') {
      return new Response(JSON.stringify({ error: `Request already ${reqRow.status}.` }), { status: 400, headers: cors });
    }

    // Language the guest used when submitting (defaults to English for old rows).
    const lang = reqRow.lang === 'ar' ? 'ar' : 'en';
    const ar = lang === 'ar';

    // Fetch the cruise for the price.
    let cruise = null;
    if (reqRow.cruise_id) {
      const { data } = await admin.from('cruises').select('title, price_per_seat').eq('id', reqRow.cruise_id).maybeSingle();
      cruise = data;
    }
    const total = cruise?.price_per_seat && reqRow.seats ? cruise.price_per_seat * reqRow.seats : null;

    // Create a Stripe Payment Link for the exact amount.
    // Amount is in AED; unit_amount is in fils (AED x 100).
    const amountFils = total ? Math.round(total * 100) : null;
    const price = await stripe.prices.create({
      currency: 'aed',
      unit_amount: amountFils ?? 10000, // fallback 100 AED if no price set
      product_data: {
        name: `${site_name || 'Cruise'}, ${cruise?.title || 'Private charter'} (${fmtDate(reqRow.requested_date, lang)})`,
      },
    });

    const paymentLink = await stripe.paymentLinks.create({
      line_items: [{ price: price.id, quantity: 1 }],
      metadata: {
        booking_request_id: reqRow.id,
        site: site_name || '',
        cruise_id: reqRow.cruise_id || '',
      },
      after_completion: { type: 'redirect', redirect: { url: `${SITE_URL}/welcome-aboard.html` } },
    });

    // Store the link + mark approved.
    const { error: updErr } = await admin
      .from('booking_requests')
      .update({ status: 'approved', payment_link: paymentLink.url, payment_link_id: paymentLink.id, approved_at: new Date().toISOString() })
      .eq('id', reqRow.id);
    if (updErr) throw updErr;

    // Email the guest with the link + T&Cs, in her language.
    if (BREVO_KEY) {
      try {
        await sendBrevo({
          to: [{ email: reqRow.email, name: reqRow.first_name }],
          subject: ar
            ? `تمت الموافقة على طلبك — ادفع للتأكيد ${site_name === 'Madame Cruise' ? '🌸' : '⚓'}`
            : `${site_name || 'Your cruise'} is approved — pay to confirm ${site_name === 'Madame Cruise' ? '🌸' : '⚓'}`,
          htmlContent: paymentEmail(reqRow, cruise, paymentLink.url, site_name || 'Cruise', total, lang),
          textContent: ar
            ? `مرحباً ${reqRow.first_name}، تمت الموافقة على طلبك. ادفع ${total ? fmtAED(total, lang) : 'المبلغ الموضح'} للتأكيد: ${paymentLink.url}`
            : `Hello ${reqRow.first_name}, your request is approved. Pay ${total ? fmtAED(total, lang) : 'the amount shown'} to confirm: ${paymentLink.url}`,
        });
      } catch { /* email best-effort */ }
    }

    return new Response(JSON.stringify({ ok: true, payment_link: paymentLink.url, total }), { headers: cors });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'Could not approve request.' }), { status: 500, headers: cors });
  }
});
