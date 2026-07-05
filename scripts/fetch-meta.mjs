// Genere data/meta.json : la force en meta de chaque champion (tier, winrate,
// pickrate, banrate) pour le patch courant, via l'endpoint MCP public d'OP.GG.
//
// A relancer a chaque patch :  node scripts/fetch-meta.mjs
//
// Aucune cle requise. La donnee est figee dans un JSON versionne pour que
// l'app ne depende d'aucune source tierce en direct.

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const MCP_URL = "https://mcp-api.op.gg/mcp";
const POSITIONS = ["top", "jungle", "mid", "adc", "support"];
// tier OP.GG : 1=OP, 2=Fort, 3=Bon, 4=Moyen, 5=Faible
const TIER_LABEL = { 1: "OP", 2: "Fort", 3: "Bon", 4: "Moyen", 5: "Faible" };

async function callMcp(name, args) {
  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
  if (!res.ok) throw new Error(`MCP ${name} HTTP ${res.status}`);
  const body = await res.text();
  // Reponse en JSON simple ou en flux SSE ("data: {...}")
  const line = body
    .split("\n")
    .map((l) => l.replace(/^data:\s*/, "").trim())
    .filter((l) => l.startsWith("{"))
    .pop();
  const json = JSON.parse(line);
  return json.result.content[0].text;
}

async function getPatch() {
  try {
    const versions = await (
      await fetch("https://ddragon.leagueoflegends.com/api/versions.json")
    ).json();
    const v = versions[0].split(".");
    return `${v[0]}.${v[1]}`;
  } catch {
    return "inconnu";
  }
}

async function main() {
  console.log("Recuperation de la meta OP.GG...");
  const text = await callMcp("lol_list_lane_meta_champions", {
    position: "all",
    desired_output_fields: POSITIONS.flatMap((p) =>
      ["champion", "tier", "win_rate", "pick_rate", "ban_rate"].map(
        (k) => `data.positions.${p}[].${k}`
      )
    ),
  });

  // Format compact OP.GG :  Top("Garen",1,0.52,0.08,0.07)
  const re =
    /(Top|Jungle|Mid|Adc|Support)\("([^"]+)",(\d+),([\d.]+),([\d.]+),([\d.]+)\)/g;

  const champions = {};
  let m;
  let entries = 0;
  while ((m = re.exec(text))) {
    entries++;
    // NB : OP.GG serialise toutes les lignes avec le prefixe "Top", quelle que
    // soit la lane -> le role n'est pas fiable, on ne le conserve pas. Les
    // valeurs tier/winrate/pick/ban sont, elles, correctes (une ligne par lane).
    const name = m[2];
    const tier = Number(m[3]);
    const winRate = Number(m[4]);
    const pickRate = Number(m[5]);
    const banRate = Number(m[6]);

    const prev = champions[name];
    // On garde la lane ou le champion est le plus fort (tier le plus bas).
    if (!prev || tier < prev.tier || (tier === prev.tier && winRate > prev.winRate)) {
      champions[name] = { tier, tierLabel: TIER_LABEL[tier] || String(tier), winRate, pickRate, banRate };
    }
  }

  const patch = await getPatch();
  const out = {
    patch,
    source: "OP.GG (lol_list_lane_meta_champions)",
    champions,
  };

  const dir = path.join(process.cwd(), "data");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "meta.json"), JSON.stringify(out, null, 1));

  console.log(
    `OK : ${Object.keys(champions).length} champions (patch ${patch}), ${entries} entrees lues -> data/meta.json`
  );
}

main().catch((e) => {
  console.error("Echec:", e.message);
  process.exit(1);
});
