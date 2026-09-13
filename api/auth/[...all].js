import { toNodeHandler } from "better-auth/node";
import { auth } from "../../lib/auth.js";

// Better Auth a besoin du flux brut de la requete : on desactive le
// parsing automatique du corps fait par Vercel pour les fonctions Node.
export const config = {
  api: { bodyParser: false },
};

export default toNodeHandler(auth);
