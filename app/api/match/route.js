import { NextResponse } from "next/server";
import { getDDragon } from "../../../lib/riot.js";
import { buildTeam, loadMeta } from "../../../lib/teamFromCache.js";
import { analyzeMatch } from "../../../lib/match.js";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Mode match : reconstruit les DEUX equipes depuis le cache (0 appel Riot),
// puis les croise (comparatif lane, prediction de draft, bans-counters,
// suggestions de picks). Renvoie { mine, enemy, match }.
export async function POST(request) {
  try {
    const { myRiotIds, enemyRiotIds, myErrors, enemyErrors, settings } = await request.json();
    const [ddragon, meta] = await Promise.all([getDDragon(), loadMeta()]);

    const [mine, enemy] = await Promise.all([
      buildTeam(myRiotIds, myErrors, ddragon, meta, settings),
      buildTeam(enemyRiotIds, enemyErrors, ddragon, meta, settings),
    ]);

    const match = analyzeMatch(mine, enemy, meta, settings);
    return NextResponse.json({ mine, enemy, match });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
