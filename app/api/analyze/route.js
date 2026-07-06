import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  getAccount,
  getMasteries,
  getRank,
  getSeasonMatchIds,
  getMatch,
  getDDragon,
} from "../../../lib/riot.js";
import { analyzeTeam } from "../../../lib/analysis.js";

export const dynamic = "force-dynamic";
// Duree max d'execution de la fonction (plafond du plan Vercel Hobby). Sans ca,
// une analyse un peu longue serait coupee a 10s. L'analyse d'une saison complete
// depasse malgre tout cette limite : le deploiement sert de vitrine, l'analyse
// lourde se fait en local ou via une cle a plus haut debit.
export const maxDuration = 60;

// Debut de la saison courante (epoch en secondes). A ajuster si le decoupage
// de saison/split change : seules les parties classees posterieures sont lues.
const SEASON_START = Math.floor(new Date("2026-01-10T00:00:00Z").getTime() / 1000);

// Filet de securite : nombre maximal de parties remontees par joueur. Eleve
// pour couvrir toute la saison (la pagination s'arrete de toute facon des que
// l'on remonte avant SEASON_START).
const MATCH_CAP = 1000;

// Transforme les entrees league-v4 en { solo, flex }.
function pickRank(entries) {
  const out = { solo: null, flex: null };
  for (const e of entries) {
    const r = {
      tier: e.tier,
      rank: e.rank,
      lp: e.leaguePoints,
      wins: e.wins,
      losses: e.losses,
    };
    if (e.queueType === "RANKED_SOLO_5x5") out.solo = r;
    else if (e.queueType === "RANKED_FLEX_SR") out.flex = r;
  }
  return out;
}

export async function POST(request) {
  if (!process.env.RIOT_API_KEY || process.env.RIOT_API_KEY.includes("PASTE")) {
    return NextResponse.json(
      { error: "Cle API Riot manquante. Ajoute RIOT_API_KEY dans .env.local puis relance." },
      { status: 400 }
    );
  }

  try {
    const body = await request.json();
    const region = body.region || { platform: "euw1", regional: "europe" };
    const { platform, regional } = region;

    const riotIds = (body.players || [])
      .map((s) => (s || "").trim())
      .filter(Boolean);

    if (riotIds.length === 0) {
      return NextResponse.json(
        { error: "Aucun joueur fourni." },
        { status: 400 }
      );
    }

    const ddragon = await getDDragon();

    // 1) Resoudre les comptes (puuid) et recuperer maitrise + IDs de parties.
    const playerRaws = [];
    const wantedMatchIds = new Set();

    for (const riotId of riotIds) {
      const shortName = riotId.includes("#") ? riotId.slice(0, riotId.lastIndexOf("#")) : riotId;

      if (!riotId.includes("#")) {
        playerRaws.push({ riotId, name: shortName, error: "format invalide (attendu Pseudo#TAG)" });
        continue;
      }

      const account = await getAccount(riotId, regional);
      if (!account) {
        playerRaws.push({ riotId, name: shortName, error: "introuvable" });
        continue;
      }

      try {
        const [masteries, matchIds, rankEntries] = await Promise.all([
          getMasteries(account.puuid, platform),
          getSeasonMatchIds(account.puuid, regional, { startTime: SEASON_START, cap: MATCH_CAP }),
          getRank(account.puuid, platform),
        ]);
        matchIds.forEach((id) => wantedMatchIds.add(id));
        playerRaws.push({
          riotId,
          name: account.gameName || shortName,
          puuid: account.puuid,
          masteries,
          matchIds,
          rank: pickRank(rankEntries),
        });
      } catch (e) {
        playerRaws.push({ riotId, name: shortName, error: "recuperation partielle echouee" });
      }
    }

    // 2) Telecharger chaque partie UNE seule fois (dedoublonnage d'equipe).
    // Une partie qui echoue est ignoree, l'analyse continue.
    const matchMap = new Map();
    let matchesFailed = 0;
    await Promise.all(
      [...wantedMatchIds].map(async (id) => {
        try {
          const match = await getMatch(id, regional);
          if (match) matchMap.set(id, match);
        } catch {
          matchesFailed++;
        }
      })
    );

    // 3) Rattacher a chaque joueur ses parties.
    const enriched = playerRaws
      .filter((p) => p.puuid)
      .map((p) => ({
        riotId: p.riotId,
        name: p.name,
        puuid: p.puuid,
        masteries: p.masteries,
        rank: p.rank,
        matches: p.matchIds.map((id) => matchMap.get(id)).filter(Boolean),
      }));

    // Meta des champions (force/tier par patch), optionnelle.
    let meta = null;
    try {
      meta = JSON.parse(await readFile(path.join(process.cwd(), "data", "meta.json"), "utf8"));
    } catch {
      // pas de fichier meta -> analyse sans bonus meta
    }

    const analysis = analyzeTeam(enriched, ddragon, meta);
    analysis.errors = playerRaws
      .filter((p) => p.error)
      .map((p) => ({ riotId: p.riotId, error: p.error }));
    analysis.matchesDownloaded = matchMap.size;
    analysis.matchesFailed = matchesFailed;

    return NextResponse.json(analysis);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
