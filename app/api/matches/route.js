import { NextResponse } from "next/server";
import { KEY_NS, getMatch } from "../../../lib/riot.js";
import { readCache, cachePaths } from "../../../lib/cache.js";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Telecharge un lot de parties (par leurs IDs) et les met en cache. Distingue
// les parties reellement recuperees chez Riot (`fetched`, qui comptent pour la
// limite de debit) de celles deja en cache (`cached`, instantanees). Le client
// s'appuie sur `fetched` pour cadencer ses lots sous la limite 100 req / 2 min.
export async function POST(request) {
  if (!process.env.RIOT_API_KEY || process.env.RIOT_API_KEY.includes("PASTE")) {
    return NextResponse.json({ error: "Cle API Riot manquante." }, { status: 400 });
  }

  try {
    const { ids, region } = await request.json();
    const { regional } = region || {};
    const list = Array.isArray(ids) ? ids : [];

    let fetched = 0;
    let cached = 0;
    let failed = 0;

    await Promise.all(
      list.map(async (id) => {
        try {
          const hit = await readCache(cachePaths.match(KEY_NS, id));
          if (hit) {
            cached++;
            return;
          }
          const m = await getMatch(id, regional); // recupere + met en cache
          if (m) fetched++;
          else failed++;
        } catch {
          failed++;
        }
      })
    );

    return NextResponse.json({ fetched, cached, failed, done: fetched + cached });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
