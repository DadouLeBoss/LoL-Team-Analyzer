// Croisement de deux analyses d'equipe (la sienne + l'adverse) pour un
// assistant de draft : comparatif lane par lane, prediction de la draft
// adverse, bans a poser contre eux (en tenant compte de ce qu'on sait counter)
// et suggestions de picks. Aucun appel Riot : tout part des analyses deja
// calculees (analyzeTeam) et de la meta OP.GG (counters).

import { normName } from "./analysis.js";

const ROLES = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];

// Index meta par nom normalise (les counters stockent des noms d'affichage).
function metaIndex(meta) {
  const idx = {};
  if (meta?.champions)
    for (const [name, info] of Object.entries(meta.champions)) idx[normName(name)] = info;
  return idx;
}

// Joueur d'une equipe dont le role principal est `role` (le 1er si plusieurs).
function playerAtRole(team, role) {
  return team.players.find((p) => p.mainRole === role) || null;
}

// Ecart de niveau -> qui est favori sur la lane.
function favorFrom(diff) {
  if (diff == null) return "unknown";
  if (Math.abs(diff) < 50) return "even";
  return diff > 0 ? "mine" : "enemy";
}

// Comparatif lane par lane : pour chaque role, le joueur de chaque equipe + qui
// est favori (base sur l'elo, mais on n'affiche que le rang cote UI).
function laneMatchups(mine, enemy) {
  return ROLES.map((role) => {
    const a = playerAtRole(mine, role);
    const b = playerAtRole(enemy, role);
    const diff = a?.elo != null && b?.elo != null ? a.elo - b.elo : null;
    return {
      role,
      mine: a ? { name: a.name, rank: a.rank, elo: a.elo } : null,
      enemy: b ? { name: b.name, rank: b.rank, elo: b.elo } : null,
      diff,
      favor: favorFrom(diff),
    };
  });
}

// Prediction de draft : par role, les champions les plus joues des joueurs de
// l'equipe a ce poste (heuristique sur l'historique, pas une certitude).
function draft(team) {
  return ROLES.map((role) => {
    const picks = [];
    for (const p of team.players) {
      if (p.mainRole !== role) continue;
      for (const c of (p.byRole?.[role]?.champions || []).slice(0, 3)) {
        picks.push({
          championId: c.championId,
          name: c.name,
          image: c.image,
          games: c.games,
          winrate: c.winrate,
          player: p.name,
        });
      }
    }
    picks.sort((x, y) => y.games - x.games);
    return { role, picks: picks.slice(0, 3) };
  });
}

// Pool de mon equipe par role : normName -> { player, name, games } (on garde
// l'occurrence la plus jouee). Sert a savoir ce qu'on peut amener a chaque poste.
function myPoolByRole(mine) {
  const byRole = new Map();
  for (const role of ROLES) byRole.set(role, new Map());
  for (const p of mine.players) {
    for (const c of p.champions) {
      const role = c.topRole;
      if (!role || !byRole.has(role)) continue;
      const m = byRole.get(role);
      const key = normName(c.name);
      const prev = m.get(key);
      if (!prev || c.games > prev.games) m.set(key, { player: p.name, name: c.name, games: c.games });
    }
  }
  return byRole;
}

export function analyzeMatch(mine, enemy, meta) {
  const idx = metaIndex(meta);
  const pool = myPoolByRole(mine);
  const enemyDraft = draft(enemy);

  // Bans contre eux : on repart de leurs champions dangereux (leur propre liste
  // de bans), et on marque ceux qu'un de nos joueurs sait punir a ce poste
  // (champion present dans les "beatenBy" de la meta). Les counterables passent
  // en fin de liste : inutile de gaspiller un ban sur ce qu'on punit deja.
  const bansAgainst = (enemy.bans || []).map((b) => {
    const info = idx[normName(b.name)];
    const beatenBy = info?.counters?.beatenBy || [];
    const rolePool = pool.get(b.role) || new Map();
    let counteredBy = null;
    for (const cb of beatenBy) {
      const hit = rolePool.get(normName(cb.name));
      if (hit) {
        counteredBy = { player: hit.player, champion: hit.name, winRate: cb.winRate };
        break;
      }
    }
    return { ...b, counterable: Boolean(counteredBy), counteredBy };
  });
  bansAgainst.sort(
    (a, b) => (a.counterable ? 1 : 0) - (b.counterable ? 1 : 0) || b.score - a.score
  );

  // Suggestions de picks : par role, nos champions dont la meta indique qu'ils
  // battent un pick probable adverse.
  const pickSuggestions = ROLES.map((role) => {
    const enemyPicks = enemyDraft.find((d) => d.role === role)?.picks || [];
    const suggestions = [];
    for (const c of pool.get(role)?.values() || []) {
      const beats = idx[normName(c.name)]?.counters?.beats || [];
      for (const e of enemyPicks) {
        const m = beats.find((x) => normName(x.name) === normName(e.name));
        if (m) suggestions.push({ pick: c.name, player: c.player, vs: e.name, winRate: m.winRate });
      }
    }
    suggestions.sort((a, b) => b.winRate - a.winRate);
    return { role, suggestions: suggestions.slice(0, 4) };
  }).filter((x) => x.suggestions.length > 0);

  return {
    laneMatchups: laneMatchups(mine, enemy),
    enemyDraft,
    myDraft: draft(mine),
    bansAgainst,
    pickSuggestions,
  };
}
