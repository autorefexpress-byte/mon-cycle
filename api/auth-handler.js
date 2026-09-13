import { toNodeHandler } from "better-auth/node";
import { auth } from "../lib/auth.js";

// Better Auth a besoin du flux brut de la requete : on desactive le
// parsing automatique du corps fait par Vercel pour les fonctions Node.
// Toutes les URLs /api/auth/* sont redirigees ici en interne via vercel.json
// (Vercel ne supporte pas la route dynamique catch-all api/auth/[...all].js
// en dehors d'un projet Next.js).
export const config = {
  api: { bodyParser: false },
};

export default toNodeHandler(auth);
