import { readCache, writeCache, cachePaths } from "./cache.js";

const KEY = process.env.RIOT_API_KEY;

// --- Limiteur de débit ------------------------------------------------------
// La clé de dev tolère ~20 req/s et 100 req / 2 min. On limite la
// concurrence et on respecte l'en-tête Retry-After en cas de 429.
const MAX_CONCURRENT = 5;
let active = 0;
const queue = [];

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class RiotError extends Error {
  constructor(status, url) {
    super(`Riot API ${status} sur ${url}`);
    this.status = status;
  }
}

// Appel HTTP brut avec retry automatique sur 429 et 5xx.
async function rawFetch(url) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: { "X-Riot-Token": KEY } });

    if (res.status === 429 || res.status >= 500) {
      const retryAfter = Number(res.headers.get("retry-after")) || 2;
      await sleep((retryAfter + 0.5) * 1000);
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
  const cached = await readCache(cachePaths.account(riotId));
  if (cached) return cached;

  const hashIndex = riotId.lastIndexOf("#");
  const gameName = riotId.slice(0, hashIndex);
  const tagLine = riotId.slice(hashIndex + 1);
  const url = `${base(regional)}/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(
    gameName
  )}/${encodeURIComponent(tagLine)}`;

  const account = await call(url);
  if (account) await writeCache(cachePaths.account(riotId), account);
  return account;
}

// Maîtrise des champions (points par champion). Non mis en cache : évolue.
export async function getMasteries(puuid, platform) {
  const url = `${base(platform)}/lol/champion-mastery/v4/champion-masteries/by-puuid/${puuid}`;
  return (await call(url)) || [];
}

// Liste des IDs des dernières parties. Non mis en cache : évolue.
export async function getMatchIds(puuid, regional, count) {
  const url = `${base(
    regional
  )}/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=${count}`;
  return (await call(url)) || [];
}

// Détail d'une partie. Mis en cache : une partie est immuable, donc on ne la
// télécharge qu'une seule fois même si plusieurs coéquipiers y figurent.
export async function getMatch(matchId, regional) {
  const cached = await readCache(cachePaths.match(matchId));
  if (cached) return cached;

  const url = `${base(regional)}/lol/match/v5/matches/${matchId}`;
  const match = await call(url);
  if (match) await writeCache(cachePaths.match(matchId), match);
  return match;
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
