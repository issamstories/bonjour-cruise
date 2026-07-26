// Supabase Edge Function: create a Stripe Checkout Session for a cruise seat.
// Deploy: supabase functions deploy create-checkout  (or paste in the dashboard)
// Secrets needed: STRIPE_SECRET_KEY, SITE_URL (optional, defaults to prod).
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.
//
// The session is created with a 1h expiry and Stripe's native recovery enabled,
// so an unpaid, abandoned checkout emits `checkout.session.expired` after an hour
// with a recovery URL, which the webhook turns into a single gentle reminder.
import Stripe from 'https://esm.sh/stripe@14?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const stripe = new Stripe((Deno.env.get('STRIPE_SECRET_KEY_BONJOUR_CRUISE') ?? Deno.env.get('STRIPE_SECRET_KEY'))!, { apiVersion: '2024-06-20' });
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const SITE_URL = Deno.env.get('SITE_URL') ?? 'https://bonjourcruise.com';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

// Find an existing auth user by email (paged; fine at launch scale). Returns the
// user or null. Lets a returning guest reuse their account instead of erroring.
async function findUserByEmail(email: string) {
  const target = email.toLowerCase();
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data?.users?.length) return null;
    const hit = data.users.find((u) => (u.email ?? '').toLowerCase() === target);
    if (hit) return hit;
    if (data.users.length < 200) return null;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const payload = await req.json();
    const { cruise_id, seats, first_name, email, kind } = payload;

    // Language: show the Stripe Checkout page in their language and send them
    // back to the translated welcome page. Stripe supports these locale codes as-is.
    const LANGS = ['en', 'fr', 'ar', 'ru', 'zh', 'zh-hant'];
    const lang = LANGS.includes(String(payload.lang)) ? String(payload.lang) : 'en';
    const langPath = lang === 'en' ? '' : `/${lang}`;
    // Map our site codes to valid Stripe Checkout locales. 'en'|'fr'|'ar'|'ru'|'zh'
    // are accepted as-is; our Traditional Chinese code 'zh-hant' becomes 'zh-TW'
    // (Stripe has no bare 'zh-hant'). Cast to any so Deno does not reject the union.
    const STRIPE_LOCALE: Record<string, string> = { 'zh-hant': 'zh-TW' };
    // deno-lint-ignore no-explicit-any
    const checkoutLocale = (STRIPE_LOCALE[lang] || lang) as any;

    // Identify the buyer. A signed-in member is recognised by their JWT; a guest is
    // provisioned an account behind the scenes from their email, so the booking
    // still gets a real profile, the live counter, the roster and their emails.
    let userId: string | null = null;
    let userEmail: string | null = null;

    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    if (jwt) {
      const { data: userData } = await admin.auth.getUser(jwt);
      if (userData?.user) { userId = userData.user.id; userEmail = userData.user.email ?? null; }
    }

    if (!userId) {
      const cleanEmail = String(email ?? '').trim().toLowerCase();
      if (!/.+@.+\..+/.test(cleanEmail)) {
        return new Response(JSON.stringify({ error: 'A valid email is required to book.' }), { status: 400, headers: cors });
      }
      const existing = await findUserByEmail(cleanEmail);
      if (existing) {
        userId = existing.id; userEmail = cleanEmail;
      } else {
        const clean = String(first_name ?? '').slice(0, 120);
        const { data: created, error: cErr } = await admin.auth.admin.createUser({
          email: cleanEmail,
          email_confirm: true, // they proved the address by paying; let them set a password later
          user_metadata: { first_name: clean, full_name: clean },
        });
        if (cErr || !created?.user) {
          return new Response(JSON.stringify({ error: 'Could not start your booking. Please try again.' }), { status: 400, headers: cors });
        }
        userId = created.user.id; userEmail = cleanEmail;
      }
    }
    const user = { id: userId, email: userEmail };

    // Private charter: a fixed deposit to lock a date they chose. The amount is
    // set server-side (never trust the client) and configurable via a secret.
    if (kind === 'charter-deposit') {
      const deposit = Number(Deno.env.get('CHARTER_DEPOSIT_AED')) || 1000;
      const boat = String(payload.boat || '').slice(0, 120);
      const charterDate = String(payload.charter_date || '').slice(0, 40);
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        locale: checkoutLocale,
        customer_email: user.email ?? undefined,
        line_items: [{
          quantity: 1,
          price_data: {
            currency: 'aed',
            unit_amount: Math.round(deposit * 100),
            product_data: { name: `Bonjour Cruise, private charter deposit${boat ? ` (${boat})` : ''}` },
          },
        }],
        metadata: {
          kind: 'charter-deposit',
          user_id: user.id,
          lang,
          first_name: String(first_name || '').slice(0, 120),
          cruise_title: `Private charter${boat ? ` · ${boat}` : ''}${charterDate ? ` · ${charterDate}` : ''}`,
          starts_at: String(payload.starts_at || ''),
          port_name: 'Dubai Marina Yacht Club',
          addons: String(payload.addons || '').slice(0, 400),
        },
        expires_at: Math.floor(Date.now() / 1000) + 1800,
        after_expiration: { recovery: { enabled: true } },
        success_url: `${SITE_URL}${langPath}/welcome-aboard.html`,
        cancel_url: `${SITE_URL}${langPath}/?canceled=1`,
      });
      return new Response(JSON.stringify({ url: session.url }), { headers: cors });
    }

    const nSeats = Math.max(1, Math.min(30, Number(seats) || 1));

    const { data: cruise } = await admin
      .from('cruises')
      .select('id, title, starts_at, port_name, capacity, price_per_seat, status')
      .eq('id', cruise_id)
      .single();

    if (!cruise || cruise.status !== 'open') {
      return new Response(JSON.stringify({ error: 'This cruise is not open for booking.' }), { status: 400, headers: cors });
    }
    const unit = Number(cruise.price_per_seat || 0);
    if (!unit) {
      return new Response(JSON.stringify({ error: 'This cruise has no seat price set.' }), { status: 400, headers: cors });
    }

    // Capacity guard: never sell more seats than remain on this departure.
    const { data: summary } = await admin.rpc('cruise_guest_summary', { p_cruise_id: cruise_id });
    const booked = Number(summary?.[0]?.seat_count ?? 0);
    const remaining = Number(cruise.capacity) - booked;
    if (remaining <= 0) {
      return new Response(JSON.stringify({ error: 'This cruise is fully booked.' }), { status: 400, headers: cors });
    }
    if (nSeats > remaining) {
      return new Response(
        JSON.stringify({ error: `Only ${remaining} ${remaining === 1 ? 'seat is' : 'seats are'} left on this cruise.` }),
        { status: 400, headers: cors },
      );
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      locale: checkoutLocale,
      customer_email: user.email ?? undefined,
      line_items: [{
        quantity: nSeats,
        price_data: {
          currency: 'aed',
          unit_amount: Math.round(unit * 100),
          product_data: { name: `Bonjour Cruise, ${cruise.title}` },
        },
      }],
      metadata: {
        cruise_id: cruise.id,
        user_id: user.id,
        lang,
        seats: String(nSeats),
        first_name: String(first_name || '').slice(0, 120),
        cruise_title: String(cruise.title || '').slice(0, 200),
        starts_at: String(cruise.starts_at || ''),
        port_name: String(cruise.port_name || '').slice(0, 200),
      },
      // Abandoned-cart recovery: 1h to pay, then a recoverable session for the reminder.
      expires_at: Math.floor(Date.now() / 1000) + 1800,
      after_expiration: { recovery: { enabled: true } },
      success_url: `${SITE_URL}${langPath}/welcome-aboard.html`,
      cancel_url: `${SITE_URL}${langPath}/cruises.html?canceled=1`,
    });

    return new Response(JSON.stringify({ url: session.url }), { headers: cors });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error)?.message || e) }), { status: 500, headers: cors });
  }
});
