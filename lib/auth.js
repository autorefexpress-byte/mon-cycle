import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { getPool } from "./db.js";

// Version de la politique de confidentialite en vigueur (doit correspondre a
// PRIVACY_POLICY_VERSION dans js/i18n.js). A changer a chaque mise a jour de
// la politique.
export const PRIVACY_POLICY_VERSION = "2026-10";

async function sendResetPasswordEmail(email, url) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "Mon Cycle <onboarding@resend.dev>";
  if (!apiKey) {
    console.log(`[mon-cycle] RESEND_API_KEY absente : lien de reinitialisation pour ${email} -> ${url}`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: email,
      subject: "Reinitialise ton mot de passe - Mon Cycle",
      html: `<p>Tu as demande a reinitialiser ton mot de passe sur Mon Cycle.</p><p><a href="${url}">Choisir un nouveau mot de passe</a></p><p>Ce lien expire rapidement. Si tu n'es pas a l'origine de cette demande, ignore cet email.</p>`,
    }),
  });
  if (!res.ok) {
    // On journalise sans renvoyer d'erreur au client : sinon la reponse
    // differerait selon que le compte existe ou non (enumeration d'emails).
    console.error(`[mon-cycle] Resend a refuse l'email (${res.status}) : ${await res.text()}`);
  }
}

export const auth = betterAuth({
  database: getPool(),
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  basePath: "/api/auth",
  trustedOrigins: (process.env.TRUSTED_ORIGINS || "").split(",").filter(Boolean),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    // Apres une reinitialisation, tous les appareils connectes sont
    // deconnectes : si quelqu'un avait acces au compte, il le perd.
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => sendResetPasswordEmail(user.email, url),
  },
  user: {
    deleteUser: { enabled: true },
    // Preuve du consentement (RGPD art. 7.1) : version de la politique
    // acceptee et date, fixee cote serveur. Non obligatoires en base pour ne
    // pas bloquer les comptes crees avant leur ajout.
    additionalFields: {
      consentVersion: { type: "string", required: false, input: true },
      consentAt: { type: "date", required: false, input: false },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          if (user.consentVersion !== PRIVACY_POLICY_VERSION) {
            throw new APIError("BAD_REQUEST", { code: "CONSENT_REQUIRED", message: "Consent to the current privacy policy is required." });
          }
          return { data: { ...user, consentAt: new Date() } };
        },
      },
    },
  },
  // Stockage en base : en memoire, chaque fonction Vercel aurait son propre
  // compteur et la limite serait quasi inefficace.
  rateLimit: {
    enabled: true,
    storage: "database",
  },
});
