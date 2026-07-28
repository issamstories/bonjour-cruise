# Bonjour Cruise, Phase B, deploy checklist (Issam)

Everything below is your part: secrets and a Supabase deploy that must not pass
through chat. Once done, the homepage books real cruises, the live counter
works, the after-payment email and the 1h reminder fire.

## 0. Roll the leaked Stripe key (do this first)
The `sk_live_...` key was pasted in chat, so treat it as compromised.
Stripe Dashboard (Bonjour Cruise account) -> Developers -> API keys ->
**Roll** the secret key. Copy the NEW one. Never paste it in chat again.

## 1. Become an admin
1. Sign up once on https://bonjourcruise.com/account.html with your email.
2. Supabase -> SQL editor, run (use your signup email):
   ```sql
   update public.profiles set is_admin = true where email = 'YOUR_EMAIL';
   ```
3. You can now sign in on https://bonjourcruise.com/admin.html and post cruises.

## 2. Set Edge Function secrets
Supabase -> Project Settings -> Edge Functions -> Secrets, add:
- `STRIPE_SECRET_KEY` = the NEW rolled secret key
- `STRIPE_WEBHOOK_SECRET` = from step 4 below (add after creating the webhook)
- `BREVO_API_KEY` = the same key already used in Netlify
- `SITE_URL` = https://bonjourcruise.com  (optional, this is the default)

## 3. Deploy the two Edge Functions
Either with the CLI:
```bash
supabase functions deploy create-checkout
supabase functions deploy stripe-webhook --no-verify-jwt
```
Or paste the contents of these files into the dashboard function editor:
- supabase/functions/create-checkout/index.ts
- supabase/functions/stripe-webhook/index.ts   (disable "Verify JWT" for this one)

## 4. Create the Stripe webhook
Stripe Dashboard (Bonjour Cruise account) -> Developers -> Webhooks -> Add endpoint:
- URL: `https://rdfzdizvxavfxlbiwsbg.supabase.co/functions/v1/stripe-webhook`
- Events: `checkout.session.completed` and `checkout.session.expired`
- After creating, copy the "Signing secret" (`whsec_...`) and put it in the
  `STRIPE_WEBHOOK_SECRET` secret from step 2.

## 5. Post your first cruise
On /admin.html, pick a day, set capacity (8, 15, 30...), price, and post it.
It appears instantly on the site. Tell Claude once one cruise is live, so the
homepage wizard can be wired to real dates and tested end to end.

## Notes
- Group bookings require an account (sign in / new mermaid). This is what makes
  the counter, the roster and the photos work. Guests are not used for group.
- The confirmation email now fires from the webhook AFTER payment. The reminder
  fires once, ~1h after an abandoned checkout, with a fresh Stripe recovery link.
