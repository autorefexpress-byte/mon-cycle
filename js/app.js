import { createAuthClient } from "https://esm.sh/better-auth@1.7.4/client";
import { T, PRIVACY_POLICY_VERSION } from "./i18n.js";
import {
  parseD, ymd, addDays, diffDays, todayD, sortPeriods, avgCycle, avgPeriodLength,
  periodDays, projections, projectedDays, fertileDays, nearestOvulation, conceptionStage,
  cycleDay, phaseIndex, pregnancyInfo, pregnancyDays, FERTILE_PROBS, FERTILE_BEFORE, FERTILE_AFTER,
} from "./cycle.js";

const authClient = createAuthClient({ baseURL: window.location.origin });

// ---------- Etat ----------

function readLang() {
  try { return localStorage.getItem("moncycle_lang") || "fr"; } catch (e) { return "fr"; }
}
let lang = readLang();
let t = T[lang];
let authMode = "login";

function initialState() {
  return {
    periods: [], settings: { cycle: 28, period: 5, proj: 3 }, mode: "normal", pregStartDate: null, version: 0,
    vy: new Date().getFullYear(), vm: new Date().getMonth(), sel: null, uid: null, email: null, loaded: false,
  };
}
let S = initialState();
const resetToken = new URLSearchParams(location.search).get("token");

// ---------- Petits utilitaires DOM ----------

function g(id) { return document.getElementById(id); }
function st(id, v) { const el = g(id); if (el) el.textContent = v; }
function shi(id, v) { const el = g(id); if (el) el.innerHTML = v; }
function show(id, v, display = "block") { g(id).style.display = v ? display : "none"; }
function fmtDate(d, opts) { return d.toLocaleDateString(t.locale, opts); }

let toastTimer;
function toast(msg) {
  clearTimeout(toastTimer);
  const el = g("toast");
  el.textContent = msg;
  el.classList.add("show");
  toastTimer = setTimeout(() => el.classList.remove("show"), 2400);
}
function authErr(id, msg) { const el = g(id); el.textContent = msg; el.style.display = msg ? "block" : "none"; }
function authErrMsg(error) {
  if (error.status === 429) return t.errRateLimit;
  if (error.code === "CONSENT_REQUIRED") return t.errConsent;
  return t.errMsgs[error.code] || error.message || t.toastError;
}

// ---------- Traductions ----------

function setLang(l) {
  lang = l; t = T[l];
  try { localStorage.setItem("moncycle_lang", l); } catch (e) {}
  document.documentElement.lang = l;
  ["alb-fr", "alb-en", "ltb-fr", "ltb-en"].forEach((id) => g(id).classList.toggle("active", id.endsWith(l)));
  applyT();
  renderCal();
  if (g("tab-hist").classList.contains("active")) renderHist();
}

function applyT() {
  const isL = authMode === "login";
  st("auth-sub", t.authSub); st("auth-mode-title", isL ? t.loginTitle : t.registerTitle);
  st("auth-submit", isL ? t.signInBtn : t.createBtn); st("auth-forgot", t.forgotPwd);
  g("auth-password").placeholder = lang === "fr" ? "Mot de passe" : "Password";
  g("auth-password").autocomplete = isL ? "current-password" : "new-password";
  shi("auth-toggle", isL ? `${t.noAccount} <span>${t.createLink}</span>` : `${t.haveAccount} <span>${t.signInLink}</span>`);
  show("consent-row", !isL, "flex");
  shi("consent-label", `${t.consentPre}<span role="button" tabindex="0" data-action="showPrivacy">${t.consentLink}</span>${t.consentPost}`);
  st("export-btn", t.exportBtn); st("delete-account-btn", t.deleteAccountBtn); st("logout-btn", t.logout);
  if (resetToken) { st("rst-title", t.rstConfirmTitle); st("rst-sub", t.rstConfirmSub); st("rst-btn", t.rstConfirmBtn); }
  else { st("rst-title", t.rstTitle); st("rst-sub", t.rstSub); st("rst-btn", t.rstBtn); }
  st("rst-back", t.rstBack); st("reset-success", t.rstSuccess);
  st("nb-label", t.nextPeriod); st("bc-label", t.fertileWindow); st("bg-label", t.myPregnancy);
  st("log-label", t.logLabel);
  st("nav-lbl-home", t.tabHome); st("nav-lbl-hist", t.tabHist); st("nav-lbl-sett", t.tabSett);
  st("sett-mode-title", t.modeSuiviTitle);
  st("mode-normal-title", t.modeNT); st("mode-normal-sub", t.modeNS);
  st("mode-conception-title", t.modeCT); st("mode-conception-sub", t.modeCS);
  st("mode-grossesse-title", t.modeGT); st("mode-grossesse-sub", t.modeGS);
  st("ddr-title", t.ddrTitle); st("ddr-sub", t.ddrSub); st("ddr-btn", t.ddrBtn);
  st("sett-params-title", t.settParamsTitle);
  st("sett-cycle-lbl", t.settCycleLbl); st("sett-cycle-sub", t.settCycleSub);
  st("sett-period-lbl", t.settPeriodLbl); st("sett-period-sub", t.settPeriodSub);
  st("sett-proj-lbl", t.settProjLbl); st("sett-proj-sub", t.settProjSub);
  st("sett-lang-title", t.settLangTitle); st("sett-lang-lbl", t.settLangLbl);
  st("sett-info-title", t.settInfoTitle);
  st("sett-privacy-lbl", "🔒 " + t.settPrivacyLbl); st("sett-privacy-sub", t.settPrivacySub);
  st("sett-about-lbl", "ℹ️ " + t.settAboutLbl); st("sett-about-sub", t.settAboutSub);
  st("sett-data-title", t.settDataTitle); st("clear-btn", t.clearBtn); st("priv-note", t.privNote);
  st("prv-header-title", t.prvHeaderTitle); st("prv-h1", t.prvH1); st("prv-updated", t.prvUpdated);
  for (let n = 1; n <= 9; n++) { st(`prv-s${n}-h`, t[`prvS${n}h`]); st(`prv-s${n}-p`, t[`prvS${n}p`]); }
  st("abt-header-title", t.abtHeaderTitle); st("abt-version", t.abtVersion); st("abt-tagline", t.abtTagline);
  st("abt-ver-lbl", t.abtVerLbl); st("abt-dev-lbl", t.abtDevLbl); st("abt-lang-lbl", t.abtLangLbl);
  st("abt-launch-lbl", t.abtLaunchLbl); st("abt-contact-lbl", t.abtContactLbl);
  st("abt-privacy-lbl", t.abtPrivacyLbl); st("abt-privacy-link", t.abtPrivacyLink);
  st("abt-credit", t.abtCredit); st("loading-text", t.loading); st("loading-retry", t.retry);
  st("disclaimer", t.disclaimer); st("abt-disclaimer", t.disclaimer);
  // Libelles des boutons a icone, pour les lecteurs d'ecran.
  const aria = { "cal-prev": t.aPrev, "cal-next": t.aNext, "prv-back": t.aBack, "abt-back": t.aBack };
  Object.entries(aria).forEach(([id, label]) => g(id).setAttribute("aria-label", label));
  document.querySelectorAll(".sett-btn").forEach((b) => {
    const [k, d] = b.dataset.arg.split(":");
    b.setAttribute("aria-label", `${d < 0 ? t.aDecrease : t.aIncrease} : ${t[`sett${k[0].toUpperCase()}${k.slice(1)}Lbl`]}`);
  });
  const selEl = g("sel-show");
  if (selEl.classList.contains("ph")) selEl.textContent = t.selPrompt;
  applyMode();
}

function updatePageTitle() {
  const active = ["home", "hist", "sett"].find((tab) => g("tab-" + tab).classList.contains("active")) || "home";
  st("page-title", { home: t.pageHome, hist: t.pageHist, sett: t.pageSett }[active]);
}

// ---------- Ecrans ----------

function showLoading(v, msg) {
  show("loading", v, "flex");
  show("loading-spinner", true);
  show("loading-retry", false);
  st("loading-text", msg || t.loading);
}
function showLoadError() {
  show("loading", true, "flex");
  show("loading-spinner", false);
  st("loading-text", t.loadError);
  show("loading-retry", true);
}
function showApp(v) {
  show("auth-screen", !v, "flex");
  show("reset-screen", false);
  g("reset-screen").classList.remove("active");
  show("main-app", v, "flex");
}
function signedOut() {
  S = initialState();
  showLoading(false);
  showApp(false);
}

function showReset() {
  show("auth-screen", false);
  g("reset-screen").classList.add("active");
  show("reset-screen", true, "flex");
  authErr("reset-error", "");
  show("reset-success", false);
  show("reset-email", !resetToken);
  show("reset-newpass", !!resetToken);
  if (!resetToken) g("reset-email").value = g("auth-email").value || "";
  applyT();
}
function showAuth() {
  g("reset-screen").classList.remove("active");
  show("reset-screen", false);
  show("auth-screen", true, "flex");
}

function goTab(tab) {
  ["home", "hist", "sett"].forEach((tt) => {
    const on = tt === tab;
    g("tab-" + tt).classList.toggle("active", on);
    const n = g("nav-" + tt);
    n.classList.toggle("active", on);
    if (on) n.setAttribute("aria-current", "page"); else n.removeAttribute("aria-current");
    n.querySelector(".nav-lbl").style.color = on ? "var(--pink)" : "";
    n.querySelectorAll("[stroke]").forEach((el) => el.setAttribute("stroke", on ? "#E91E8C" : "#bbb"));
  });
  updatePageTitle();
  g("content").scrollTop = 0;
  if (tab === "hist") renderHist();
}

// ---------- Authentification ----------

async function sendReset() {
  authErr("reset-error", "");
  try {
    if (resetToken) {
      const newPass = g("reset-newpass").value;
      if (!newPass) { authErr("reset-error", t.rstConfirmErrEmpty); return; }
      if (newPass.length < 8) { authErr("reset-error", t.errPwdShort); return; }
      showLoading(true, t.rstConfirming);
      const { error } = await authClient.resetPassword({ newPassword: newPass, token: resetToken });
      showLoading(false);
      if (error) { authErr("reset-error", authErrMsg(error)); return; }
      st("reset-success", t.rstConfirmSuccess); show("reset-success", true); g("reset-newpass").value = "";
      history.replaceState({}, "", location.pathname);
    } else {
      const email = g("reset-email").value.trim();
      if (!email) { authErr("reset-error", t.rstErrEmpty); return; }
      showLoading(true, t.rstSending);
      const { error } = await authClient.requestPasswordReset({ email, redirectTo: window.location.origin + window.location.pathname });
      showLoading(false);
      if (error) { authErr("reset-error", authErrMsg(error)); return; }
      st("reset-success", t.rstSuccess); show("reset-success", true); g("reset-email").value = "";
    }
  } catch (e) { showLoading(false); authErr("reset-error", t.toastError); }
}

function toggleAuthMode() {
  authMode = authMode === "login" ? "register" : "login";
  authErr("auth-error", "");
  g("consent-check").checked = false;
  applyT();
}

async function authSubmit() {
  authErr("auth-error", "");
  const email = g("auth-email").value.trim(), pass = g("auth-password").value;
  if (!email || !pass) { authErr("auth-error", t.errEmpty); return; }
  const isRegister = authMode === "register";
  if (isRegister && !g("consent-check").checked) { authErr("auth-error", t.errConsent); return; }
  if (isRegister && pass.length < 8) { authErr("auth-error", t.errPwdShort); return; }
  showLoading(true, isRegister ? t.creating : t.signingIn);
  try {
    const { error } = isRegister
      // consentVersion : la date du consentement est enregistree cote serveur.
      ? await authClient.signUp.email({ email, password: pass, name: email, consentVersion: PRIVACY_POLICY_VERSION })
      : await authClient.signIn.email({ email, password: pass });
    if (error) { showLoading(false); authErr("auth-error", authErrMsg(error)); return; }
    await initSession();
  } catch (e) { showLoading(false); authErr("auth-error", t.toastError); }
}

async function doLogout() {
  try { await authClient.signOut(); } catch (e) {}
  signedOut();
}

async function deleteAccount() {
  if (!S.uid) return;
  if (!confirm(t.confirmDeleteAccount)) return;
  const pass = prompt(t.reauthPrompt);
  if (!pass) return;
  // La suppression du compte entraine, cote base de donnees (ON DELETE CASCADE),
  // la suppression automatique et immediate de toutes les donnees de cycle associees.
  let error;
  try { ({ error } = await authClient.deleteUser({ password: pass })); } catch (e) { toast(t.toastError); return; }
  if (error) { toast(authErrMsg(error)); return; }
  toast(t.toastAccountDeleted);
  signedOut();
}

// ---------- Donnees (API) ----------

async function fetchData() {
  const res = await fetch("/api/data", { credentials: "include" });
  if (!res.ok) { const e = new Error("load " + res.status); e.status = res.status; throw e; }
  return res.json();
}
function applyServerData(d) {
  S.periods = d.periods || [];
  S.settings = Object.assign({ cycle: 28, period: 5, proj: 3 }, d.settings || {});
  S.mode = d.mode || "normal";
  S.pregStartDate = d.pregStartDate || null;
  S.version = d.version || 0;
  S.loaded = true;
}

// Les sauvegardes passent une par une : chacune envoie l'etat le plus recent
// avec la version connue, et le serveur refuse (409) si un autre appareil a
// enregistre entre-temps.
let saveQueue = Promise.resolve();
let pendingSaves = 0;
function saveData() {
  // Ne jamais envoyer un etat qui n'a pas ete charge depuis le serveur :
  // on ecraserait l'historique en base avec des donnees vides.
  if (!S.uid || !S.loaded) return Promise.reject(new Error("not loaded"));
  pendingSaves++;
  const run = saveQueue.catch(() => {}).then(async () => {
    if (!S.uid || !S.loaded) return;
    const body = JSON.stringify({ periods: S.periods, settings: S.settings, mode: S.mode, pregStartDate: S.pregStartDate, version: S.version });
    const res = await fetch("/api/data", { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body });
    if (res.status === 401 || res.status === 409) {
      const e = new Error("save " + res.status); e.status = res.status;
      if (res.status === 409) { applyServerData(await res.json()); renderAll(); }
      throw e;
    }
    if (!res.ok) throw new Error("save " + res.status);
    S.version = (await res.json()).version;
  }).finally(() => { pendingSaves--; });
  saveQueue = run;
  return run;
}
async function persist() {
  try { await saveData(); }
  catch (e) {
    if (e.status === 401) { toast(t.toastSession); signedOut(); return; }
    toast(e.status === 409 ? t.toastConflict : t.toastError);
  }
}

async function initSession() {
  let data = null;
  try { ({ data } = await authClient.getSession()); } catch (e) {}
  if (!data || !data.user) { signedOut(); return; }
  S.uid = data.user.id; S.email = data.user.email;
  st("user-email", data.user.email);
  showLoading(true, t.loadingData);
  try { applyServerData(await fetchData()); }
  catch (e) { if (e.status === 401) signedOut(); else showLoadError(); return; }
  showLoading(false);
  showApp(true);
  renderAll();
}

// Au retour sur l'app, on recharge si un autre appareil a modifie les donnees.
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState !== "visible" || !S.uid || !S.loaded || pendingSaves) return;
  try {
    const d = await fetchData();
    if (!pendingSaves && S.uid && d.version !== S.version) { applyServerData(d); renderAll(); }
  } catch (e) {}
});

// ---------- Actions ----------

async function setMode(mode) { S.mode = mode; applyMode(); renderCal(); await persist(); }

async function savePregDate() {
  const val = g("preg-start-date").value;
  if (!val) { toast(t.toastSelectDate); return; }
  S.pregStartDate = val;
  applyMode(); renderCal(); toast(t.toastPregSaved);
  await persist();
}

function selectDay(ds) {
  S.sel = ds;
  const lbl = fmtDate(parseD(ds), { weekday: "long", day: "numeric", month: "long" });
  const el = g("sel-show");
  el.textContent = lbl.charAt(0).toUpperCase() + lbl.slice(1);
  el.classList.remove("ph");
  renderCal();
}

async function logStart() {
  if (S.mode === "grossesse") { goTab("sett"); toast(t.toastGrSett); return; }
  if (!S.sel) { toast(t.toastSelectDay); return; }
  if (S.periods.find((p) => p.start === S.sel)) { toast(t.toastAlready); return; }
  S.periods.push({ start: S.sel, end: null });
  S.periods = sortPeriods(S.periods);
  renderCal(); toast(t.toastStart);
  await persist();
}

async function logEnd() {
  if (!S.sel) { toast(t.toastSelectDay); return; }
  // Le debut le plus proche avant (ou le jour meme de) la date choisie.
  const target = S.periods.filter((p) => p.start <= S.sel).sort((a, b) => b.start.localeCompare(a.start))[0];
  if (!target) { toast(t.toastNeedStart); return; }
  target.end = S.sel;
  renderCal(); toast(t.toastEnd);
  await persist();
}

async function delPeriod(start) {
  if (!confirm(t.confirmDelete)) return;
  S.periods = S.periods.filter((p) => p.start !== start);
  renderHist(); renderCal(); toast(t.toastDeleted);
  await persist();
}

async function clearAll() {
  if (!confirm(t.confirmClear)) return;
  S.periods = []; S.mode = "normal"; S.pregStartDate = null;
  renderHist(); renderCal(); applyMode(); toast(t.toastCleared);
  await persist();
}

function exportData() {
  const data = { email: S.email, periods: S.periods, settings: S.settings, mode: S.mode, pregStartDate: S.pregStartDate, exportedAt: new Date().toISOString() };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url; a.download = "mon-cycle-donnees.json";
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast(t.toastExported);
}

const LIM = { cycle: [20, 45], period: [1, 10], proj: [1, 12] };
async function adj(arg) {
  const [k, d] = arg.split(":");
  S.settings[k] = Math.max(LIM[k][0], Math.min(LIM[k][1], S.settings[k] + Number(d)));
  syncSett(); renderCal();
  await persist();
}
function syncSett() {
  st("sv-cycle", S.settings.cycle); st("sv-period", S.settings.period); st("sv-proj", S.settings.proj);
}

function prevMonth() { S.vm--; if (S.vm < 0) { S.vm = 11; S.vy--; } renderCal(); }
function nextMonth() { S.vm++; if (S.vm > 11) { S.vm = 0; S.vy++; } renderCal(); }

// ---------- Affichage ----------

const MODE_UI = {
  normal: { color: "pink", stats: ["statCycleLbl", "statPeriodLbl", "statCountLbl"] },
  conception: { color: "purple", stats: ["statCycleConLbl", "statPeriodConLbl", "statCountConLbl"] },
  grossesse: { color: "blue", stats: ["statCycleGrLbl", "statPeriodGrLbl", "statCountGrLbl"] },
};

function renderAll() {
  syncSett(); applyT(); renderCal();
  if (g("tab-hist").classList.contains("active")) renderHist();
}

function applyMode() {
  const ui = MODE_UI[S.mode] || MODE_UI.normal;
  g("top-bar").className = "top-bar mode-" + S.mode;
  const badge = g("mode-badge");
  show("mode-badge", S.mode !== "normal", "flex");
  if (S.mode === "conception") badge.textContent = "🌿 " + t.modeBadgeC;
  if (S.mode === "grossesse") badge.textContent = "👶 " + t.modeBadgeG;
  Object.keys(MODE_UI).forEach((m) => {
    const c = g("check-" + m), on = m === S.mode;
    c.textContent = on ? "✓" : "";
    c.className = "mode-check" + (on ? " " + MODE_UI[m].color : "");
    c.parentElement.setAttribute("aria-pressed", on);
  });
  show("date-input-card", S.mode === "grossesse");
  if (S.mode === "grossesse" && S.pregStartDate) g("preg-start-date").value = S.pregStartDate;
  ["st-cycle-lbl", "st-period-lbl", "st-count-lbl"].forEach((id, i) => shi(id, t[ui.stats[i]].replace("\n", "<br>")));
  ["st-cycle", "st-period", "st-count"].forEach((id) => { g(id).className = "stat-num " + ui.color; });
  const bs = g("btn-start");
  if (S.mode === "grossesse") {
    bs.textContent = "📅 " + t.btnDdr; bs.className = "btn btn-blue";
    show("btn-end", false);
  } else {
    bs.textContent = t.btnStart; bs.className = "btn " + (S.mode === "conception" ? "btn-purple" : "btn-pink");
    show("btn-end", true, ""); st("btn-end", t.btnEnd);
  }
  updatePageTitle();
}

function renderCal() {
  const { vy: y, vm: m } = S;
  st("cal-month", `${t.MONTHS[m]} ${y}`);
  const pd = periodDays(S.periods, S.settings), prd = projectedDays(S.periods, S.settings);
  const { f, ov } = fertileDays(S.periods, S.settings);
  const today = ymd(todayD());
  const isC = S.mode === "conception", isG = S.mode === "grossesse";
  const pregSet = isG ? pregnancyDays(S.pregStartDate) : new Set();
  const grid = g("cal-grid");
  grid.innerHTML = "";
  const add = (cls, text) => { const e = document.createElement("div"); e.className = cls; if (text != null) e.textContent = text; grid.appendChild(e); return e; };
  t.DAYS.forEach((d) => add("cal-hdr", d).setAttribute("aria-hidden", "true"));
  const off = (new Date(y, m, 1).getDay() + 6) % 7;
  for (let i = 0; i < off; i++) add("day empty");
  const dim = new Date(y, m + 1, 0).getDate();
  for (let d = 1; d <= dim; d++) {
    const ds = ymd(new Date(y, m, d));
    const e = add("day", d);
    if (isG) {
      if (ds === S.pregStartDate) e.classList.add("preg-start");
      else if (pregSet.has(ds)) e.classList.add("preg-day");
    } else {
      if (ov.has(ds)) e.classList.add("ovulation");
      else if (f.has(ds)) e.classList.add("fertile");
      if (isC && (ov.has(ds) || f.has(ds))) e.classList.add("mc");
      if (pd.has(ds)) e.classList.add("period");
      else if (prd.has(ds)) e.classList.add("predicted");
    }
    if (ds === today) e.classList.add("today");
    if (S.sel === ds) e.classList.add("selected");
    e.setAttribute("role", "button");
    e.tabIndex = 0;
    e.setAttribute("aria-label", fmtDate(new Date(y, m, d), { weekday: "long", day: "numeric", month: "long" }));
    e.setAttribute("aria-pressed", S.sel === ds);
    e.dataset.action = "selectDay";
    e.dataset.arg = ds;
  }
  const leg = (bg, border, round, label) => `<div class="leg"><div class="leg-dot" style="background:${bg};${border ? "border:1px solid " + border + ";" : ""}${round ? "border-radius:50%" : ""}"></div>${label}</div>`;
  shi("legend", isG
    ? leg("#9C27B0", null, true, t.legPregStart) + leg("#E3F2FD", "#2196F3", false, t.legPregDay)
    : isC
      ? leg("#E91E8C", null, false, t.legPeriodC) + leg("#9C27B0", null, true, t.legOvC) + leg("#F3E5F5", "#9C27B0", false, t.legFertileC)
      : leg("#E91E8C", null, false, t.legPeriod) + leg("#FCE4EC", "#E91E8C", false, t.legPredicted) + leg("#4CAF50", null, false, t.legOvulation) + leg("#E8F5E9", "#4CAF50", false, t.legFertile));
  updateBanners(); updateStats(); updatePhase(); updateCycBar();
}

const TIP_COLORS = {
  follicular: ["#FFF3E0", "#FF9800", "#E65100", "#BF360C"],
  soon: ["#F3E5F5", "#AB47BC", "#7B1FA2", "#4A148C"],
  open: ["#F3E5F5", "#9C27B0", "#6A1B9A", "#4A148C"],
  d2: ["#EDE7F6", "#7B1FA2", "#4527A0", "#311B92"],
  d1: ["#EDE7F6", "#6A1B9A", "#4527A0", "#311B92"],
  d0: ["#EDE7F6", "#4A148C", "#311B92", "#1A237E"],
  luteal: ["#E8F5E9", "#4CAF50", "#2E7D32", "#1B5E20"],
};

function updateBanners() {
  ["banner-normal", "banner-conception", "banner-grossesse", "baby-card", "conception-tip", "fertile-detail", "fertile-dates"].forEach((id) => show(id, false));
  const today = todayD();
  if (S.mode === "grossesse") renderPregnancyBanner(today);
  else if (S.mode === "conception") renderConception(today);
  else {
    const proj = projections(S.periods, S.settings);
    if (!proj.length) return;
    show("banner-normal", true);
    const next = parseD(proj[0].start);
    st("nb-date", fmtDate(next, { day: "numeric", month: "long", year: "numeric" }));
    st("nb-days", t.inDays(diffDays(next, today)));
  }
}

function renderPregnancyBanner(today) {
  show("banner-grossesse", true);
  const info = pregnancyInfo(S.pregStartDate, today);
  if (!info) { st("bg-week", t.grNoDate); st("bg-days", t.grGoSett); st("bg-dpa", ""); return; }
  st("bg-week", t.grWeek(info.weeks, info.rem));
  st("bg-days", info.daysLeft > 0 ? t.inDays(info.daysLeft) : t.grSoon);
  st("bg-dpa", t.dpaLabel(fmtDate(info.dpa, { day: "numeric", month: "long", year: "numeric" })));
  const w = Math.min(40, Math.max(4, info.weeks));
  show("baby-card", true);
  st("baby-title", t.babyWeekTitle(info.weeks));
  st("baby-text", t.BABY[w] || t.BABY[40]);
}

function renderConception(today) {
  show("banner-conception", true);
  if (!S.periods.length) { st("bc-title", t.cLogFirst); st("bc-sub", t.enterCycleFirst); return; }
  const { f, ov } = fertileDays(S.periods, S.settings);
  const todayStr = ymd(today);
  const nextOv = nearestOvulation(S.periods, S.settings, today);
  const diffOv = nextOv ? diffDays(nextOv, today) : null;
  const fmt = (d) => fmtDate(d, { day: "numeric", month: "long" });

  // Banniere
  if (ov.has(todayStr)) { st("bc-title", t.cOvTodayTitle); st("bc-sub", t.cOvTodaySub); }
  else if (f.has(todayStr)) { st("bc-title", t.cFertileTitle); st("bc-sub", t.cFertileSub); }
  else if (nextOv) { st("bc-title", t.ovInDays(diffOv)); st("bc-sub", fmt(nextOv)); }
  else { st("bc-title", t.cInProgress); st("bc-sub", ""); }
  if (!nextOv) return;

  // Conseil du jour
  const stage = conceptionStage(diffOv);
  const [bg, border, badgeColor, textColor] = TIP_COLORS[stage];
  const tip = g("conception-tip");
  show("conception-tip", true);
  tip.style.background = bg; tip.style.borderLeftColor = border;
  st("ct-badge", t.TIPS[stage].badge); g("ct-badge").style.color = badgeColor;
  st("ct-text", t.TIPS[stage].text(diffOv)); g("ct-text").style.color = textColor;

  // Fenetre fertile visuelle + probabilites
  show("fertile-detail", true);
  st("fd-title", t.fdTitle); st("fd-prob-title", t.fdProbTitle);
  const daysRow = g("fd-days-row");
  daysRow.innerHTML = "";
  FERTILE_PROBS.forEach((item) => {
    const dd = addDays(nextOv, item.d);
    const div = document.createElement("div");
    div.className = "fd-day";
    const cls = "fd-circle" + (item.d === 0 ? " ovulation-c" : " fertile-c") + (dd.getTime() === today.getTime() ? " today-c" : "");
    div.innerHTML = `<div class="${cls}">${dd.getDate()}</div><div class="fd-day-lbl">${t.fdDayLbl(item.d)}</div>`;
    daysRow.appendChild(div);
  });
  shi("fd-prob-bars", FERTILE_PROBS.filter((x) => x.d <= 0).map((item) => {
    const dd = addDays(nextOv, item.d);
    const lbl = item.d === 0 ? t.fdOvulation : `${t.fdDayLbl(item.d)} (${dd.getDate()} ${t.MONTHS[dd.getMonth()].slice(0, 3)})`;
    const color = item.p >= 40 ? "#6A1B9A" : item.p >= 30 ? "#7B1FA2" : item.p >= 20 ? "#9C27B0" : "#AB47BC";
    return `<div class="fd-prob-row"><div class="fd-prob-lbl">${lbl}</div><div class="fd-prob-bar"><div class="fd-prob-fill" style="width:${item.p}%;background:${color}"></div></div><div class="fd-prob-pct">${item.p}%</div></div>`;
  }).join(""));

  // Dates cles
  show("fertile-dates", true);
  st("fd-lbl-start", t.fdStart); st("fd-val-start", fmt(addDays(nextOv, -FERTILE_BEFORE)));
  st("fd-lbl-optimal", t.fdOptimal); st("fd-badge-optimal", fmt(addDays(nextOv, -1)));
  st("fd-lbl-ov", t.fdOv); st("fd-badge-ov", fmt(nextOv));
  st("fd-lbl-end", t.fdEnd); st("fd-val-end", fmt(addDays(nextOv, FERTILE_AFTER)));
  st("fd-lbl-dur", t.fdDur); st("fd-badge-dur", t.fdDurVal);
}

function updateStats() {
  if (S.mode === "grossesse") {
    const info = pregnancyInfo(S.pregStartDate);
    st("st-cycle", info ? `S${info.weeks}` : "—");
    st("st-period", info ? Math.max(0, info.daysLeft) : "—");
    st("st-count", info ? fmtDate(info.dpa, { day: "numeric", month: "short" }) : "—");
    return;
  }
  st("st-count", S.periods.length);
  st("st-cycle", avgCycle(S.periods, S.settings));
  st("st-period", S.mode === "conception" ? FERTILE_BEFORE + FERTILE_AFTER + 1 : avgPeriodLength(S.periods, S.settings));
}

function updatePhase() {
  const cd = S.mode === "grossesse" ? null : cycleDay(S.periods, S.settings);
  if (!cd) { show("phase-card", false); return; }
  const p = t.PHASES[phaseIndex(cd.day, cd.cycle, S.settings.period)];
  const pc = g("phase-card");
  show("phase-card", true);
  pc.style.borderLeftColor = p.col;
  const badge = g("phase-badge");
  badge.textContent = p.name; badge.style.background = p.bg; badge.style.color = p.col;
  st("phase-name", p.name); g("phase-name").style.color = p.col;
  st("phase-desc", p.desc);
}

function updateCycBar() {
  const fill = g("cyc-fill");
  if (S.mode === "grossesse") {
    const info = pregnancyInfo(S.pregStartDate);
    if (!info) { show("cyc-wrap", false); return; }
    show("cyc-wrap", true, "");
    st("cyc-label", t.pregProg(info.days));
    fill.style.background = "#2196F3";
    fill.style.width = Math.min(100, Math.round((info.days / 280) * 100)) + "%";
    return;
  }
  const cd = cycleDay(S.periods, S.settings);
  if (!cd) { show("cyc-wrap", false); return; }
  show("cyc-wrap", true, "");
  st("cyc-label", t.dayOf(cd.day + 1, cd.cycle) + (cd.late > 0 ? " · " + t.lateBy(cd.late) : ""));
  fill.style.background = S.mode === "conception" ? "#9C27B0" : "#E91E8C";
  fill.style.width = Math.min(100, Math.round((cd.day / cd.cycle) * 100)) + "%";
}

function renderHist() {
  const asc = sortPeriods(S.periods);
  const list = g("hist-list");
  if (!asc.length) { list.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-text">${t.emptyHist}</div></div>`; return; }
  list.innerHTML = asc.map((p, i) => {
    const start = parseD(p.start);
    const dur = p.end ? diffDays(parseD(p.end), start) + 1 : null;
    const cycleDur = i + 1 < asc.length ? diffDays(parseD(asc[i + 1].start), start) : null;
    return `<div class="hist-item"><div style="flex:1"><div class="hist-date">${fmtDate(start, { day: "numeric", month: "long", year: "numeric" })}</div><div class="hist-sub">${dur ? t.histDays(dur) : t.histNoEnd} · ${cycleDur ? t.histCycle(cycleDur) : t.histLast}</div></div><div class="hist-right"><span class="hist-badge">${cycleDur ? t.histBadge(cycleDur) : dur ? dur + "j" : "?"}</span><button class="del-btn" data-action="delPeriod" data-arg="${p.start}" aria-label="${t.aDelete}">✕</button></div></div>`;
  }).reverse().join("");
}

// ---------- Evenements ----------
// Pas d'attributs onclick dans le HTML (compatible avec une CSP stricte) :
// chaque element cliquable porte data-action / data-arg.

const ACTIONS = {
  setLang, authSubmit, showReset, toggleAuthMode, sendReset, showAuth, doLogout,
  prevMonth, nextMonth, logStart, logEnd, setMode, savePregDate, adj, selectDay, delPeriod,
  exportData, clearAll, deleteAccount, goTab,
  retryLoad: () => initSession(),
  showPrivacy: () => g("privacy-screen").classList.add("active"),
  hidePrivacy: () => g("privacy-screen").classList.remove("active"),
  showAbout: () => g("about-screen").classList.add("active"),
  hideAbout: () => g("about-screen").classList.remove("active"),
  aboutToPrivacy: () => { ACTIONS.hideAbout(); ACTIONS.showPrivacy(); },
};

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-action]");
  if (!el || !ACTIONS[el.dataset.action]) return;
  // Lien dans le libelle de la case de consentement : ne pas cocher la case.
  if (el.closest("label")) e.preventDefault();
  ACTIONS[el.dataset.action](el.dataset.arg);
});
// Clavier : Entree / Espace activent les elements role="button" qui ne sont pas des <button>.
document.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" && e.key !== " ") return;
  const el = e.target.closest('[role="button"]');
  if (!el || el.tagName === "BUTTON") return;
  e.preventDefault();
  el.click();
});
g("auth-password").addEventListener("keydown", (e) => { if (e.key === "Enter") authSubmit(); });

// ---------- Demarrage ----------

setLang(lang);
if (resetToken) { showLoading(false); showApp(false); showReset(); }
else initSession();
