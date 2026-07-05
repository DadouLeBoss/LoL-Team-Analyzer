// Genere data/meta.json : la force en meta de chaque champion (tier, winrate,
// pickrate, banrate) ET les roles ou il est reellement joue, pour le patch
// courant, via l'endpoint MCP public d'OP.GG.
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
// Un role ne "compte" pour un champion que s'il y joue au moins ce taux.
const ROLE_MIN_RATE = 0.1;

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
  return JSON.parse(line).result.content[0].text;
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
  console.log("Recuperation de la meta OP.GG (lane par lane)...");
  const champions = {};
  let entries = 0;

  // On appelle chaque lane separement : OP.GG serialise toutes les lignes avec
  // le meme prefixe, mais en filtrant par position on connait le role a coup sur.
  for (const pos of POSITIONS) {
    const text = await callMcp("lol_list_lane_meta_champions", {
      position: pos,
      desired_output_fields: ["champion", "tier", "win_rate", "pick_rate", "ban_rate", "role_rate"].map(
        (k) => `data.positions.${pos}[].${k}`
      ),
    });
    // Format compact :  X("Garen",1,0.52,0.08,0.07,0.95)
    const re = /\w+\("([^"]+)",(\d+),([\d.]+),([\d.]+),([\d.]+),([\d.]+)\)/g;
    let m;
    while ((m = re.exec(text))) {
      entries++;
      const name = m[1];
      const tier = Number(m[2]);
      const winRate = Number(m[3]);
      const pickRate = Number(m[4]);
      const banRate = Number(m[5]);
      const roleRate = Number(m[6]);

      const c =
        champions[name] ||
        (champions[name] = { tier: 99, tierLabel: "", winRate: 0, pickRate: 0, banRate: 0, roles: {} });
      c.roles[pos] = roleRate;
      // On garde la lane ou le champion est le plus fort (tier le plus bas).
      if (tier < c.tier || (tier === c.tier && winRate > c.winRate)) {
        c.tier = tier;
        c.tierLabel = TIER_LABEL[tier] || String(tier);
        c.winRate = winRate;
        c.pickRate = pickRate;
        c.banRate = banRate;
      }
    }
  }

  // Roles reellement jouables (>= ROLE_MIN_RATE), tries du plus au moins joue.
  for (const c of Object.values(champions)) {
    c.flexRoles = Object.entries(c.roles)
      .filter(([, rate]) => rate >= ROLE_MIN_RATE)
      .sort((a, b) => b[1] - a[1])
      .map(([r]) => r);
  }

  const patch = await getPatch();
  const out = { patch, source: "OP.GG (lol_list_lane_meta_champions)", champions };

  const dir = path.join(process.cwd(), "data");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "meta.json"), JSON.stringify(out, null, 1));

  const multi = Object.values(champions).filter((c) => c.flexRoles.length >= 2).length;
  console.log(
    `OK : ${Object.keys(champions).length} champions (patch ${patch}), ${entries} lignes, ${multi} multi-roles -> data/meta.json`
  );
}

main().catch((e) => {
  console.error("Echec:", e.message);
  process.exit(1);
});
