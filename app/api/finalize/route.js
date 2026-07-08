import { NextResponse } from "next/server";
import { getDDragon } from "../../../lib/riot.js";
import { buildTeam, loadMeta } from "../../../lib/teamFromCache.js";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Derniere etape (mode 1 equipe) : tout est deja en cache (prep + parties). On
// relit, on assemble et on calcule l'analyse via le helper partage buildTeam.
// Aucun appel Riot ici, donc rapide et sans risque de depasser la limite de temps.
export async function POST(request) {
  try {
    const { riotIds, errors, settings } = await request.json();
    const [ddragon, meta] = await Promise.all([getDDragon(), loadMeta()]);
    const analysis = await buildTeam(riotIds, errors, ddragon, meta, settings);
    return NextResponse.json(analysis);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
