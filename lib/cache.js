import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

// Deux backends de cache selon l'environnement :
//  - Si UPSTASH_REDIS_REST_URL/TOKEN sont definis (Vercel) -> Redis Upstash,
//    persistant et partage entre toutes les invocations serverless.
//  - Sinon (local) -> fichiers JSON dans ./cache, persistants sur le disque.
// L'interface (readCache/writeCache/readCacheMany/cachePaths) est identique,
// donc le reste du code ignore quel backend est actif.
// L'integration Vercel/Upstash injecte les variables sous le prefixe KV_ ;
// une base Upstash creee a la main utilise plutot UPSTASH_REDIS_REST_*. On
// accepte les deux conventions.
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const useRedis = Boolean(REDIS_URL && REDIS_TOKEN);

let _redis;
async function getRedis() {
  if (_redis === undefined) {
    if (useRedis) {
      const { Redis } = await import("@upstash/redis");
      _redis = new Redis({ url: REDIS_URL, token: REDIS_TOKEN });
    } else {
      _redis = null;
    }
  }
  return _redis;
}

// ----- Backend fichier (local) ---------------------------------------------
const CACHE_DIR = process.env.VERCEL
  ? path.join(os.tmpdir(), "lol-cache")
  : path.join(process.cwd(), "cache");

function safe(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

// Cle Redis a partir d'un chemin relatif ("ns/matches/EUW1_1.json").
function redisKey(relPath) {
  return "lol:" + relPath.split(/[\\/]/).join(":");
}

// ----- API de cache ---------------------------------------------------------
export async function readCache(relPath) {
  const r = await getRedis();
  if (r) {
    const v = await r.get(redisKey(relPath));
    return v ?? null; // le SDK parse deja le JSON
  }
  try {
    const raw = await fs.readFile(path.join(CACHE_DIR, relPath), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function writeCache(relPath, data) {
  const r = await getRedis();
  if (r) {
    await r.set(redisKey(relPath), data);
    return;
  }
  const full = path.join(CACHE_DIR, relPath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, JSON.stringify(data), "utf8");
}

// Lecture groupee : renvoie un tableau aligne sur relPaths (null si absent).
// Cote Redis on utilise MGET par paquets pour eviter les requetes trop grosses ;
// cote fichier on lit en parallele.
export async function readCacheMany(relPaths) {
  if (relPaths.length === 0) return [];
  const r = await getRedis();
  if (r) {
    const out = [];
    const CHUNK = 128;
    for (let i = 0; i < relPaths.length; i += CHUNK) {
      const slice = relPaths.slice(i, i + CHUNK);
      const vals = await r.mget(...slice.map(redisKey));
      for (const v of vals) out.push(v ?? null);
    }
    return out;
  }
  return Promise.all(relPaths.map(readCache));
}

// Chemins de cache normalises. Comptes et parties sont cloisonnes par
// empreinte de cle (ns) : les PUUID sont chiffres par cle API, donc un
// changement de cle doit repartir d'un cache vierge. Data Dragon est global.
export const cachePaths = {
  account: (ns, riotId) => path.join(ns, "accounts", `${safe(riotId)}.json`),
  match: (ns, matchId) => path.join(ns, "matches", `${safe(matchId)}.json`),
  prep: (ns, riotId) => path.join(ns, "prep", `${safe(riotId)}.json`),
  ddragon: () => "ddragon.json",
};
