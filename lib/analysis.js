// Transforme les données brutes Riot en analyse d'équipe :
//  - stats par joueur et par champion (parties, winrate, KDA)
//  - champions "flex" (jouables par plusieurs joueurs)
//  - liste de bans recommandés avec un score de danger

// Seuils pour qu'un champion soit retenu comme "flex" pour un joueur.
const FLEX_MIN_GAMES = 5;
const FLEX_MIN_MASTERY = 80000;

// Fenetre (en nombre de parties) pour le playrate "recent".
const RECENT_WINDOW = 40;

// Multiplicateur du score de ban selon la force en meta (tier OP.GG :
// 1=OP, 2=Fort, 3=Bon, 4=Moyen, 5=Faible). Un champion fort en meta ET joue
// par un joueur devient prioritaire a bannir.
// A notre niveau (amateur), la meta a peu d'impact : multiplicateurs doux.
const META_FACTOR = { 1: 1.15, 2: 1.1, 3: 1.05, 4: 1.0, 5: 0.9 };
const normName = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const VALID_ROLES = new Set(["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"]);

// Conversion rang -> valeur numerique (~"elo") pour comparer les joueurs entre
// eux. Un cran de division = 100, la LP s'ajoute. Sert au multiplicateur qui
// concentre les bans sur le meilleur joueur de l'equipe qui joue le champion.
const TIER_ELO = {
  IRON: 0, BRONZE: 400, SILVER: 800, GOLD: 1200, PLATINUM: 1600,
  EMERALD: 2000, DIAMOND: 2400, MASTER: 2800, GRANDMASTER: 3100, CHALLENGER: 3400,
};
const DIV_ELO = { I: 300, II: 200, III: 100, IV: 0 };
const APEX_TIERS = new Set(["MASTER", "GRANDMASTER", "CHALLENGER"]);

function rankElo(r) {
  if (!r || !r.tier) return null;
  const base = TIER_ELO[r.tier];
  if (base == null) return null;
  const div = APEX_TIERS.has(r.tier) ? 0 : DIV_ELO[r.rank] || 0;
  return base + div + (r.lp || 0);
}

// Niveau d'un joueur : on prend le Solo/Duo, sinon le Flex.
function playerElo(p) {
  return rankElo(p.rank?.solo) ?? rankElo(p.rank?.flex);
}

// Points de maitrise formates : "1.23M" au-dela du million, sinon "450k".
function fmtMasteryPts(pts) {
  return pts >= 1000000 ? (pts / 1000000).toFixed(2) + "M" : Math.round(pts / 1000) + "k";
}

// Extrait la ligne du joueur (puuid) dans le détail (allege) d'une partie.
function extractParticipant(match, puuid) {
  if (!match?.participants) return null;
  const p = match.participants.find((x) => x.puuid === puuid);
  if (!p) return null;
  return {
    matchId: match.matchId,
    championId: p.championId,
    championName: p.championName,
    win: p.win,
    kills: p.kills,
    deaths: p.deaths,
    assists: p.assists,
    role: p.teamPosition || p.individualPosition || "",
    queueId: match.queueId,
    gameCreation: match.gameCreation,
  };
}

function kdaRatio(k, d, a) {
  return d === 0 ? k + a : (k + a) / d;
}

// Agrège les parties d'un joueur par champion.
function aggregatePlayer(games, masteries, ddragon) {
  const masteryById = {};
  for (const m of masteries) masteryById[m.championId] = m;

  const byChamp = new Map();
  // Les parties sont ordonnees de la plus recente a la plus ancienne : les
  // RECENT_WINDOW premieres servent au playrate recent.
  games.forEach((g, idx) => {
    if (!byChamp.has(g.championId)) {
      byChamp.set(g.championId, {
        championId: g.championId,
        name: g.championName,
        games: 0,
        recentGames: 0,
        wins: 0,
        kills: 0,
        deaths: 0,
        assists: 0,
        roles: {},
      });
    }
    const c = byChamp.get(g.championId);
    c.games++;
    if (idx < RECENT_WINDOW) c.recentGames++;
    if (g.win) c.wins++;
    c.kills += g.kills;
    c.deaths += g.deaths;
    c.assists += g.assists;
    if (g.role) c.roles[g.role] = (c.roles[g.role] || 0) + 1;
  });

  const totalGames = games.length;
  const recentTotal = Math.min(totalGames, RECENT_WINDOW);
  const champions = [...byChamp.values()].map((c) => {
    const mastery = masteryById[c.championId];
    return {
      championId: c.championId,
      // On prefere le nom d'affichage Data Dragon (ex. "Wukong") au nom
      // interne renvoye par l'API de match (ex. "MonkeyKing").
      name: ddragon.byId[c.championId]?.name || c.name || `#${c.championId}`,
      image: ddragon.byId[c.championId]?.image || null,
      games: c.games,
      wins: c.wins,
      winrate: c.games ? c.wins / c.games : 0,
      kda: {
        kills: +(c.kills / c.games).toFixed(1),
        deaths: +(c.deaths / c.games).toFixed(1),
        assists: +(c.assists / c.games).toFixed(1),
        ratio: +kdaRatio(c.kills, c.deaths, c.assists).toFixed(2),
      },
      // part des parties sur ce champion, sur toute la saison (volume global)
      playRate: totalGames ? c.games / totalGames : 0,
      // part sur les 30 dernieres parties (forme / one-trick actuel)
      recentPlayRate: recentTotal ? c.recentGames / recentTotal : 0,
      masteryPoints: mastery?.championPoints || 0,
      masteryLevel: mastery?.championLevel || 0,
      topRole: Object.entries(c.roles).sort((a, b) => b[1] - a[1])[0]?.[0] || "",
    };
  });

  champions.sort((a, b) => b.games - a.games || b.masteryPoints - a.masteryPoints);
  return { totalGames, champions };
}

// Force d'un joueur sur un champion (0..1), pondérée par la taille
// d'échantillon. Le volume (global + recent) prime, puis le winrate, le KDA
// pesant peu.
function championStrength(champ) {
  const confidence = Math.min(champ.games / 5, 1); // besoin de ~5 parties
  const volume = champ.playRate; // volume global sur la saison
  const recent = champ.recentPlayRate; // volume sur les 30 dernieres
  const win = champ.winrate;
  const kda = Math.min(champ.kda.ratio / 5, 1); // KDA 5 = excellent
  const raw = 0.4 * volume + 0.2 * recent + 0.3 * win + 0.1 * kda;
  return { value: confidence * raw, confidence, volume, recent, win, kda };
}

// Transforme une partie brute en item d'affichage "partie recente".
function toRecentMatch(g, ddragon) {
  return {
    championId: g.championId,
    name: ddragon.byId[g.championId]?.name || g.championName || `#${g.championId}`,
    image: ddragon.byId[g.championId]?.image || null,
    win: g.win,
    kills: g.kills,
    deaths: g.deaths,
    assists: g.assists,
    kdaRatio: +kdaRatio(g.kills, g.deaths, g.assists).toFixed(2),
    role: g.role,
    gameCreation: g.gameCreation,
  };
}

// Agrege un sous-ensemble de parties en liste de champions pour l'affichage
// (parties, winrate, KDA moyen, counters), trie par nombre de parties.
function aggregateChampionsForDisplay(games, ddragon, metaByNorm) {
  const byChamp = new Map();
  for (const g of games) {
    let c = byChamp.get(g.championId);
    if (!c) {
      c = { championId: g.championId, games: 0, wins: 0, kills: 0, deaths: 0, assists: 0 };
      byChamp.set(g.championId, c);
    }
    c.games++;
    if (g.win) c.wins++;
    c.kills += g.kills;
    c.deaths += g.deaths;
    c.assists += g.assists;
  }
  return [...byChamp.values()]
    .map((c) => {
      const name = ddragon.byId[c.championId]?.name || `#${c.championId}`;
      return {
        championId: c.championId,
        name,
        image: ddragon.byId[c.championId]?.image || null,
        games: c.games,
        winrate: c.games ? c.wins / c.games : 0,
        kda: {
          kills: +(c.kills / c.games).toFixed(1),
          deaths: +(c.deaths / c.games).toFixed(1),
          assists: +(c.assists / c.games).toFixed(1),
          ratio: +kdaRatio(c.kills, c.deaths, c.assists).toFixed(2),
        },
        counters: metaByNorm[normName(name)]?.counters || null,
      };
    })
    .sort((a, b) => b.games - a.games);
}

// Construit l'analyse complète de l'équipe.
export function analyzeTeam(playerRaws, ddragon, meta) {
  // playerRaws: [{ riotId, name, puuid, masteries, matches:[matchDetail] }]
  // Index de la meta par nom normalise (pour un matching robuste).
  const metaByNorm = {};
  if (meta?.champions)
    for (const [name, info] of Object.entries(meta.champions))
      metaByNorm[normName(name)] = info;
  const players = playerRaws.map((pr) => {
    const games = pr.matches
      .map((m) => extractParticipant(m, pr.puuid))
      .filter(Boolean);
    const agg = aggregatePlayer(games, pr.masteries, ddragon);

    // Attache les counters (meta) a chaque champion joue.
    for (const c of agg.champions) {
      c.counters = metaByNorm[normName(c.name)]?.counters || null;
    }

    // Jusqu'a 12 parties les plus récentes (l'affichage en montre 6 ou 12).
    const recentMatches = games.slice(0, 12).map((g) => toRecentMatch(g, ddragon));

    // Jusqu'a 12 champions par maîtrise (l'affichage en montre 6 ou 12).
    const topMasteries = [...pr.masteries]
      .sort((a, b) => b.championPoints - a.championPoints)
      .slice(0, 12)
      .map((m) => ({
        championId: m.championId,
        name: ddragon.byId[m.championId]?.name || `#${m.championId}`,
        image: ddragon.byId[m.championId]?.image || null,
        points: m.championPoints,
        level: m.championLevel,
      }));

    // Repartition par role : part de chaque role sur l'ensemble des parties.
    const roleCounts = {};
    let roleTotal = 0;
    for (const g of games)
      if (VALID_ROLES.has(g.role)) {
        roleCounts[g.role] = (roleCounts[g.role] || 0) + 1;
        roleTotal++;
      }
    const roleDist = Object.entries(roleCounts)
      .map(([role, count]) => ({ role, pct: roleTotal ? count / roleTotal : 0 }))
      .sort((a, b) => b.pct - a.pct);
    const mainRole = roleDist[0]?.role || "";

    // Detail par role : champions et parties recentes limites aux parties
    // jouees dans ce role (d'apres l'historique). Sert au filtre au clic.
    const byRole = {};
    for (const { role } of roleDist) {
      const roleGames = games.filter((g) => g.role === role);
      byRole[role] = {
        champions: aggregateChampionsForDisplay(roleGames, ddragon, metaByNorm).slice(0, 12),
        recentMatches: roleGames.slice(0, 12).map((g) => toRecentMatch(g, ddragon)),
      };
    }

    return {
      riotId: pr.riotId,
      name: pr.name,
      puuid: pr.puuid,
      rank: pr.rank || { solo: null, flex: null },
      mainRole,
      roles: roleDist,
      byRole,
      totalGames: agg.totalGames,
      champions: agg.champions,
      recentMatches,
      topMasteries,
    };
  });

  // Ordre d'affichage de l'equipe : TOP, JUNGLE, MID, BOT, SUPPORT.
  const ROLE_ORDER = { TOP: 0, JUNGLE: 1, MIDDLE: 2, BOTTOM: 3, UTILITY: 4 };
  players.sort(
    (a, b) => (ROLE_ORDER[a.mainRole] ?? 5) - (ROLE_ORDER[b.mainRole] ?? 5)
  );

  // Niveau de chaque joueur et moyenne de l'equipe, pour le multiplicateur de
  // ban qui cible le meilleur joueur d'un champion quand il domine son equipe.
  const eloByName = {};
  const elos = [];
  for (const p of players) {
    const e = playerElo(p);
    eloByName[p.name] = e;
    if (e != null) elos.push(e);
  }
  const teamAvgElo = elos.length ? elos.reduce((s, x) => s + x, 0) / elos.length : null;

  // --- Champions flex : joués par >= 2 joueurs différents ---
  const champToPlayers = new Map(); // championId -> [{player, champ}]
  for (const p of players) {
    for (const c of p.champions) {
      if (!champToPlayers.has(c.championId))
        champToPlayers.set(c.championId, []);
      champToPlayers.get(c.championId).push({ player: p.name, champ: c });
    }
  }

  const flex = [];
  for (const [championId, entries] of champToPlayers) {
    // Un joueur ne "compte" pour un flex que s'il maitrise vraiment le champion :
    // au moins 5 parties OU au moins 80k points de maitrise. Les picks anecdotiques
    // (< 5 parties ET < 80k maitrise) sont ecartes.
    const qualified = entries.filter(
      (e) => e.champ.games >= FLEX_MIN_GAMES || e.champ.masteryPoints >= FLEX_MIN_MASTERY
    );
    if (qualified.length >= 2) {
      // Vraie flexibilite d'EQUIPE : le champion doit etre reellement joue dans
      // >= 2 roles differents par ces joueurs (d'apres l'historique). Ex. Shen
      // joue TOP par les deux -> pas flex ; Jax joue TOP et JUNGLE -> flex.
      const teamRoles = [...new Set(qualified.map((e) => e.champ.topRole).filter(Boolean))];
      if (teamRoles.length >= 2) {
        flex.push({
          championId,
          name: qualified[0].champ.name,
          image: qualified[0].champ.image,
          roles: teamRoles,
          players: qualified.map((e) => ({
            name: e.player,
            games: e.champ.games,
            winrate: e.champ.winrate,
            role: e.champ.topRole,
          })),
          totalGames: qualified.reduce((s, e) => s + e.champ.games, 0),
        });
      }
    }
  }
  flex.sort((a, b) => b.players.length - a.players.length || b.totalGames - a.totalGames);

  // --- Bans recommandés ---
  const bans = [];
  for (const [championId, entries] of champToPlayers) {
    // meilleur joueur de l'équipe sur ce champion
    let best = null;
    for (const e of entries) {
      const s = championStrength(e.champ);
      if (!best || s.value > best.s.value) {
        best = { s, player: e.player, champ: e.champ };
      }
    }
    if (!best || best.s.value <= 0) continue;

    const masteryBoost = best.champ.masteryPoints >= 300000 ? 0.05 : 0;
    const metaInfo = metaByNorm[normName(best.champ.name)] || null;
    const metaFactor = metaInfo ? META_FACTOR[metaInfo.tier] ?? 1 : 1;
    // Flexibilite du champion DANS LE JEU (nb de roles jouables en meta), leger :
    // 1 role = 1.0, 2 = 1.1, 3 = 1.2, etc.
    const roleCount = metaInfo?.flexRoles?.length || 1;
    const gameFlexFactor = 1 + 0.1 * Math.max(0, roleCount - 1);
    // Multiplicateur "niveau" : plus le meilleur joueur du champion est au-dessus
    // de la moyenne de son equipe, plus on concentre le ban sur lui. +0.1 par
    // cran de division (~100) au-dessus, plafonne a +0.3. Neutre s'il est en
    // dessous ou si les rangs sont inconnus.
    const bestElo = eloByName[best.player];
    let skillFactor = 1;
    if (teamAvgElo != null && bestElo != null && bestElo > teamAvgElo) {
      skillFactor = 1 + Math.min(0.3, 0.1 * ((bestElo - teamAvgElo) / 100));
    }
    const score = Math.min(
      100,
      (best.s.value * gameFlexFactor * metaFactor * skillFactor + masteryBoost) * 100
    );

    const reasons = [];
    if (best.champ.playRate >= 0.5 && best.champ.games >= 3)
      reasons.push(`${best.player} quasi one-trick (${Math.round(best.champ.playRate * 100)}% de ses parties)`);
    if (best.champ.winrate >= 0.6 && best.champ.games >= 3)
      reasons.push(`${Math.round(best.champ.winrate * 100)}% WR sur ${best.champ.games} parties`);
    if (best.champ.kda.ratio >= 4)
      reasons.push(`KDA ${best.champ.kda.ratio}`);
    if (roleCount >= 2)
      reasons.push(`flex ${roleCount} roles en jeu`);
    if (best.champ.masteryPoints >= 100000)
      reasons.push(`${fmtMasteryPts(best.champ.masteryPoints)} pts de maîtrise`);
    if (skillFactor >= 1.1)
      reasons.push(`${best.player} au-dessus du niveau de l'equipe`);
    if (metaInfo && metaInfo.tier <= 2)
      reasons.push(`meta ${metaInfo.tierLabel} (${Math.round(metaInfo.winRate * 100)}% WR)`);

    bans.push({
      championId,
      name: best.champ.name,
      image: best.champ.image,
      score: Math.round(score),
      role: best.champ.topRole || "",
      bestPlayer: best.player,
      games: best.champ.games,
      winrate: best.champ.winrate,
      kda: best.champ.kda.ratio,
      kdaAvg: {
        kills: best.champ.kda.kills,
        deaths: best.champ.kda.deaths,
        assists: best.champ.kda.assists,
      },
      masteryPoints: best.champ.masteryPoints,
      meta: metaInfo,
      reasons,
      // Detail du calcul (pour la tooltip du score).
      breakdown: {
        confidence: best.s.confidence,
        volume: best.s.volume,
        recent: best.s.recent,
        winrate: best.s.win,
        kda: best.s.kda,
        force: best.s.value,
        gameFlexFactor,
        roleCount,
        metaFactor,
        skillFactor,
        masteryBoost,
      },
    });
  }
  bans.sort((a, b) => b.score - a.score);

  return {
    generatedAt: Date.now(),
    ddragonVersion: ddragon.version,
    metaPatch: meta?.patch || null,
    players,
    flex,
    bans,
  };
}
