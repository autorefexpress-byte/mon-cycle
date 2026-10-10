// Envoi des emails transactionnels via Brevo (https://www.brevo.com),
// prestataire francais, donnees hebergees dans l'Union europeenne.

const BREVO_URL = "https://api.brevo.com/v3/smtp/email";

const RESET_TEXTS = {
  fr: {
    subject: "Réinitialise ton mot de passe - Mon Cycle",
    title: "Réinitialise ton mot de passe",
    intro: "Tu as demandé à réinitialiser ton mot de passe sur Mon Cycle.",
    button: "Choisir un nouveau mot de passe",
    expiry: "Ce lien est valable 1 heure. Une fois ton mot de passe changé, tous tes appareils seront déconnectés.",
    ignore: "Si tu n'es pas à l'origine de cette demande, ignore cet email : ton mot de passe reste inchangé.",
    fallback: "Si le bouton ne fonctionne pas, copie ce lien dans ton navigateur :",
  },
  en: {
    subject: "Reset your password - Mon Cycle",
    title: "Reset your password",
    intro: "You asked to reset your password on Mon Cycle.",
    button: "Choose a new password",
    expiry: "This link is valid for 1 hour. Once your password is changed, all your devices will be signed out.",
    ignore: "If you didn't make this request, ignore this email: your password stays the same.",
    fallback: "If the button doesn't work, copy this link into your browser:",
  },
};

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// "Mon Cycle <noreply@moncycle.nc>" ou "noreply@moncycle.nc" -> { name, email }
export function parseSender(from) {
  const m = /^\s*(.*?)\s*<\s*([^>\s]+)\s*>\s*$/.exec(from || "");
  if (m) return { name: m[1] || "Mon Cycle", email: m[2] };
  return { name: "Mon Cycle", email: (from || "").trim() };
}

// Langue choisie dans l'app, transmise dans l'adresse de retour du lien
// (redirectTo = ...?lang=fr). Francais par defaut.
export function langFromResetUrl(url) {
  try {
    const callback = new URL(url).searchParams.get("callbackURL");
    const lang = callback ? new URL(callback, url).searchParams.get("lang") : null;
    return lang === "en" ? "en" : "fr";
  } catch (e) {
    return "fr";
  }
}

export function resetPasswordEmail(url, lang = "fr") {
  const t = RESET_TEXTS[lang] || RESET_TEXTS.fr;
  const href = escapeHtml(url);
  const html = `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F5F5F5;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#1A1A1A;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F5F5;padding:32px 16px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#FFFFFF;border-radius:16px;overflow:hidden;">
<tr><td style="background:#E91E8C;padding:24px;text-align:center;color:#FFFFFF;font-size:22px;font-weight:600;">&#127800; Mon Cycle</td></tr>
<tr><td style="padding:28px 24px;">
<h1 style="margin:0 0 12px;font-size:20px;">${t.title}</h1>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#424242;">${t.intro}</p>
<p style="margin:0 0 24px;text-align:center;"><a href="${href}" style="display:inline-block;background:#E91E8C;color:#FFFFFF;text-decoration:none;font-weight:600;font-size:15px;padding:14px 28px;border-radius:14px;">${t.button}</a></p>
<p style="margin:0 0 12px;font-size:13px;line-height:1.6;color:#757575;">${t.expiry}</p>
<p style="margin:0 0 20px;font-size:13px;line-height:1.6;color:#757575;">${t.ignore}</p>
<p style="margin:0;font-size:12px;line-height:1.6;color:#9E9E9E;">${t.fallback}<br><a href="${href}" style="color:#C2185B;word-break:break-all;">${href}</a></p>
</td></tr></table></td></tr></table>
</body></html>`;
  const text = `${t.title}\n\n${t.intro}\n\n${t.button} : ${url}\n\n${t.expiry}\n${t.ignore}\n`;
  return { subject: t.subject, html, text };
}

export async function sendResetPasswordEmail(email, url) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    // En production, on n'ecrit jamais le lien dans les logs : il permettrait
    // a toute personne ayant acces aux logs de prendre le controle du compte.
    if (process.env.VERCEL_ENV === "production") {
      console.error("[mon-cycle] BREVO_API_KEY absente : l'email de réinitialisation n'a pas été envoyé.");
    } else {
      console.log(`[mon-cycle] BREVO_API_KEY absente : lien de reinitialisation pour ${email} -> ${url}`);
    }
    return;
  }
  const sender = parseSender(process.env.EMAIL_FROM);
  if (!sender.email) {
    console.error("[mon-cycle] EMAIL_FROM absente : l'email de réinitialisation n'a pas été envoyé.");
    return;
  }
  const { subject, html, text } = resetPasswordEmail(url, langFromResetUrl(url));
  try {
    const res = await fetch(BREVO_URL, {
      method: "POST",
      headers: { "api-key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ sender, to: [{ email }], subject, htmlContent: html, textContent: text }),
    });
    if (!res.ok) {
      // On journalise sans renvoyer d'erreur au client : sinon la reponse
      // differerait selon que le compte existe ou non (enumeration d'emails).
      console.error(`[mon-cycle] Brevo a refusé l'email (${res.status}) : ${await res.text()}`);
    }
  } catch (e) {
    console.error("[mon-cycle] Envoi Brevo impossible :", e);
  }
}
