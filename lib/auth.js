import { betterAuth } from "better-auth";
import { Pool } from "pg";

async function sendResetPasswordEmail(email, url) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "Mon Cycle <onboarding@resend.dev>";
  if (!apiKey) {
    console.log(`[mon-cycle] RESEND_API_KEY absente : lien de reinitialisation pour ${email} -> ${url}`);
    return;
  }
  await fetch("https://api.resend.com/emails", {
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
}

export const auth = betterAuth({
  database: new Pool({ connectionString: process.env.DATABASE_URL }),
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  basePath: "/api/auth",
  trustedOrigins: (process.env.TRUSTED_ORIGINS || "").split(",").filter(Boolean),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    sendResetPassword: async ({ user, url }) => sendResetPasswordEmail(user.email, url),
  },
  user: {
    deleteUser: { enabled: true },
  },
});
