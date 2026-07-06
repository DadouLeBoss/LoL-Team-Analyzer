import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { KEY_NS, getDDragon } from "../../../lib/riot.js";
import { readCache, readCacheMany, cachePaths } from "../../../lib/cache.js";
import { analyzeTeam } from "../../../lib/analysis.js";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Derniere etape : tout est deja en cache (prep + parties). On relit, on
// assemble et on calcule l'analyse. Aucun appel Riot ici, donc rapide et sans
// risque de depasser la limite de temps.
export async function POST(request) {
  try {
    const { riotIds, errors, region } = await request.json();
    const ids = Array.isArray(riotIds) ? riotIds : [];

    const ddragon = await getDDragon();

    // Prep de chaque joueur (puuid, maitrises, rang, liste de parties).
    const preps = await Promise.all(
      ids.map((id) => readCache(cachePaths.prep(KEY_NS, id)))
    );

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
      // Lecture groupee des parties de ce joueur depuis le cache.
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

    // Combien de parties uniques sont effectivement en cache.
    const uniquePresent = (
      await readCacheMany([...uniqueMatchIds].map((m) => cachePaths.match(KEY_NS, m)))
    ).filter(Boolean).length;

    let meta = null;
    try {
      meta = JSON.parse(await readFile(path.join(process.cwd(), "data", "meta.json"), "utf8"));
    } catch {
      // pas de meta -> analyse sans bonus meta
    }

    const analysis = analyzeTeam(enriched, ddragon, meta);
    analysis.errors = collectedErrors;
    analysis.matchesDownloaded = uniquePresent;
    analysis.matchesFailed = uniqueMatchIds.size - uniquePresent;

    return NextResponse.json(analysis);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
