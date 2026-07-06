import { NextResponse } from "next/server";
import {
  KEY_NS,
  getAccount,
  getMasteries,
  getRank,
  getSeasonMatchIds,
} from "../../../lib/riot.js";
import { writeCache, cachePaths } from "../../../lib/cache.js";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Debut de la saison courante (epoch en secondes). A ajuster si le decoupage
// de saison/split change : seules les parties classees posterieures sont lues.
const SEASON_START = Math.floor(new Date("2026-01-10T00:00:00Z").getTime() / 1000);
const MATCH_CAP = 1000;

function pickRank(entries) {
  const out = { solo: null, flex: null };
  for (const e of entries) {
    const r = { tier: e.tier, rank: e.rank, lp: e.leaguePoints, wins: e.wins, losses: e.losses };
    if (e.queueType === "RANKED_SOLO_5x5") out.solo = r;
    else if (e.queueType === "RANKED_FLEX_SR") out.flex = r;
  }
  return out;
}

// Prepare UN joueur : compte -> maitrise + rang + liste des parties de la
// saison. Le resultat lourd (maitrises, rang, ids) est mis en cache pour que
// /api/finalize le relise sans repayer d'appels Riot. On renvoie au client la
// liste des match IDs (pour piloter le telechargement par lots) et le total.
export async function POST(request) {
  if (!process.env.RIOT_API_KEY || process.env.RIOT_API_KEY.includes("PASTE")) {
    return NextResponse.json({ error: "Cle API Riot manquante." }, { status: 400 });
  }

  try {
    const { riotId, region } = await request.json();
    const { platform, regional } = region || {};
    const id = (riotId || "").trim();
    const shortName = id.includes("#") ? id.slice(0, id.lastIndexOf("#")) : id;

    if (!id.includes("#")) {
      return NextResponse.json({ riotId: id, name: shortName, error: "format invalide (attendu Pseudo#TAG)" });
    }

    const account = await getAccount(id, regional);
    if (!account) {
      return NextResponse.json({ riotId: id, name: shortName, error: "introuvable" });
    }

    const [masteries, matchIds, rankEntries] = await Promise.all([
      getMasteries(account.puuid, platform),
      getSeasonMatchIds(account.puuid, regional, { startTime: SEASON_START, cap: MATCH_CAP }),
      getRank(account.puuid, platform),
    ]);

    const prep = {
      riotId: id,
      name: account.gameName || shortName,
      puuid: account.puuid,
      masteries,
      matchIds,
      rank: pickRank(rankEntries),
    };
    await writeCache(cachePaths.prep(KEY_NS, id), prep);

    return NextResponse.json({ riotId: id, name: prep.name, matchIds, total: matchIds.length });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
