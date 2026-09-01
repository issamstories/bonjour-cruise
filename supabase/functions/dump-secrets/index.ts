// TEMPORAIRE — dump les secrets pour récupération. À SUPPRIMER après usage.
Deno.serve(async () => {
  const names = ['BREVO_API_KEY', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'STRIPE_SECRET_KEY', 'STRIPE_SECRET_KEY_BONJOUR_CRUISE', 'FROM_EMAIL', 'REPLY_TO_EMAIL'];
  const out = {};
  for (const n of names) {
    const v = Deno.env.get(n);
    if (v) out[n] = v;
  }
  return new Response(JSON.stringify(out), { headers: { 'Content-Type': 'application/json' } });
});
