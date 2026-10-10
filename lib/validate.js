// Validation du corps envoye par le client a PUT /api/data.

const MODES = ["normal", "conception", "grossesse"];
const MAX_PERIODS = 1000;
const LIMITS = { cycle: [20, 45], period: [1, 10], proj: [1, 12] };
const DEFAULT_SETTINGS = { cycle: 28, period: 5, proj: 3 };

// Verifie qu'une chaine est une vraie date calendaire "YYYY-MM-DD".
export function isDate(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// Renvoie les donnees nettoyees, ou une chaine decrivant l'erreur.
export function validate(body) {
  if (!body || typeof body !== "object") return "invalid body";
  const { periods, settings, mode, pregStartDate } = body;

  if (!Array.isArray(periods) || periods.length > MAX_PERIODS) return "invalid periods";
  const cleanPeriods = [];
  for (const p of periods) {
    if (!p || typeof p !== "object" || !isDate(p.start)) return "invalid period start";
    const end = p.end ?? null;
    if (end !== null && (!isDate(end) || end < p.start)) return "invalid period end";
    cleanPeriods.push({ start: p.start, end });
  }

  if (!settings || typeof settings !== "object") return "invalid settings";
  const cleanSettings = {};
  for (const [k, [min, max]] of Object.entries(LIMITS)) {
    const v = settings[k] ?? DEFAULT_SETTINGS[k];
    if (!Number.isInteger(v) || v < min || v > max) return `invalid settings.${k}`;
    cleanSettings[k] = v;
  }

  if (!MODES.includes(mode)) return "invalid mode";
  if (pregStartDate != null && !isDate(pregStartDate)) return "invalid pregStartDate";

  const version = body.version ?? null;
  if (version !== null && (!Number.isInteger(version) || version < 0)) return "invalid version";

  return { periods: cleanPeriods, settings: cleanSettings, mode, pregStartDate: pregStartDate ?? null, version };
}
