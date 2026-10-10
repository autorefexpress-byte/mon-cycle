import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSender, langFromResetUrl, resetPasswordEmail, sendResetPasswordEmail } from "../lib/email.js";

const link = (lang) => `https://app.test/api/auth/reset-password/tok123?callbackURL=${encodeURIComponent(`https://app.test/?lang=${lang}`)}`;

test("expediteur : avec ou sans nom", () => {
  assert.deepEqual(parseSender("Mon Cycle <noreply@moncycle.nc>"), { name: "Mon Cycle", email: "noreply@moncycle.nc" });
  assert.deepEqual(parseSender("noreply@moncycle.nc"), { name: "Mon Cycle", email: "noreply@moncycle.nc" });
  assert.deepEqual(parseSender(undefined), { name: "Mon Cycle", email: "" });
});

test("langue lue dans le lien, francais par defaut", () => {
  assert.equal(langFromResetUrl(link("en")), "en");
  assert.equal(langFromResetUrl(link("fr")), "fr");
  assert.equal(langFromResetUrl(link("de")), "fr");
  assert.equal(langFromResetUrl("https://app.test/api/auth/reset-password/tok"), "fr");
  assert.equal(langFromResetUrl("pas une url"), "fr");
});

test("contenu de l'email en francais et en anglais", () => {
  const fr = resetPasswordEmail(link("fr"), "fr");
  assert.equal(fr.subject, "Réinitialise ton mot de passe - Mon Cycle");
  assert.match(fr.html, /Choisir un nouveau mot de passe/);
  assert.match(fr.text, /tok123/);
  const en = resetPasswordEmail(link("en"), "en");
  assert.equal(en.subject, "Reset your password - Mon Cycle");
  assert.match(en.html, /lang="en"/);
});

test("le lien est echappe dans le HTML", () => {
  const { html } = resetPasswordEmail('https://app.test/x?a=1&b="<script>', "fr");
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&amp;b=&quot;&lt;script&gt;"));
});

test("appel a l'API Brevo", async () => {
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => { calls.push({ url, opts }); return new Response("{}", { status: 201 }); };
  process.env.BREVO_API_KEY = "cle-test";
  process.env.EMAIL_FROM = "Mon Cycle <noreply@moncycle.nc>";
  try {
    await sendResetPasswordEmail("lea@exemple.nc", link("en"));
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.BREVO_API_KEY; delete process.env.EMAIL_FROM;
  }
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.brevo.com/v3/smtp/email");
  assert.equal(calls[0].opts.headers["api-key"], "cle-test");
  const body = JSON.parse(calls[0].opts.body);
  assert.deepEqual(body.sender, { name: "Mon Cycle", email: "noreply@moncycle.nc" });
  assert.deepEqual(body.to, [{ email: "lea@exemple.nc" }]);
  assert.equal(body.subject, "Reset your password - Mon Cycle");
  assert.ok(body.htmlContent.includes("tok123") && body.textContent.includes("tok123"));
});

test("refus de Brevo : journalise, sans lever d'erreur", async () => {
  const realFetch = globalThis.fetch, realErr = console.error, logs = [];
  globalThis.fetch = async () => new Response('{"code":"unauthorized"}', { status: 401 });
  console.error = (...a) => logs.push(a.join(" "));
  process.env.BREVO_API_KEY = "mauvaise-cle"; process.env.EMAIL_FROM = "noreply@moncycle.nc";
  try {
    await sendResetPasswordEmail("lea@exemple.nc", link("fr"));
  } finally {
    globalThis.fetch = realFetch; console.error = realErr;
    delete process.env.BREVO_API_KEY; delete process.env.EMAIL_FROM;
  }
  assert.ok(logs.some((l) => l.includes("Brevo a refusé l'email (401)")), logs.join("\n"));
});

test("production sans cle : le lien n'est jamais ecrit dans les logs", async () => {
  const realErr = console.error, realLog = console.log, logs = [];
  console.error = console.log = (...a) => logs.push(a.join(" "));
  process.env.VERCEL_ENV = "production";
  try {
    await sendResetPasswordEmail("lea@exemple.nc", link("fr"));
  } finally {
    console.error = realErr; console.log = realLog; delete process.env.VERCEL_ENV;
  }
  assert.ok(logs.length === 1 && !logs[0].includes("tok123"), logs.join("\n"));
});
