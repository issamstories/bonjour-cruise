// Supabase Auth Hook (after user created) — notifie Issam sur Telegram à chaque
// nouvelle inscription. Appelé par GoTrue avec le payload user; envoie un
// message Telegram au hub avec nom/email/WhatsApp si disponible.
//
// Le hook reçoit { user: {...}, ... }. Le profil (nom, whatsapp) n'existe pas
// encore à ce stade (créé par le trigger profiles après), donc on lit aussi la
// table profiles si dispo. Secret attendu: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID.

const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') || '';
const CHAT_ID = Deno.env.get('TELEGRAM_CHAT_ID') || '-1003964825416';
const SITE_NAME = Deno.env.get('SITE_NAME') || 'Cruise';

Deno.serve(async (req) => {
  // Hook auth: GoTrue POSTe l'événement. En mode hook, le corps = { user }.
  let payload: any = {};
  try { payload = await req.json(); } catch { /* ignore */ }

  const user = payload?.user || payload?.users?.[0] || {};
  const email = user.email || 'inconnu';
  const meta = user.user_metadata || {};
  const name = meta.first_name || meta.full_name || meta.name || email.split('@')[0];
  const phone = meta.whatsapp || meta.phone || '';
  const created = user.created_at ? new Date(user.created_at) : new Date();

  const emoji = SITE_NAME.toLowerCase().includes('madame') ? '🌸' : '⚓';
  const text =
    `${emoji} *Nouvelle inscription ${SITE_NAME}*\n` +
    `👤 ${name}\n` +
    `📧 ${email}\n` +
    (phone ? `📱 ${phone}\n` : '') +
    `🕐 ${created.toLocaleString('fr-BE', { timeZone: 'Asia/Dubai' })} Dubaï`;

  let tgOk = false;
  if (BOT_TOKEN) {
    try {
      const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'Markdown' }),
      });
      tgOk = r.ok;
    } catch { /* tg unreachable */ }
  }

  // Toujours retourner 200 pour le hook (ne jamais bloquer l'inscription).
  return new Response(JSON.stringify({ ok: true, notified: tgOk }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
