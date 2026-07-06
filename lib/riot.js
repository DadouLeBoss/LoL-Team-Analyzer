import { createHash } from "node:crypto";
import { readCache, writeCache, cachePaths } from "./cache.js";

const KEY = process.env.RIOT_API_KEY;

// Empreinte courte de la cle : sert a cloisonner le cache (les PUUID sont
// chiffres par cle API, donc non partageables d'une cle a l'autre).
export const KEY_NS = createHash("sha1").update(KEY || "none").digest("hex").slice(0, 8);

// --- Limiteur de débit ------------------------------------------------------
// La limite APPLICATIVE de la cle (en-tete X-App-Rate-Limit) reste 20 req/s et
// 100 req / 2 min, quelles que soient les limites par methode. On pace donc
// PROACTIVEMENT sous ces fenetres pour ne jamais declencher de 429.
const MAX_CONCURRENT = 10;
const APP_LIMITS = [
  { max: 18, windowMs: 1000 }, // marge sous 20/s
  { max: 95, windowMs: 120000 }, // marge sous 100/120s
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let active = 0;
const queue = [];
const hits = []; // horodatages des requetes recentes (pour les fenetres)

function schedule(fn) {
  return new Promise((resolve, reject) => {
    queue.push({ fn, resolve, reject });
    pump();
  });
}

function pump() {
  if (active >= MAX_CONCURRENT || queue.length === 0) return;
  const { fn, resolve, reject } = queue.shift();
  active++;
  fn()
    .then(resolve, reject)
    .finally(() => {
      active--;
      pump();
    });
}

// Attend qu'un creneau soit disponible dans toutes les fenetres de limite.
async function waitForSlot() {
  for (;;) {
    const now = Date.now();
    while (hits.length && now - hits[0] > 120000) hits.shift(); // purge > 2 min
    let waitMs = 0;
    for (const lim of APP_LIMITS) {
      const cutoff = now - lim.windowMs;
      const inWindow = hits.filter((t) => t > cutoff);
      if (inWindow.length >= lim.max) {
        waitMs = Math.max(waitMs, inWindow[0] + lim.windowMs - now + 20);
      }
    }
    if (waitMs <= 0) {
      hits.push(Date.now());
      return;
    }
    await sleep(waitMs);
  }
}

class RiotError extends Error {
  constructor(status, url) {
    super(`Riot API ${status} sur ${url}`);
    this.status = status;
  }
}

// Appel HTTP brut : pacing proactif + retry sur 429 (filet) et 5xx.
async function rawFetch(url) {
  for (let attempt = 0; attempt < 8; attempt++) {
    await waitForSlot();
    const res = await fetch(url, { headers: { "X-Riot-Token": KEY } });

    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("retry-after")) || 5;
      await sleep((retryAfter + 0.5) * 1000);
      continue;
    }
    if (res.status >= 500) {
      await sleep(1500);
      continue;
    }
    if (res.status === 404) return null; // ressource inexistante -> null
    if (!res.ok) throw new RiotError(res.status, url);
    return res.json();
  }
  throw new RiotError(429, url);
}

const call = (url) => schedule(() => rawFetch(url));

// --- Endpoints --------------------------------------------------------------
function base(host) {
  return `https://${host}.api.riotgames.com`;
}

// Riot ID "Pseudo#TAG" -> compte { puuid, gameName, tagLine }. Mis en cache
// (le puuid est stable), donc un seul appel par joueur à vie.
export async function getAccount(riotId, regional) {
  const cached = await readCache(cachePaths.account(KEY_NS, riotId));
  if (cached) return cached;

  const hashIndex = riotId.lastIndexOf("#");
  const gameName = riotId.slice(0, hashIndex);
  const tagLine = riotId.slice(hashIndex + 1);
  const url = `${base(regional)}/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(
    gameName
  )}/${encodeURIComponent(tagLine)}`;

  const account = await call(url);
  if (account) await writeCache(cachePaths.account(KEY_NS, riotId), account);
  return account;
}

// Maîtrise des champions (points par champion). Non mis en cache : évolue.
export async function getMasteries(puuid, platform) {
  const url = `${base(platform)}/lol/champion-mastery/v4/champion-masteries/by-puuid/${puuid}`;
  return (await call(url)) || [];
}

// Rang classe du joueur (Solo/Duo et Flex). Non mis en cache : evolue.
export async function getRank(puuid, platform) {
  const url = `${base(platform)}/lol/league/v4/entries/by-puuid/${puuid}`;
  return (await call(url)) || [];
}

// Tous les IDs de parties classees depuis le debut de la saison, par pages de
// 100 (l'API en renvoie 100 au maximum par appel). Non mis en cache : evolue.
export async function getSeasonMatchIds(
  puuid,
  regional,
  { startTime, type = "ranked", cap = 300 } = {}
) {
  const ids = [];
  const pageSize = 100;
  for (let start = 0; start < cap; start += pageSize) {
    const count = Math.min(pageSize, cap - start);
    const params = new URLSearchParams({ start: String(start), count: String(count) });
    if (startTime) params.set("startTime", String(startTime));
    if (type) params.set("type", type);
    const url = `${base(regional)}/lol/match/v5/matches/by-puuid/${puuid}/ids?${params}`;
    const page = (await call(url)) || [];
    ids.push(...page);
    if (page.length < count) break; // plus de parties disponibles
  }
  return ids;
}

// Ne conserve que les champs utiles a l'analyse (~2 Ko au lieu de ~75 Ko par
// partie). On garde les 10 participants pour que le dedoublonnage fonctionne
// quel que soit l'ensemble de joueurs analyses. Idempotent : une partie deja
// allegee (pas de .info) est renvoyee telle quelle.
export function slimMatch(match) {
  if (!match || !match.info) return match;
  return {
    matchId: match.metadata.matchId,
    queueId: match.info.queueId,
    gameCreation: match.info.gameCreation,
    gameDuration: match.info.gameDuration,
    participants: match.info.participants.map((p) => ({
      puuid: p.puuid,
      championId: p.championId,
      championName: p.championName,
      win: p.win,
      kills: p.kills,
      deaths: p.deaths,
      assists: p.assists,
      teamPosition: p.teamPosition,
      individualPosition: p.individualPosition,
    })),
  };
}

// Détail d'une partie (version allegee). Mis en cache : une partie est immuable,
// donc on ne la télécharge qu'une seule fois même si plusieurs coéquipiers y
// figurent.
export async function getMatch(matchId, regional) {
  const cached = await readCache(cachePaths.match(KEY_NS, matchId));
  if (cached) return cached;

  const url = `${base(regional)}/lol/match/v5/matches/${matchId}`;
  const full = await call(url);
  if (!full) return null;

  const slim = slimMatch(full);
  await writeCache(cachePaths.match(KEY_NS, matchId), slim);
  return slim;
}

// --- Data Dragon (données statiques, sans clé) ------------------------------
// Mappe championId (numérique) -> nom + image. Mis en cache 24h.
export async function getDDragon() {
  const cached = await readCache(cachePaths.ddragon());
  const dayMs = 24 * 60 * 60 * 1000;
  if (cached && cached.fetchedAt && Date.now() - cached.fetchedAt < dayMs) {
    return cached;
  }

  const versions = await (
    await fetch("https://ddragon.leagueoflegends.com/api/versions.json")
  ).json();
  const version = versions[0];
  const champData = await (
    await fetch(
      `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`
    )
  ).json();

  const byId = {};
  for (const champ of Object.values(champData.data)) {
    byId[Number(champ.key)] = { name: champ.name, image: champ.image.full, id: champ.id };
  }

  const result = { version, byId, fetchedAt: Date.now() };
  await writeCache(cachePaths.ddragon(), result);
  return result;
}
