import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../lib/auth.js";
import { getPool } from "../lib/db.js";
import { validate } from "../lib/validate.js";

export const config = {
  api: { bodyParser: true },
};

const SELECT = `select periods, settings, mode, preg_start_date::text as preg_start_date, version
                from cycle_data where user_id = $1`;

// ::text pour preg_start_date : renvoie "YYYY-MM-DD" (sinon pg renvoie un
// objet Date serialise en ISO avec heure, que le client ne sait pas comparer).
function toJson(row) {
  return row
    ? { periods: row.periods, settings: row.settings, mode: row.mode, pregStartDate: row.preg_start_date, version: row.version }
    : { periods: [], settings: null, mode: "normal", pregStartDate: null, version: 0 };
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
      const { rows } = await pool.query(SELECT, [userId]);
      res.status(200).json(toJson(rows[0]));
      return;
    }

    if (req.method === "PUT") {
      const data = validate(req.body);
      if (typeof data === "string") {
        res.status(400).json({ error: data });
        return;
      }
      const values = [userId, JSON.stringify(data.periods), JSON.stringify(data.settings), data.mode, data.pregStartDate];

      let rows;
      if (data.version === null) {
        // Ancien client (sans version) : ecriture sans controle de concurrence.
        ({ rows } = await pool.query(
          `insert into cycle_data (user_id, periods, settings, mode, preg_start_date, version, updated_at)
           values ($1, $2, $3, $4, $5, 1, now())
           on conflict (user_id) do update set
             periods = excluded.periods, settings = excluded.settings, mode = excluded.mode,
             preg_start_date = excluded.preg_start_date, version = cycle_data.version + 1, updated_at = now()
           returning version`,
          values
        ));
      } else {
        // On n'ecrit que si la version en base est celle que le client a lue :
        // sinon un autre appareil a enregistre entre-temps (409).
        ({ rows } = await pool.query(
          `update cycle_data set
             periods = $2, settings = $3, mode = $4, preg_start_date = $5,
             version = version + 1, updated_at = now()
           where user_id = $1 and version = $6
           returning version`,
          [...values, data.version]
        ));
        if (!rows.length && data.version === 0) {
          ({ rows } = await pool.query(
            `insert into cycle_data (user_id, periods, settings, mode, preg_start_date, version, updated_at)
             values ($1, $2, $3, $4, $5, 1, now())
             on conflict (user_id) do nothing
             returning version`,
            values
          ));
        }
      }

      if (!rows.length) {
        const current = await pool.query(SELECT, [userId]);
        res.status(409).json(toJson(current.rows[0]));
        return;
      }
      res.status(200).json({ ok: true, version: rows[0].version });
      return;
    }

    res.status(405).json({ error: "method not allowed" });
  } catch (e) {
    console.error("[mon-cycle] /api/data", e);
    res.status(500).json({ error: "server error" });
  }
}
