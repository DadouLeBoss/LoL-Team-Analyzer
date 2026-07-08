import { readFile } from "node:fs/promises";
import path from "node:path";
import { KEY_NS } from "./riot.js";
import { readCache, readCacheMany, cachePaths } from "./cache.js";
import { analyzeTeam } from "./analysis.js";

// Charge la meta (tiers, winrates, counters OP.GG). Absente -> analyse sans meta.
export async function loadMeta() {
  try {
    return JSON.parse(await readFile(path.join(process.cwd(), "data", "meta.json"), "utf8"));
  } catch {
    return null;
  }
}

// Reconstruit l'analyse d'UNE equipe a partir du cache (prep + parties), sans
// aucun appel Riot. Partage entre /api/finalize (1 equipe) et /api/match (2
// equipes). ddragon et meta sont passes par l'appelant pour n'etre charges qu'une
// fois. Renvoie l'analyse avec errors / matchesDownloaded / matchesFailed attaches.
export async function buildTeam(riotIds, errors, ddragon, meta, settings) {
  const ids = Array.isArray(riotIds) ? riotIds : [];

  const preps = await Promise.all(ids.map((id) => readCache(cachePaths.prep(KEY_NS, id))));

  const collectedErrors = Array.isArray(errors) ? [...errors] : [];
  const enriched = [];
  const uniqueMatchIds = new Set();

  for (let i = 0; i < ids.length; i++) {
    const prep = preps[i];
    if (!prep) {
      collectedErrors.push({ riotId: ids[i], error: "preparation expiree, relance l'analyse" });
      continue;
    }
    prep.matchIds.forEach((m) => uniqueMatchIds.add(m));
    const matches = (
      await readCacheMany(prep.matchIds.map((m) => cachePaths.match(KEY_NS, m)))
    ).filter(Boolean);
    enriched.push({
      riotId: prep.riotId,
      name: prep.name,
      puuid: prep.puuid,
      masteries: prep.masteries,
      rank: prep.rank,
      matches,
    });
  }

  const uniquePresent = (
    await readCacheMany([...uniqueMatchIds].map((m) => cachePaths.match(KEY_NS, m)))
  ).filter(Boolean).length;

  const analysis = analyzeTeam(enriched, ddragon, meta, settings);
  analysis.errors = collectedErrors;
  analysis.matchesDownloaded = uniquePresent;
  analysis.matchesFailed = uniqueMatchIds.size - uniquePresent;
  return analysis;
}
