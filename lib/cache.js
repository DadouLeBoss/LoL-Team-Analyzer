import { promises as fs } from "node:fs";
import path from "node:path";

const CACHE_DIR = path.join(process.cwd(), "cache");

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

// Chemins de cache normalisés.
export const cachePaths = {
  account: (riotId) => path.join("accounts", `${safe(riotId)}.json`),
  match: (matchId) => path.join("matches", `${safe(matchId)}.json`),
  ddragon: () => "ddragon.json",
};
