import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

// En local : cache persistant dans ./cache. Sur un hote serverless (Vercel), le
// systeme de fichiers du deploiement est en lecture seule ; seul le repertoire
// temporaire est accessible en ecriture (et volatile, efface entre les appels).
// On y bascule pour ne pas planter, meme si le cache n'y survit pas d'un appel
// a l'autre.
const CACHE_DIR = process.env.VERCEL
  ? path.join(os.tmpdir(), "lol-cache")
  : path.join(process.cwd(), "cache");

// Rend un nom de fichier sûr à partir d'un identifiant arbitraire.
function safe(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

// Lit un JSON du cache, ou null s'il n'existe pas.
export async function readCache(relPath) {
  try {
    const full = path.join(CACHE_DIR, relPath);
    const raw = await fs.readFile(full, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Écrit un JSON dans le cache.
export async function writeCache(relPath, data) {
  const full = path.join(CACHE_DIR, relPath);
  await ensureDir(path.dirname(full));
  await fs.writeFile(full, JSON.stringify(data), "utf8");
}

// Chemins de cache normalises. Comptes et parties sont cloisonnes par
// empreinte de cle (ns) : les PUUID sont chiffres par cle API, donc un
// changement de cle doit repartir d'un cache vierge. Data Dragon est global.
export const cachePaths = {
  account: (ns, riotId) => path.join(ns, "accounts", `${safe(riotId)}.json`),
  match: (ns, matchId) => path.join(ns, "matches", `${safe(matchId)}.json`),
  ddragon: () => "ddragon.json",
};
