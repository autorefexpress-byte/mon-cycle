import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../lib/auth.js";
import { getPool } from "../lib/db.js";

export const config = {
  api: { bodyParser: true },
};

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

  if (req.method === "GET") {
    const { rows } = await pool.query(
      `select periods, settings, mode, preg_start_date from cycle_data where user_id = $1`,
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
    const { periods, settings, mode, pregStartDate } = req.body || {};
    await pool.query(
      `insert into cycle_data (user_id, periods, settings, mode, preg_start_date, updated_at)
       values ($1, $2, $3, $4, $5, now())
       on conflict (user_id) do update set
         periods = excluded.periods,
         settings = excluded.settings,
         mode = excluded.mode,
         preg_start_date = excluded.preg_start_date,
         updated_at = now()`,
      [userId, JSON.stringify(periods || []), JSON.stringify(settings || {}), mode || "normal", pregStartDate || null]
    );
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: "method not allowed" });
}
