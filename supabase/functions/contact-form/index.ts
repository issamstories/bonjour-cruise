// Supabase Edge Function: contact form submission via Brevo API.
// Body: { site_name, first_name, last_name, email, whatsapp, subject, message }
// Secrets: BREVO_API_KEY, FROM_EMAIL, REPLY_TO_EMAIL
// Deploy: supabase functions deploy contact-form --no-verify-jwt
Deno.serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders, status: 200 });

  try {
    const body = await req.json();
    const site = body.site_name || 'Cruise';
    const fromEmail = Deno.env.get('FROM_EMAIL') || 'info@bonjourcruise.com';
    const brevoKey = Deno.env.get('BREVO_API_KEY');
    if (!brevoKey) {
      return new Response(JSON.stringify({ ok: false, error: 'Email service not configured' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500,
      });
    }

    const firstName = body.first_name || '';
    const lastName = body.last_name || '';
    const email = body.email || '';
    const whatsapp = body.whatsapp || '';
    const subject = body.subject || 'Website enquiry';
    const message = body.message || '';

    const html = `
      <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;">
        <h2 style="color:#1C2B4A;">New ${esc(site)} website enquiry</h2>
        <table style="border-collapse:collapse;width:100%;font-size:14px;">
          <tr><td style="padding:6px 0;color:#666;width:130px;">Name</td>
              <td style="padding:6px 0;"><strong>${esc(firstName)} ${esc(lastName)}</strong></td></tr>
          <tr><td style="padding:6px 0;color:#666;">Email</td>
              <td style="padding:6px 0;"><a href="mailto:${esc(email)}">${esc(email)}</a></td></tr>
          ${whatsapp ? `<tr><td style="padding:6px 0;color:#666;">WhatsApp</td>
              <td style="padding:6px 0;">${esc(whatsapp)}</td></tr>` : ''}
          <tr><td style="padding:6px 0;color:#666;">Subject</td>
              <td style="padding:6px 0;">${esc(subject)}</td></tr>
        </table>
        <div style="margin-top:14px;padding:14px;background:#F7F5F0;border-radius:10px;white-space:pre-wrap;">${esc(message)}</div>
      </div>`;

    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': brevoKey,
        Accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { name: site + ' Website', email: fromEmail },
        to: [{ email: fromEmail, name: site + ' Team' }],
        replyTo: email ? { email, name: firstName } : undefined,
        subject: `New enquiry: ${subject}`,
        htmlContent: html,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      return new Response(JSON.stringify({ ok: false, error: 'Brevo ' + res.status }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 502,
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400,
    });
  }
});

function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
