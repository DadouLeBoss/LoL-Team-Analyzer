import { NextResponse } from "next/server";
import {
  getAccount,
  getMasteries,
  getMatchIds,
  getMatch,
  getDDragon,
} from "../../../lib/riot.js";
import { analyzeTeam } from "../../../lib/analysis.js";

export const dynamic = "force-dynamic";

const MATCH_COUNT = 20;

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

      const [masteries, matchIds] = await Promise.all([
        getMasteries(account.puuid, platform),
        getMatchIds(account.puuid, regional, MATCH_COUNT),
      ]);
      matchIds.forEach((id) => wantedMatchIds.add(id));
      playerRaws.push({
        riotId,
        name: account.gameName || shortName,
        puuid: account.puuid,
        masteries,
        matchIds,
      });
    }

    // 2) Telecharger chaque partie UNE seule fois (dedoublonnage d'equipe).
    const matchMap = new Map();
    await Promise.all(
      [...wantedMatchIds].map(async (id) => {
        const match = await getMatch(id, regional);
        if (match) matchMap.set(id, match);
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
        matches: p.matchIds.map((id) => matchMap.get(id)).filter(Boolean),
      }));

    const analysis = analyzeTeam(enriched, ddragon);
    analysis.errors = playerRaws
      .filter((p) => p.error)
      .map((p) => ({ riotId: p.riotId, error: p.error }));
    analysis.matchesDownloaded = matchMap.size;

    return NextResponse.json(analysis);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
