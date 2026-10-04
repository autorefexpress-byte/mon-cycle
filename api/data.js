import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../lib/auth.js";
import { getPool } from "../lib/db.js";

export const config = {
  api: { bodyParser: true },
};

const MODES = ["normal", "conception", "grossesse"];
const MAX_PERIODS = 1000;
const LIMITS = { cycle: [20, 45], period: [1, 10], proj: [1, 12] };
const DEFAULT_SETTINGS = { cycle: 28, period: 5, proj: 3 };

// Verifie qu'une chaine est une vraie date calendaire "YYYY-MM-DD".
function isDate(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// Renvoie les donnees nettoyees, ou une chaine decrivant l'erreur.
function validate(body) {
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

  return { periods: cleanPeriods, settings: cleanSettings, mode, pregStartDate: pregStartDate ?? null };
}

export default async function handler(req, res) {
  let session;
  try {
    session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  } catch (e) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  if (!session || !session.user) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const userId = session.user.id;
  const pool = getPool();

  try {
    if (req.method === "GET") {
      // ::text pour renvoyer "YYYY-MM-DD" (sinon pg renvoie un objet Date
      // serialise en ISO avec heure, que le client ne sait pas comparer).
      const { rows } = await pool.query(
        `select periods, settings, mode, preg_start_date::text as preg_start_date
         from cycle_data where user_id = $1`,
        [userId]
      );
      const row = rows[0];
      res.status(200).json(
        row
          ? {
              periods: row.periods,
              settings: row.settings,
              mode: row.mode,
              pregStartDate: row.preg_start_date,
            }
          : { periods: [], settings: null, mode: "normal", pregStartDate: null }
      );
      return;
    }

    if (req.method === "PUT") {
      const data = validate(req.body);
      if (typeof data === "string") {
        res.status(400).json({ error: data });
        return;
      }
      await pool.query(
        `insert into cycle_data (user_id, periods, settings, mode, preg_start_date, updated_at)
         values ($1, $2, $3, $4, $5, now())
         on conflict (user_id) do update set
           periods = excluded.periods,
           settings = excluded.settings,
           mode = excluded.mode,
           preg_start_date = excluded.preg_start_date,
           updated_at = now()`,
        [userId, JSON.stringify(data.periods), JSON.stringify(data.settings), data.mode, data.pregStartDate]
      );
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ error: "method not allowed" });
  } catch (e) {
    console.error("[mon-cycle] /api/data", e);
    res.status(500).json({ error: "server error" });
  }
}
