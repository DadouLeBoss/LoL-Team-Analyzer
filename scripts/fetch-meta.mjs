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

  // --- Counters par champion, sur son role principal en meta ---
  // strong = champions qui nous battent ; weak = champions qu'on bat.
  // Le win_rate affiche est celui du camp favori du matchup.
  console.log("Recuperation des counters (~2 min)...");
  const toKey = (n) => n.toUpperCase().replace(/[.']/g, "").replace(/\s+/g, "_");
  // On demande un champ de plus pour strong (play) afin que strong et weak
  // aient des formes differentes -> OP.GG leur donne des noms de classe
  // distincts (StrongCounter / WeakCounter), sinon ils sont confondus.
  const CFIELDS = [
    "data.strong_counters[].champion_name",
    "data.strong_counters[].win_rate",
    "data.strong_counters[].play",
    "data.weak_counters[].champion_name",
    "data.weak_counters[].win_rate",
  ];
  const names = Object.keys(champions);
  let idx = 0;
  async function counterWorker() {
    while (idx < names.length) {
      const name = names[idx++];
      const c = champions[name];
      const role = c.flexRoles[0] || Object.entries(c.roles).sort((a, b) => b[1] - a[1])[0]?.[0] || "mid";
      try {
        const text = await callMcp("lol_get_champion_analysis", {
          game_mode: "ranked",
          champion: toKey(name),
          position: role,
          desired_output_fields: CFIELDS,
        });
        // ATTENTION : la doc OP.GG est trompeuse. Verifie empiriquement (Teemo
        // weak_counters = Olaf/Yasuo, ses counters connus) :
        //   strong_counters = champions que CE champion bat  -> beats
        //   weak_counters   = champions qui battent ce champion -> beatenBy
        const beats = [...text.matchAll(/StrongCounter\("([^"]+)",([\d.]+),\d+/g)]
          .slice(0, 3)
          .map((m) => ({ name: m[1], winRate: Number(m[2]) }));
        const beatenBy = [...text.matchAll(/WeakCounter\("([^"]+)",([\d.]+)\)/g)]
          .slice(0, 3)
          .map((m) => ({ name: m[1], winRate: Number(m[2]) }));
        c.counters = { role, beats, beatenBy };
      } catch {
        c.counters = null;
      }
    }
  }
  await Promise.all(Array.from({ length: 6 }, () => counterWorker()));

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
