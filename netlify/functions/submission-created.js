// Netlify Forms → Brevo transactional. Fires on every form submission
// on this site (Netlify's built-in "submission-created" event, no config
// needed). Renders a branded HTML email in the Bonjour Cruise palette and
// routes it to the hub with a `+bonjourcruise` alias so Gmail filters can
// label it "Bonjour Cruise" automatically.
//
// Env vars (set in Netlify UI):
//   BREVO_API_KEY    : shared across brands, from the one Brevo account
//   HUB_EMAIL        : defaults to issam.messaoudi.hub+bonjourcruise@gmail.com
//   FROM_EMAIL       : defaults to notifications@bonjourcruise.com
//   FROM_NAME        : defaults to "Bonjour Cruise"

const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";

const HUB_EMAIL = process.env.HUB_EMAIL || "issam.messaoudi.hub+bonjourcruise@gmail.com";
const FROM_EMAIL = process.env.FROM_EMAIL || "notifications@bonjourcruise.com";
const FROM_NAME = process.env.FROM_NAME || "Bonjour Cruise";

// Customer emails (guest confirmation + companion invite) are sent in the
// language they used on the site. The dictionary is produced by the email
// translation pass; a missing entry falls back to English so nothing breaks.
let EMAIL_I18N = {};
try { EMAIL_I18N = require("./email-i18n.json"); } catch { EMAIL_I18N = {}; }
const EMAIL_LANGS = ["fr", "ar", "ru", "zh"];
function normLang(l) { return EMAIL_LANGS.includes(String(l)) ? String(l) : "en"; }
const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const araDigits = (lang, s) => (lang === "ar" && s != null ? String(s).replace(/[0-9]/g, (d) => AR_DIGITS[+d]) : s);
function T(str, lang, vars) {
  const dict = lang && lang !== "en" ? (EMAIL_I18N[lang] || {}) : {};
  let out = dict[str] != null && String(dict[str]).trim() ? dict[str] : str;
  if (vars) for (const k of Object.keys(vars)) out = out.split(`{${k}}`).join(String(vars[k]));
  return araDigits(lang, out);
}
const dirAttr = (lang) => (lang === "ar" ? ' dir="rtl"' : "");

const FORM_LABELS = {
  "booking-inquiry": "Booking inquiry",
  "date-request": "Date request",
  "gift-card": "Gift card",
  newsletter: "Newsletter signup",
  contact: "Contact message",
  "seat-request": "Group seat request",
  "charter-request": "Private charter request",
  "new-member": "New member",
};

// Forms that also send a branded confirmation to the guest directly.
const GUEST_FORMS = new Set(["seat-request", "charter-request"]);

// Human labels for the homepage wizard time slots.
const TIME_LABELS = {
  morning: "Morning cruise, 8:00 to 12:00",
  afternoon: "Afternoon cruise, 13:00 to 17:00",
  evening: "Evening cruise, 18:00 to 22:00",
};

async function sendBrevo(body) {
  return fetch(BREVO_ENDPOINT, {
    method: "POST",
    headers: {
      "api-key": process.env.BREVO_API_KEY,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(body),
  });
}

exports.handler = async (event) => {
  if (!process.env.BREVO_API_KEY) {
    return { statusCode: 200, body: "BREVO_API_KEY missing, skipping" };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: "invalid JSON" };
  }

  const submission = payload.payload || {};
  const formName = submission.form_name || "unknown";
  const label = FORM_LABELS[formName] || formName;
  const data = submission.data || {};
  const submittedAt = submission.created_at || new Date().toISOString();

  // New member joined: a warm, motivating note to Issam (not a data dump).
  if (formName === "new-member") {
    const first =
      data.nickname || data.first_name || String(data.email || "").split("@")[0] || "a new member";
    const res = await sendBrevo({
      sender: { email: FROM_EMAIL, name: FROM_NAME },
      to: [{ email: HUB_EMAIL, name: "Issam" }],
      replyTo: data.email ? { email: data.email, name: first } : undefined,
      subject: `A new member just joined, ${first} ⚓`,
      htmlContent: renderMemberJoinedEmail(data, first),
      textContent: renderMemberJoinedText(data, first),
    });
    if (!res.ok) {
      const err = await res.text();
      return { statusCode: 500, body: `Brevo error: ${res.status} ${err}` };
    }
    return { statusCode: 200, body: "member-notified" };
  }

  // Hide the technical noise (IP, user agent, referrer) and the internal terms flag.
  const HIDE = ["bot-field", "form-name", "ip", "user_agent", "referrer", "user agent", "terms", "companions_json", "cruise_starts_at"];
  const rows = Object.entries(data)
    .filter(([k]) => !HIDE.includes(k))
    .map(([k, v]) => ({
      key: k,
      value: typeof v === "string" ? v : JSON.stringify(v),
    }));

  const paid = paymentStatusFor(formName);
  const html = renderEmail({ label, rows, submittedAt, formName, paid });
  const text = renderText({ label, rows, submittedAt, paid });

  const subjectName =
    data.name || data.first_name || data.email || "New submission";
  const subject = `[Bonjour Cruise] ${label}: ${subjectName}`;

  const replyTo = data.email
    ? { email: data.email, name: data.name || data.first_name || "" }
    : undefined;

  const body = {
    sender: { email: FROM_EMAIL, name: FROM_NAME },
    to: [{ email: HUB_EMAIL, name: "Hub" }],
    replyTo,
    subject,
    htmlContent: html,
    textContent: text,
  };

  const res = await sendBrevo(body);

  if (!res.ok) {
    const err = await res.text();
    return { statusCode: 500, body: `Brevo error: ${res.status} ${err}` };
  }

  // Branded confirmation to the guest directly (booking flows only).
  const custLang = normLang(data.lang);
  if (GUEST_FORMS.has(formName) && data.email) {
    const firstName =
      data.first_name || String(data.name || "").trim().split(/\s+/)[0] || "there";
    const guestBody = {
      sender: { email: FROM_EMAIL, name: FROM_NAME },
      to: [{ email: data.email, name: data.name || firstName }],
      replyTo: { email: "info@bonjourcruise.com", name: FROM_NAME },
      subject:
        formName === "charter-request"
          ? T("Your private charter request is in ⚓", custLang)
          : !data.cruise_starts_at
            ? T("You are on the list for the next shared cruise ⚓", custLang)
            : T("Your seat is waiting, one step to go ⚓", custLang),
      htmlContent: renderGuestEmail({ firstName, data, formName, lang: custLang }),
      textContent: renderGuestText({ firstName, data, formName, lang: custLang }),
    };
    const gres = await sendBrevo(guestBody);
    if (!gres.ok) {
      // Hub email already sent; log but keep going (companions still matter).
      const gerr = await gres.text();
      console.log(`guest email failed: ${gres.status} ${gerr}`);
    }
  }

  // Companion invites: every guest in their circle gets the cruise details + a
  // link to create their own Bonjour Cruise account, so they are looked after
  // and join the community, and Issam already has their contact from the hub email.
  if (formName === "seat-request" && data.companions_json) {
    let circle = [];
    try { circle = JSON.parse(data.companions_json); } catch { circle = []; }
    const lead = data.first_name || String(data.name || "").trim().split(/\s+/)[0] || "A friend";
    for (const c of Array.isArray(circle) ? circle : []) {
      const cEmail = String((c && c.email) || "").trim();
      if (!cEmail) continue;
      const cName = String((c && c.first) || "").trim() || "there";
      const compBody = {
        sender: { email: FROM_EMAIL, name: FROM_NAME },
        to: [{ email: cEmail, name: cName }],
        replyTo: { email: "info@bonjourcruise.com", name: FROM_NAME },
        subject: T("{lead} saved you a seat on a Bonjour Cruise ⚓", custLang, { lead }),
        htmlContent: renderCompanionEmail({ firstName: cName, lead, data, lang: custLang }),
        textContent: renderCompanionText({ firstName: cName, lead, data, lang: custLang }),
      };
      const cres = await sendBrevo(compBody);
      if (!cres.ok) {
        const cerr = await cres.text();
        console.log(`companion email failed for ${cEmail}: ${cres.status} ${cerr}`);
      }
    }
  }

  return { statusCode: 200, body: "sent" };
};

function paymentStatusFor(formName) {
  if (formName === "seat-request") {
    return { label: "Awaiting payment", note: "They were sent to checkout. Not paid yet, confirm once payment lands." };
  }
  if (formName === "charter-request") {
    return { label: "Quote request", note: "No payment taken. Prepare their tailored quote." };
  }
  return null;
}

function renderEmail({ label, rows, submittedAt, formName, paid }) {
  const rowsHtml = rows
    .map(
      ({ key, value }) => `
        <tr>
          <td style="padding:14px 20px;border-bottom:1px solid rgba(201,138,142,0.18);font-family:'Cormorant Garamond',Georgia,serif;font-size:15px;letter-spacing:0.06em;text-transform:uppercase;color:#B0656C;width:38%;vertical-align:top;">${escapeHtml(prettyKey(key))}</td>
          <td style="padding:14px 20px;border-bottom:1px solid rgba(201,138,142,0.18);font-family:Inter,-apple-system,sans-serif;font-size:16px;line-height:1.6;color:#2B2F3A;">${escapeHtml(value).replace(/\n/g, "<br>")}</td>
        </tr>`,
    )
    .join("");

  const paidBanner = paid
    ? `<tr><td style="padding:24px 40px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="background:#FBEFE9;border:1px solid #E7C3C6;border-radius:14px;padding:16px 20px;">
          <p style="margin:0;font-family:Inter,sans-serif;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#B0656C;">${escapeHtml(paid.label)}</p>
          <p style="margin:5px 0 0;font-family:Inter,sans-serif;font-size:15px;line-height:1.5;color:#2B2F3A;">${escapeHtml(paid.note)}</p>
        </td></tr></table>
      </td></tr>`
    : "";

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(label)}</title>
</head>
<body style="margin:0;padding:0;background:#FBF5EF;font-family:Inter,-apple-system,sans-serif;color:#2B2F3A;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FBF5EF;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#FFFFFF;border-radius:24px;overflow:hidden;box-shadow:0 26px 64px rgba(201,138,142,0.22);">
          <tr>
            <td style="background:linear-gradient(135deg,#E3B9BB 0%,#C98A8E 55%,#A8555C 100%);padding:46px 40px 38px;text-align:center;">
              <p style="margin:0 0 10px;font-family:Inter,sans-serif;font-size:11px;letter-spacing:0.26em;text-transform:uppercase;color:#FFF3EF;">Bonjour Cruise &middot; Dubai &#127800;</p>
              <h1 style="margin:0;font-family:'Cormorant Garamond',Georgia,serif;font-size:36px;font-weight:400;font-style:italic;color:#FFFFFF;letter-spacing:0.02em;">${escapeHtml(label)}</h1>
            </td>
          </tr>
          ${paidBanner}
          <tr>
            <td style="padding:30px 40px 12px;">
              <p style="margin:0 0 6px;font-family:Inter,sans-serif;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#B0656C;">Received</p>
              <p style="margin:0 0 22px;font-family:Inter,sans-serif;font-size:15px;color:#2B2F3A;">${formatDate(submittedAt)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FDF6F1;border-radius:14px;">
                ${rowsHtml}
              </table>
            </td>
          </tr>
          <tr>
            <td style="background:#F7E9EA;padding:24px 40px;text-align:center;">
              <p style="margin:0;font-family:'Cormorant Garamond',Georgia,serif;font-size:15px;font-style:italic;color:#8A5A5F;">Reply directly to answer them from info@bonjourcruise.com</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function renderText({ label, rows, submittedAt, paid }) {
  const lines = [
    `BONJOUR CRUISE: ${label}`,
    paid ? `${paid.label}: ${paid.note}` : "",
    `Received: ${formatDate(submittedAt)}`,
    "",
    ...rows.map(({ key, value }) => `${prettyKey(key)}: ${value}`),
    "",
    "Reply directly to answer them.",
  ].filter(Boolean);
  return lines.join("\n");
}

function prettyKey(k) {
  return k
    .replace(/_/g, " ")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function escapeHtml(v) {
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Dubai",
    });
  } catch {
    return iso;
  }
}

/* ==========================================================================
   GUEST CONFIRMATION: the branded email the guest receives after
   they complete the homepage booking wizard. Warm, on-brand, with the day's
   programme and what happens next. Kept dark-on-light and em-dash-free.
   ========================================================================== */

// Meeting point. PLACEHOLDER until Issam sets the exact berth; the maps link
// still works as a search so they always have a way to find us.
const MEETING = {
  name: "Dubai Marina Yacht Club",
  address: "Dubai Marina, Dubai, United Arab Emirates",
  maps: "https://www.google.com/maps/search/?api=1&query=Dubai+Marina+Yacht+Club",
};

function programSteps(formName, timeKey, lang = "en") {
  const openers = {
    morning: "Board over calm morning waters with Arabic coffee and dates.",
    afternoon: "Board in the golden afternoon light with a welcome drink.",
    evening: "Board at golden hour as the city lights begin to glow.",
  };
  const closers = {
    morning: "Return refreshed, the whole day still ahead of you.",
    afternoon: "Cruise back along the coast as the sun softens.",
    evening: "Sail into the Dubai sunset, the sky turning rose and gold.",
  };
  const opener = openers[timeKey] || "Board and settle in as we cast off along the coast.";
  const closer = closers[timeKey] || "Cruise back along the Dubai coastline at ease.";
  return [
    ["Welcome aboard", opener],
    ["Good company", "A warm, well-vetted crew and the whole deck is yours to enjoy."],
    ["Sail and swim", "Glide past the Dubai skyline, pause to swim in clear water, and relax."],
    ["Refresh", "Halal refreshments and, if you have added them, your chosen touches."],
    ["Golden finish", closer],
  ].map(([title, desc]) => [T(title, lang), T(desc, lang)]);
}

function renderGuestEmail({ firstName, data, formName, lang = "en" }) {
  const isCharter = formName === "charter-request";
  const timeKey = String(data.time || "").toLowerCase();
  const timeLabel = TIME_LABELS[timeKey] ? T(TIME_LABELS[timeKey], lang) : (data.time ? escapeHtml(data.time) : "");

  const isNotify = !isCharter && !data.cruise_starts_at;
  const intro = isCharter
    ? T("Thank you for your private charter request. The whole yacht will be yours, styled your way, with a warm, well-vetted crew. Our team is preparing your tailored quote and will confirm your date shortly.", lang)
    : isNotify
      ? T("Thank you. No shared cruise date is open just yet, and you are first on the list. The moment one is scheduled we will let you know so you can claim your seat.", lang)
      : T("We have your details and your seat is waiting for you. It stays open while you finish your payment, then you are set to sail with everyone else aboard. Until it is paid the seat is not yet yours, so complete it soon to make it yours.", lang);

  const summaryRows = [];
  if (timeLabel) summaryRows.push([T("Cruise", lang), timeLabel]);
  if (!isCharter && data.seats) summaryRows.push([T("Seats", lang), `${escapeHtml(data.seats)}`]);
  if (isCharter && data.addons) summaryRows.push([T("Your touches", lang), escapeHtml(data.addons)]);
  if (isCharter && data.estimate) summaryRows.push([T("Estimate", lang), escapeHtml(data.estimate)]);

  const summaryHtml = summaryRows
    .map(
      ([k, v]) => `
        <tr>
          <td style="padding:12px 20px;border-bottom:1px solid rgba(201,138,142,0.18);font-family:'Cormorant Garamond',Georgia,serif;font-size:14px;letter-spacing:0.06em;text-transform:uppercase;color:#B0656C;width:36%;vertical-align:top;">${k}</td>
          <td style="padding:12px 20px;border-bottom:1px solid rgba(201,138,142,0.18);font-family:Inter,-apple-system,sans-serif;font-size:16px;line-height:1.6;color:#2B2F3A;">${v}</td>
        </tr>`,
    )
    .join("");

  const stepsHtml = programSteps(formName, timeKey, lang)
    .map(
      ([title, desc]) => `
        <tr>
          <td style="padding:10px 0;vertical-align:top;width:26px;">
            <span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:#C98A8E;margin-top:6px;"></span>
          </td>
          <td style="padding:10px 0;">
            <p style="margin:0;font-family:'Cormorant Garamond',Georgia,serif;font-size:18px;color:#1C2B4A;">${title}</p>
            <p style="margin:2px 0 0;font-family:Inter,sans-serif;font-size:14px;line-height:1.6;color:#5C5A5E;">${desc}</p>
          </td>
        </tr>`,
    )
    .join("");

  const nextStep = isCharter
    ? T("We will be in touch on WhatsApp or by email with your tailored quote and to confirm your date.", lang)
    : isNotify
      ? T("We will reach you on WhatsApp or by email the moment a date opens.", lang)
      : T("As soon as your payment is complete your seat is confirmed and we send your final details. If you did not finish, the link in our reminder brings you right back to it.", lang);

  return `<!doctype html>
<html${dirAttr(lang)}>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bonjour Cruise</title></head>
<body style="margin:0;padding:0;background:#FBF5EF;font-family:Inter,-apple-system,sans-serif;color:#2B2F3A;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FBF5EF;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#FFFFFF;border-radius:22px;overflow:hidden;box-shadow:0 26px 64px rgba(28,43,74,0.13);">
          <tr>
            <td style="background:linear-gradient(135deg,#E3B9BB 0%,#C98A8E 55%,#A8555C 100%);padding:46px 40px 40px;text-align:center;">
              <p style="margin:0 0 10px;font-family:Inter,sans-serif;font-size:11px;letter-spacing:0.26em;text-transform:uppercase;color:#FFF3EF;">Bonjour Cruise &middot; Dubai &#127800;</p>
              <h1 style="margin:0;font-family:'Cormorant Garamond',Georgia,serif;font-size:34px;font-weight:400;font-style:italic;color:#FFFFFF;letter-spacing:0.02em;">${T("The sea is yours", lang)}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:36px 40px 8px;">
              <p style="margin:0 0 16px;font-family:'Cormorant Garamond',Georgia,serif;font-size:22px;color:#A8555C;">${T("Hi {name},", lang, { name: escapeHtml(firstName) })}</p>
              <p style="margin:0 0 8px;font-family:Inter,sans-serif;font-size:16px;line-height:1.7;color:#2B2F3A;">${intro}</p>
            </td>
          </tr>
          ${
            summaryHtml
              ? `<tr><td style="padding:12px 40px 8px;">
                   <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FBF5EF;border-radius:12px;">${summaryHtml}</table>
                 </td></tr>`
              : ""
          }
          <tr>
            <td style="padding:16px 40px 4px;">
              <p style="margin:0 0 4px;font-family:Inter,sans-serif;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#B0656C;">${T("Where to meet", lang)}</p>
              <p style="margin:0;font-family:Inter,sans-serif;font-size:15px;line-height:1.7;color:#2B2F3A;">${MEETING.name}, ${MEETING.address}. <a href="${MEETING.maps}" style="color:#A8555C;font-weight:600;">${T("Open in Google Maps", lang)}</a>. ${T("We confirm the exact berth with your final details.", lang)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 40px 4px;">
              <p style="margin:0 0 4px;font-family:Inter,sans-serif;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#B0656C;">${T("A taste of your day", lang)}</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${stepsHtml}</table>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 40px 4px;">
              <p style="margin:0 0 4px;font-family:Inter,sans-serif;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#B0656C;">${T("What to bring", lang)}</p>
              <p style="margin:0;font-family:Inter,sans-serif;font-size:15px;line-height:1.7;color:#2B2F3A;">${T("Swimwear and a cover-up, sunglasses, sunscreen, a light layer for the breeze, and above all your good mood. We take care of the rest.", lang)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px 8px;">
              <p style="margin:0 0 4px;font-family:Inter,sans-serif;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#B0656C;">${T("What happens next", lang)}</p>
              <p style="margin:0;font-family:Inter,sans-serif;font-size:15px;line-height:1.7;color:#2B2F3A;">${nextStep}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px 36px;text-align:center;">
              <a href="https://wa.me/971585986118" style="display:inline-block;background:#C98A8E;color:#FFFFFF;text-decoration:none;font-family:Inter,sans-serif;font-size:15px;padding:14px 30px;border-radius:999px;">${T("Message us on WhatsApp", lang)}</a>
            </td>
          </tr>
          <tr>
            <td style="background:#F3E7DC;padding:24px 40px;text-align:center;">
              <p style="margin:0 0 4px;font-family:'Cormorant Garamond',Georgia,serif;font-size:16px;font-style:italic;color:#1C2B4A;">${T("Shared yacht cruises, Dubai", lang)}</p>
              <p style="margin:0;font-family:Inter,sans-serif;font-size:13px;color:#5C5A5E;">info@bonjourcruise.com · bonjourcruise.com</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function renderGuestText({ firstName, data, formName, lang = "en" }) {
  const isCharter = formName === "charter-request";
  const timeKey = String(data.time || "").toLowerCase();
  const timeLabel = TIME_LABELS[timeKey] ? T(TIME_LABELS[timeKey], lang) : (data.time || "");
  const lines = [
    `BONJOUR CRUISE, ${T("The sea is yours", lang)}`,
    "",
    T("Hi {name},", lang, { name: firstName }),
    "",
    isCharter
      ? T("Thank you for your private charter request. The whole yacht will be yours, styled your way, with a warm, well-vetted crew. Our team is preparing your tailored quote and will confirm your date shortly.", lang)
      : !data.cruise_starts_at
        ? T("Thank you. No shared cruise date is open just yet, and you are first on the list. The moment one is scheduled we will let you know so you can claim your seat.", lang)
        : T("We have your details and your seat is waiting for you. It stays open while you finish your payment, then you are set to sail with everyone else aboard. Until it is paid the seat is not yet yours, so complete it soon to make it yours.", lang),
    "",
  ];
  if (timeLabel) lines.push(`${T("Cruise", lang)}: ${timeLabel}`);
  if (!isCharter && data.seats) lines.push(`${T("Seats", lang)}: ${data.seats}`);
  if (isCharter && data.addons) lines.push(`${T("Your touches", lang)}: ${data.addons}`);
  if (isCharter && data.estimate) lines.push(`${T("Estimate", lang)}: ${data.estimate}`);
  lines.push(
    "",
    `${T("Where to meet", lang)}: ${MEETING.name}, ${MEETING.address}. Google Maps: ${MEETING.maps}`,
    "",
    `${T("A taste of your day", lang)}:`,
    ...programSteps(formName, timeKey, lang).map(([t, d]) => `- ${t}: ${d}`),
    "",
    `${T("What to bring", lang)}: ${T("Swimwear and a cover-up, sunglasses, sunscreen, a light layer for the breeze, and above all your good mood. We take care of the rest.", lang)}`,
    "",
    isCharter
      ? T("We will be in touch on WhatsApp or by email with your tailored quote and to confirm your date.", lang)
      : !data.cruise_starts_at
        ? T("We will reach you on WhatsApp or by email the moment a date opens.", lang)
        : T("As soon as your payment is complete your seat is confirmed and we send your final details. If you did not finish, the link in our reminder brings you right back to it.", lang),
    "",
    "WhatsApp: +971 58 598 6118",
    "info@bonjourcruise.com · bonjourcruise.com",
  );
  return lines.join("\n");
}

/* ==========================================================================
   COMPANION INVITE: the branded email each guest in the circle receives when
   the lead booked seats for them. They get the cruise details + a link to
   create their own Bonjour Cruise account. Dark-on-light, em-dash-free.
   ========================================================================== */

const ACCOUNT_URL = "https://bonjourcruise.com/account.html";

function renderCompanionEmail({ firstName, lead, data, lang = "en" }) {
  const cruiseLine = data.cruise ? escapeHtml(data.cruise) : T("A shared Bonjour Cruise", lang);
  const portLine = data.cruise_port ? escapeHtml(data.cruise_port) : `${MEETING.name}, ${MEETING.address}`;
  return `<!doctype html>
<html${dirAttr(lang)}>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bonjour Cruise</title></head>
<body style="margin:0;padding:0;background:#FBF5EF;font-family:Inter,-apple-system,sans-serif;color:#2B2F3A;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FBF5EF;">
    <tr><td align="center" style="padding:40px 20px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#FFFFFF;border-radius:22px;overflow:hidden;box-shadow:0 26px 64px rgba(28,43,74,0.13);">
        <tr><td style="background:linear-gradient(135deg,#E3B9BB 0%,#C98A8E 55%,#A8555C 100%);padding:46px 40px 40px;text-align:center;">
          <p style="margin:0 0 10px;font-family:Inter,sans-serif;font-size:11px;letter-spacing:0.26em;text-transform:uppercase;color:#FFF3EF;">Bonjour Cruise &middot; Dubai &#127800;</p>
          <h1 style="margin:0;font-family:'Cormorant Garamond',Georgia,serif;font-size:34px;font-weight:400;font-style:italic;color:#FFFFFF;letter-spacing:0.02em;">${T("You're invited aboard", lang)}</h1>
        </td></tr>
        <tr><td style="padding:36px 40px 8px;">
          <p style="margin:0 0 16px;font-family:'Cormorant Garamond',Georgia,serif;font-size:22px;color:#A8555C;">${T("Hi {name},", lang, { name: escapeHtml(firstName) })}</p>
          <p style="margin:0 0 8px;font-family:Inter,sans-serif;font-size:16px;line-height:1.7;color:#2B2F3A;">${T("{lead} has saved you a seat on a shared Bonjour Cruise in Dubai. A warm, vetted crew and the sea entirely yours. We cannot wait to have you aboard.", lang, { lead: escapeHtml(lead) })}</p>
        </td></tr>
        <tr><td style="padding:12px 40px 8px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FBF5EF;border-radius:12px;">
            <tr>
              <td style="padding:12px 20px;border-bottom:1px solid rgba(201,138,142,0.18);font-family:'Cormorant Garamond',Georgia,serif;font-size:14px;letter-spacing:0.06em;text-transform:uppercase;color:#B0656C;width:36%;vertical-align:top;">${T("Your cruise", lang)}</td>
              <td style="padding:12px 20px;border-bottom:1px solid rgba(201,138,142,0.18);font-family:Inter,sans-serif;font-size:16px;line-height:1.6;color:#2B2F3A;">${cruiseLine}</td>
            </tr>
            <tr>
              <td style="padding:12px 20px;font-family:'Cormorant Garamond',Georgia,serif;font-size:14px;letter-spacing:0.06em;text-transform:uppercase;color:#B0656C;vertical-align:top;">${T("Where to meet", lang)}</td>
              <td style="padding:12px 20px;font-family:Inter,sans-serif;font-size:16px;line-height:1.6;color:#2B2F3A;">${portLine}<br><a href="${MEETING.maps}" style="color:#A8555C;font-weight:600;">${T("Open in Google Maps", lang)}</a></td>
            </tr>
          </table>
        </td></tr>
        <tr><td style="padding:20px 40px 4px;">
          <p style="margin:0 0 4px;font-family:Inter,sans-serif;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#B0656C;">${T("Create your Bonjour Cruise account", lang)}</p>
          <p style="margin:0;font-family:Inter,sans-serif;font-size:15px;line-height:1.7;color:#2B2F3A;">${T("Create your own account to see your cruise details, who is aboard, and be the first to know about new departures. It takes a minute.", lang)}</p>
        </td></tr>
        <tr><td style="padding:18px 40px 8px;text-align:center;">
          <a href="${ACCOUNT_URL}" style="display:inline-block;background:#C98A8E;color:#FFFFFF;text-decoration:none;font-family:Inter,sans-serif;font-size:15px;padding:14px 30px;border-radius:999px;">${T("Create my account", lang)}</a>
        </td></tr>
        <tr><td style="padding:16px 40px 4px;">
          <p style="margin:0 0 4px;font-family:Inter,sans-serif;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#B0656C;">${T("What to bring", lang)}</p>
          <p style="margin:0;font-family:Inter,sans-serif;font-size:15px;line-height:1.7;color:#2B2F3A;">${T("Swimwear and a cover-up, sunglasses, sunscreen, a light layer for the breeze, and above all your good mood. We take care of the rest.", lang)}</p>
        </td></tr>
        <tr><td style="padding:14px 40px 4px;text-align:center;">
          <p style="margin:0;font-family:Inter,sans-serif;font-size:13px;line-height:1.6;color:#8A7B70;">${T("Landed in spam or promotions? Move it to your inbox and add info@bonjourcruise.com to your contacts so you never miss your cruise.", lang)}</p>
        </td></tr>
        <tr><td style="padding:14px 40px 36px;text-align:center;">
          <a href="https://wa.me/971585986118" style="display:inline-block;color:#A8555C;text-decoration:none;font-family:Inter,sans-serif;font-size:14px;">${T("A question? Message us on WhatsApp", lang)}</a>
        </td></tr>
        <tr><td style="background:#F3E7DC;padding:24px 40px;text-align:center;">
          <p style="margin:0 0 4px;font-family:'Cormorant Garamond',Georgia,serif;font-size:16px;font-style:italic;color:#1C2B4A;">${T("Shared yacht cruises, Dubai", lang)}</p>
          <p style="margin:0;font-family:Inter,sans-serif;font-size:13px;color:#5C5A5E;">info@bonjourcruise.com · bonjourcruise.com</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function renderCompanionText({ firstName, lead, data, lang = "en" }) {
  const cruiseLine = data.cruise || T("A shared Bonjour Cruise", lang);
  const portLine = data.cruise_port || `${MEETING.name}, ${MEETING.address}`;
  return [
    `BONJOUR CRUISE, ${T("You're invited aboard", lang)}`,
    "",
    T("Hi {name},", lang, { name: firstName }),
    "",
    T("{lead} has saved you a seat on a shared Bonjour Cruise in Dubai. A warm, vetted crew and the sea entirely yours.", lang, { lead }),
    "",
    `${T("Your cruise", lang)}: ${cruiseLine}`,
    `${T("Where to meet", lang)}: ${portLine}. Google Maps: ${MEETING.maps}`,
    "",
    `${T("Create your Bonjour Cruise account", lang)}: ${ACCOUNT_URL}`,
    "",
    `${T("What to bring", lang)}: ${T("Swimwear and a cover-up, sunglasses, sunscreen, a light layer for the breeze, and above all your good mood. We take care of the rest.", lang)}`,
    "",
    "WhatsApp: +971 58 598 6118",
    "info@bonjourcruise.com · bonjourcruise.com",
  ].join("\n");
}

/* ==========================================================================
   NEW MEMBER: a warm, motivating note to Issam each time a new member joins.
   Built to feel like a small win, not a data dump. Dark-on-light, em-dash-free.
   ========================================================================== */

function renderMemberJoinedEmail(data, first) {
  const rows = [];
  const full = `${data.first_name || ""} ${data.last_name || ""}`.trim();
  if (full) rows.push(["Name", escapeHtml(full)]);
  if (data.nickname) rows.push(["Nickname", escapeHtml(data.nickname)]);
  if (data.email) rows.push(["Email", escapeHtml(data.email)]);
  if (data.nationality) rows.push(["From", escapeHtml(data.nationality)]);
  if (data.whatsapp) rows.push(["WhatsApp", escapeHtml(data.whatsapp)]);
  const rowsHtml = rows
    .map(
      ([k, v]) => `
        <tr>
          <td style="padding:11px 20px;border-bottom:1px solid rgba(201,138,142,0.18);font-family:'Cormorant Garamond',Georgia,serif;font-size:14px;letter-spacing:0.06em;text-transform:uppercase;color:#B0656C;width:34%;vertical-align:top;">${k}</td>
          <td style="padding:11px 20px;border-bottom:1px solid rgba(201,138,142,0.18);font-family:Inter,sans-serif;font-size:16px;color:#2B2F3A;">${v}</td>
        </tr>`,
    )
    .join("");

  return `<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>A new member joined</title></head>
<body style="margin:0;padding:0;background:#FBF5EF;font-family:Inter,-apple-system,sans-serif;color:#2B2F3A;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FBF5EF;">
    <tr><td align="center" style="padding:40px 20px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#FFFFFF;border-radius:24px;overflow:hidden;box-shadow:0 26px 64px rgba(201,138,142,0.22);">
        <tr><td style="background:linear-gradient(135deg,#E3B9BB 0%,#C98A8E 55%,#A8555C 100%);padding:48px 40px 42px;text-align:center;">
          <p style="margin:0 0 12px;font-size:34px;">&#127800;</p>
          <p style="margin:0 0 6px;font-family:Inter,sans-serif;font-size:11px;letter-spacing:0.26em;text-transform:uppercase;color:#FFF3EF;">Bonjour Cruise</p>
          <h1 style="margin:0;font-family:'Cormorant Garamond',Georgia,serif;font-size:34px;font-weight:400;font-style:italic;color:#FFFFFF;">A new member just joined</h1>
        </td></tr>
        <tr><td style="padding:36px 40px 6px;">
          <p style="margin:0 0 16px;font-family:'Cormorant Garamond',Georgia,serif;font-size:24px;color:#A8555C;">${escapeHtml(first)} said yes to the sea.</p>
          <p style="margin:0 0 12px;font-family:Inter,sans-serif;font-size:16px;line-height:1.75;color:#2B2F3A;">Issam, one more person just trusted what you are building. Every account is a real person choosing your world, your promise, your calm. This is momentum, and it is yours.</p>
          <p style="margin:0;font-family:Inter,sans-serif;font-size:16px;line-height:1.75;color:#2B2F3A;">Brick by brick, one by one. Keep going. The tide is with you.</p>
        </td></tr>
        ${
          rowsHtml
            ? `<tr><td style="padding:20px 40px 8px;">
                 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FDF6F1;border-radius:14px;">${rowsHtml}</table>
               </td></tr>`
            : ""
        }
        <tr><td style="padding:22px 40px 40px;text-align:center;">
          <a href="https://bonjourcruise.com/admin" style="display:inline-block;background:#C98A8E;color:#FFFFFF;text-decoration:none;font-family:Inter,sans-serif;font-size:15px;padding:14px 30px;border-radius:999px;">Open your dashboard</a>
          <p style="margin:18px 0 0;font-family:'Cormorant Garamond',Georgia,serif;font-size:17px;font-style:italic;color:#8A5A5F;">Come as one, leave with friends. Because of you.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function renderMemberJoinedText(data, first) {
  const lines = [
    "BONJOUR CRUISE: A new member just joined",
    "",
    `${first} said yes to the sea.`,
    "",
    "Issam, one more person just trusted what you are building. Every account is a real person choosing your world, your promise, your calm. This is momentum, and it is yours. Keep going, the tide is with you.",
    "",
  ];
  const full = `${data.first_name || ""} ${data.last_name || ""}`.trim();
  if (full) lines.push(`Name: ${full}`);
  if (data.nickname) lines.push(`Nickname: ${data.nickname}`);
  if (data.email) lines.push(`Email: ${data.email}`);
  if (data.nationality) lines.push(`From: ${data.nationality}`);
  if (data.whatsapp) lines.push(`WhatsApp: ${data.whatsapp}`);
  lines.push("", "Your dashboard: https://bonjourcruise.com/admin", "Come as one, leave with friends. Because of you.");
  return lines.join("\n");
}
