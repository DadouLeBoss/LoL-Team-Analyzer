// Transforme les données brutes Riot en analyse d'équipe :
//  - stats par joueur et par champion (parties, winrate, KDA)
//  - champions "flex" (jouables par plusieurs joueurs)
//  - liste de bans recommandés avec un score de danger

// Extrait la ligne du joueur (puuid) dans le détail d'une partie.
function extractParticipant(match, puuid) {
  if (!match?.info?.participants) return null;
  const p = match.info.participants.find((x) => x.puuid === puuid);
  if (!p) return null;
  return {
    matchId: match.metadata.matchId,
    championId: p.championId,
    championName: p.championName,
    win: p.win,
    kills: p.kills,
    deaths: p.deaths,
    assists: p.assists,
    role: p.teamPosition || p.individualPosition || "",
    queueId: match.info.queueId,
    gameCreation: match.info.gameCreation,
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
  for (const g of games) {
    if (!byChamp.has(g.championId)) {
      byChamp.set(g.championId, {
        championId: g.championId,
        name: g.championName,
        games: 0,
        wins: 0,
        kills: 0,
        deaths: 0,
        assists: 0,
        roles: {},
      });
    }
    const c = byChamp.get(g.championId);
    c.games++;
    if (g.win) c.wins++;
    c.kills += g.kills;
    c.deaths += g.deaths;
    c.assists += g.assists;
    if (g.role) c.roles[g.role] = (c.roles[g.role] || 0) + 1;
  }

  const totalGames = games.length;
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
      // part des parties récentes sur ce champion (signal one-trick)
      playRate: totalGames ? c.games / totalGames : 0,
      masteryPoints: mastery?.championPoints || 0,
      masteryLevel: mastery?.championLevel || 0,
      topRole: Object.entries(c.roles).sort((a, b) => b[1] - a[1])[0]?.[0] || "",
    };
  });

  champions.sort((a, b) => b.games - a.games || b.masteryPoints - a.masteryPoints);
  return { totalGames, champions };
}

// Force d'un joueur sur un champion (0..1), pondérée par la taille
// d'échantillon. Combine winrate, KDA et volume de parties.
function championStrength(champ) {
  const confidence = Math.min(champ.games / 5, 1); // besoin de ~5 parties
  const winComponent = champ.winrate;
  const kdaComponent = Math.min(champ.kda.ratio / 5, 1); // KDA 5 = excellent
  const volumeComponent = champ.playRate; // spam = maîtrise
  const raw =
    0.45 * winComponent + 0.3 * kdaComponent + 0.25 * volumeComponent;
  return confidence * raw;
}

// Construit l'analyse complète de l'équipe.
export function analyzeTeam(playerRaws, ddragon) {
  // playerRaws: [{ riotId, name, puuid, masteries, matches:[matchDetail] }]
  const players = playerRaws.map((pr) => {
    const games = pr.matches
      .map((m) => extractParticipant(m, pr.puuid))
      .filter(Boolean);
    const agg = aggregatePlayer(games, pr.masteries, ddragon);

    // Les 5 parties les plus récentes (l'ordre Riot est déjà anti-chronologique).
    const recentMatches = games.slice(0, 5).map((g) => ({
      championId: g.championId,
      name: ddragon.byId[g.championId]?.name || g.championName || `#${g.championId}`,
      image: ddragon.byId[g.championId]?.image || null,
      win: g.win,
      kills: g.kills,
      deaths: g.deaths,
      assists: g.assists,
      kdaRatio: +kdaRatio(g.kills, g.deaths, g.assists).toFixed(2),
      role: g.role,
    }));

    // Les 5 champions avec le plus de points de maîtrise.
    const topMasteries = [...pr.masteries]
      .sort((a, b) => b.championPoints - a.championPoints)
      .slice(0, 5)
      .map((m) => ({
        championId: m.championId,
        name: ddragon.byId[m.championId]?.name || `#${m.championId}`,
        image: ddragon.byId[m.championId]?.image || null,
        points: m.championPoints,
        level: m.championLevel,
      }));

    // Role principal = position la plus frequente sur les parties recentes.
    const roleCounts = {};
    for (const g of games) if (g.role) roleCounts[g.role] = (roleCounts[g.role] || 0) + 1;
    const mainRole = Object.entries(roleCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "";

    return {
      riotId: pr.riotId,
      name: pr.name,
      puuid: pr.puuid,
      rank: pr.rank || { solo: null, flex: null },
      mainRole,
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
    if (entries.length >= 2) {
      flex.push({
        championId,
        name: entries[0].champ.name,
        image: entries[0].champ.image,
        players: entries.map((e) => ({
          name: e.player,
          games: e.champ.games,
          winrate: e.champ.winrate,
        })),
        totalGames: entries.reduce((s, e) => s + e.champ.games, 0),
      });
    }
  }
  flex.sort((a, b) => b.players.length - a.players.length || b.totalGames - a.totalGames);

  // --- Bans recommandés ---
  const bans = [];
  for (const [championId, entries] of champToPlayers) {
    // meilleur joueur de l'équipe sur ce champion
    let best = null;
    for (const e of entries) {
      const strength = championStrength(e.champ);
      if (!best || strength > best.strength) {
        best = { strength, player: e.player, champ: e.champ };
      }
    }
    if (!best || best.strength <= 0) continue;

    const flexCount = entries.length;
    const flexFactor = 1 + 0.25 * (flexCount - 1); // pooled = plus dangereux
    const masteryBoost = best.champ.masteryPoints > 100000 ? 0.05 : 0;
    const score = Math.min(100, (best.strength * flexFactor + masteryBoost) * 100);

    const reasons = [];
    if (best.champ.playRate >= 0.5 && best.champ.games >= 3)
      reasons.push(`${best.player} quasi one-trick (${Math.round(best.champ.playRate * 100)}% de ses parties)`);
    if (best.champ.winrate >= 0.6 && best.champ.games >= 3)
      reasons.push(`${Math.round(best.champ.winrate * 100)}% WR sur ${best.champ.games} parties`);
    if (best.champ.kda.ratio >= 4)
      reasons.push(`KDA ${best.champ.kda.ratio}`);
    if (flexCount >= 2)
      reasons.push(`jouable par ${flexCount} joueurs`);
    if (best.champ.masteryPoints > 100000)
      reasons.push(`${Math.round(best.champ.masteryPoints / 1000)}k pts de maîtrise`);

    bans.push({
      championId,
      name: best.champ.name,
      image: best.champ.image,
      score: Math.round(score),
      bestPlayer: best.player,
      games: best.champ.games,
      winrate: best.champ.winrate,
      kda: best.champ.kda.ratio,
      masteryPoints: best.champ.masteryPoints,
      flexCount,
      reasons,
    });
  }
  bans.sort((a, b) => b.score - a.score);

  return {
    generatedAt: Date.now(),
    ddragonVersion: ddragon.version,
    players,
    flex,
    bans,
  };
}
