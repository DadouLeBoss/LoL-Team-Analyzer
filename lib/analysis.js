// Transforme les données brutes Riot en analyse d'équipe :
//  - stats par joueur et par champion (parties, winrate, KDA)
//  - champions "flex" (jouables par plusieurs joueurs)
//  - liste de bans recommandés avec un score de danger

import { DEFAULT_SETTINGS } from "./settings.js";

// Seuils pour qu'un champion soit retenu comme "flex" pour un joueur.
const FLEX_MIN_GAMES = 5;
const FLEX_MIN_MASTERY = 80000;

export const normName = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
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

// Conversion inverse : un "elo" -> rang lisible { value, tier, division, lp }.
export function eloToRank(elo) {
  if (elo == null) return null;
  const tiers = Object.entries(TIER_ELO).sort((a, b) => b[1] - a[1]); // decroissant
  let tier = "IRON";
  let base = 0;
  for (const [t, b] of tiers) {
    if (elo >= b) {
      tier = t;
      base = b;
      break;
    }
  }
  const rem = elo - base;
  if (APEX_TIERS.has(tier)) {
    return { value: Math.round(elo), tier, division: null, lp: Math.round(rem) };
  }
  const divIdx = Math.min(3, Math.floor(rem / 100));
  return {
    value: Math.round(elo),
    tier,
    division: ["IV", "III", "II", "I"][divIdx],
    lp: Math.round(rem - divIdx * 100),
  };
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

// Agrège les parties d'un joueur par champion. Chaque partie est ponderee par
// sa recence (demi-vie S.halfLifeDays) : l'activite d'un champion = sa part du
// poids total, ce qui fond le volume global et la forme du moment en une seule
// mesure fluide. On compte aussi les parties de la fenetre "preparation"
// (S.prepWindowDays) pour reperer un champion recemment travaille.
function aggregatePlayer(games, masteries, ddragon, S, now) {
  const masteryById = {};
  for (const m of masteries) masteryById[m.championId] = m;

  const DAY = 86400000;
  const prepMs = S.prepWindowDays * DAY;
  // Poids de recence : 1 aujourd'hui, 0.5 apres une demi-vie, etc.
  const decay = (ts) => (ts ? Math.pow(0.5, (now - ts) / DAY / S.halfLifeDays) : 1);

  const byChamp = new Map();
  let totalWeight = 0;
  for (const g of games) {
    if (!byChamp.has(g.championId)) {
      byChamp.set(g.championId, {
        championId: g.championId,
        name: g.championName,
        games: 0,
        recentGames: 0, // parties dans la fenetre "preparation"
        weight: 0, // somme des poids de recence
        wins: 0,
        kills: 0,
        deaths: 0,
        assists: 0,
        roles: {},
      });
    }
    const c = byChamp.get(g.championId);
    const w = decay(g.gameCreation);
    totalWeight += w;
    c.games++;
    c.weight += w;
    if (g.gameCreation && now - g.gameCreation <= prepMs) c.recentGames++;
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
      // activite : part du poids de recence de ce champion sur le total (fond
      // le volume global et la forme recente en une seule valeur 0..1)
      activity: totalWeight ? c.weight / totalWeight : 0,
      // part brute des parties sur la saison (pour les libelles "one-trick")
      playRate: totalGames ? c.games / totalGames : 0,
      // parties jouees dans la fenetre "preparation" (derniers jours)
      recentGames: c.recentGames,
      masteryPoints: mastery?.championPoints || 0,
      masteryLevel: mastery?.championLevel || 0,
      topRole: Object.entries(c.roles).sort((a, b) => b[1] - a[1])[0]?.[0] || "",
    };
  });

  champions.sort((a, b) => b.games - a.games || b.masteryPoints - a.masteryPoints);
  return { totalGames, champions };
}

// Force d'un joueur sur un champion (0..1), pondérée par la taille
// d'échantillon. L'activite (jeu recent) prime, puis le winrate lisse, le KDA
// pesant peu.
function championStrength(champ, S) {
  const confidence = Math.min(champ.games / S.confGames, 1); // besoin de ~N parties
  const activity = champ.activity; // part de jeu ponderee par la recence
  // Winrate lisse (bayesien) : k parties fictives a 50% amortissent les petits
  // echantillons (un 3-0 ne vaut pas 100%, il tend vers ~69%).
  const k = S.winSmoothingK;
  const win = (champ.wins + k * 0.5) / (champ.games + k);
  const kda = Math.min(champ.kda.ratio / 5, 1); // KDA 5 = excellent
  // Bonus de maitrise : une composante de la force (donc multipliee ensuite par
  // les facteurs meta/flex/niveau), plutot qu'un ajout final.
  const mastery = champ.masteryPoints >= S.masteryThreshold ? S.masteryBoost : 0;
  const raw = S.wActivity * activity + S.wWin * win + S.wKda * kda + mastery;
  return { value: confidence * raw, confidence, activity, win, winRaw: champ.winrate, kda, mastery };
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
export function analyzeTeam(playerRaws, ddragon, meta, settings) {
  // playerRaws: [{ riotId, name, puuid, masteries, matches:[matchDetail] }]
  // Reglages (surcharge cliente eventuelle) fusionnes avec les defauts.
  const S = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  const now = Date.now(); // reference temporelle pour la ponderation de recence
  const META_FACTOR = { 1: S.metaOP, 2: S.metaFort, 3: S.metaBon, 4: S.metaMoyen, 5: S.metaFaible };
  // Index de la meta par nom normalise (pour un matching robuste).
  const metaByNorm = {};
  if (meta?.champions)
    for (const [name, info] of Object.entries(meta.champions))
      metaByNorm[normName(name)] = info;
  const players = playerRaws.map((pr) => {
    const games = pr.matches
      .map((m) => extractParticipant(m, pr.puuid))
      .filter(Boolean);
    const agg = aggregatePlayer(games, pr.masteries, ddragon, S, now);

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
    p.elo = e; // expose le niveau numerique du joueur (comparatif lane par lane)
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

  // Force de chaque champion pour chaque joueur, indexee par role. Sert au
  // bonus "sans repli" (comparer un champion a son 2e meilleur choix du meme
  // role) et evite de recalculer les forces.
  const strengthByKey = new Map(); // `${name}::${championId}` -> objet force
  const forceByPlayerRole = new Map(); // name -> Map(role -> [{championId, force}] desc)
  for (const p of players) {
    const roleMap = new Map();
    for (const c of p.champions) {
      const s = championStrength(c, S);
      strengthByKey.set(`${p.name}::${c.championId}`, s);
      const role = c.topRole || "";
      if (!roleMap.has(role)) roleMap.set(role, []);
      roleMap.get(role).push({ championId: c.championId, force: s.value });
    }
    for (const arr of roleMap.values()) arr.sort((a, b) => b.force - a.force);
    forceByPlayerRole.set(p.name, roleMap);
  }

  // --- Bans recommandés ---
  const bans = [];
  for (const [championId, entries] of champToPlayers) {
    // meilleur joueur de l'équipe sur ce champion
    let best = null;
    for (const e of entries) {
      const s =
        strengthByKey.get(`${e.player}::${e.champ.championId}`) || championStrength(e.champ, S);
      if (!best || s.value > best.s.value) {
        best = { s, player: e.player, champ: e.champ };
      }
    }
    if (!best || best.s.value <= 0) continue;

    // Champion "en preparation" : assez de parties dans la fenetre recente ET
    // majoritairement recentes (pick recemment travaille, souvent pour un match).
    const isPrep =
      best.champ.recentGames >= S.prepMinGames &&
      best.champ.recentGames >= 0.6 * best.champ.games;
    const prepFactor = isPrep ? S.prepBoost : 1;

    // Bonus "sans repli" : un ban est d'autant plus precieux que le joueur n'a
    // rien d'equivalent derriere. On mesure l'ecart RELATIF entre ce champion et
    // son 2e meilleur choix du meme role. Repli faible ou absent (one-trick) ->
    // gros bonus ; repli aussi fort -> aucun bonus. Jamais de malus : la base
    // reste la force pleine, on ne fait qu'ajouter.
    const role = best.champ.topRole || "";
    let secondBestForce = 0;
    if (role) {
      const arr = forceByPlayerRole.get(best.player)?.get(role) || [];
      for (const e of arr) {
        if (e.championId !== best.champ.championId) {
          secondBestForce = e.force;
          break;
        }
      }
    }
    const gap =
      best.s.value > 0 ? Math.max(0, (best.s.value - secondBestForce) / best.s.value) : 0;
    const soloFactor = 1 + S.soloBoost * gap;

    const metaInfo = metaByNorm[normName(best.champ.name)] || null;
    const metaFactor = metaInfo ? META_FACTOR[metaInfo.tier] ?? 1 : 1;
    // Flexibilite du champion DANS LE JEU (nb de roles jouables en meta), leger :
    // 1 role = 1.0, 2 = 1.1, 3 = 1.2, etc.
    const roleCount = metaInfo?.flexRoles?.length || 1;
    const gameFlexFactor = 1 + S.flexStep * Math.max(0, roleCount - 1);
    // Multiplicateur "niveau" : plus le meilleur joueur du champion est au-dessus
    // de la moyenne de son equipe, plus on concentre le ban sur lui. +0.1 par
    // cran de division (~100) au-dessus, sans plafond (le score final reste
    // borne a 100). Neutre s'il est en dessous ou si les rangs sont inconnus.
    const bestElo = eloByName[best.player];
    let skillFactor = 1;
    if (teamAvgElo != null && bestElo != null && bestElo > teamAvgElo) {
      skillFactor = 1 + S.skillStep * ((bestElo - teamAvgElo) / 100);
    }

    const score = Math.min(
      100,
      best.s.value * gameFlexFactor * metaFactor * skillFactor * prepFactor * soloFactor * 100
    );

    const reasons = [];
    if (isPrep)
      reasons.push(`${best.player} travaille ce pick (${best.champ.recentGames} parties recentes)`);
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
    if (gap >= 0.6 && best.champ.games >= 3)
      reasons.push(`${best.player} sans vrai repli a ce poste`);
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
      isPrep,
      reasons,
      // Detail du calcul (pour la tooltip du score).
      breakdown: {
        confidence: best.s.confidence,
        activity: best.s.activity,
        winrate: best.s.win, // winrate lisse (utilise dans la force)
        winrateRaw: best.s.winRaw, // winrate brut (pour reference)
        kda: best.s.kda,
        mastery: best.s.mastery,
        weights: { wActivity: S.wActivity, wWin: S.wWin, wKda: S.wKda },
        force: best.s.value,
        secondBestForce,
        gap,
        soloFactor,
        gameFlexFactor,
        roleCount,
        metaFactor,
        skillFactor,
        prepFactor,
      },
    });
  }
  bans.sort((a, b) => b.score - a.score);

  return {
    generatedAt: Date.now(),
    ddragonVersion: ddragon.version,
    metaPatch: meta?.patch || null,
    teamElo: eloToRank(teamAvgElo),
    players,
    flex,
    bans,
  };
}
