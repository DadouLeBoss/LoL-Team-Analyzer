# LoL Team Analyzer

Petite web app pour analyser une equipe de 5 joueurs sur League of Legends
a partir de l'API officielle Riot Games : pools de champions par joueur,
champions flex (jouables par plusieurs coequipiers) et bans recommandes.

## Fonctionnalites

- Saisie de 5 comptes (format Pseudo#TAG) et choix de la region.
- Analyse de toutes les parties classees de la saison (Solo/Duo et Flex).
- Detail par joueur : rang Solo/Duo et Flex, 5 parties recentes, 5 meilleures
  maitrises. Joueurs tries par role (TOP, JUNGLE, MID, BOT, SUPPORT).
- Champions flex : joues par 2 joueurs ou plus dans l'equipe (au moins 5
  parties OU 80k de maitrise).
- Bans recommandes : score de danger base sur le volume (global + 30 dernieres
  parties), le winrate, le KDA, la flexibilite et la force en meta du champion.

## Force en meta (OP.GG)

Le tier et le winrate global de chaque champion (patch courant) sont figes dans
`data/meta.json` et servent a prioriser les bans (un champion fort en meta ET
joue par un joueur monte dans la liste). La donnee provient de l'endpoint MCP
public d'OP.GG. Pour rafraichir a chaque nouveau patch :

```bash
node scripts/fetch-meta.mjs
```

## Limite de debit et cache

L'API Riot plafonne l'application a 100 requetes / 2 min. Le premier chargement
d'une saison complete peut donc prendre une quinzaine de minutes. Les parties
sont mises en cache (JSON, dossier `cache/`, cloisonne par cle API) : s'il est
interrompu, un nouveau lancement reprend la ou il s'etait arrete, et les
analyses suivantes sont instantanees.

## Prerequis

- Node.js 18 ou plus recent.
- Une cle API Riot Games (https://developer.riotgames.com).

## Installation

```bash
npm install
```

Cree un fichier `.env.local` a la racine et ajoute ta cle :

```
RIOT_API_KEY=RGAPI-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

La cle de developpement expire toutes les 24h : il faut la regenerer chaque
jour sur le portail Riot, ou demander une cle personnelle permanente.

## Lancer

```bash
npm run dev
```

Puis ouvre http://localhost:3000, renseigne les comptes et clique sur Analyser.

## Fonctionnement

- Les appels a l'API Riot passent par une route serveur (`app/api/analyze`)
  pour ne jamais exposer la cle au navigateur.
- Les parties et les comptes sont mis en cache en JSON dans `cache/` : chaque
  partie n'est telechargee qu'une seule fois, meme si plusieurs coequipiers y
  figurent.
- Les noms et images de champions viennent de Data Dragon (donnees statiques
  Riot, sans cle).

## Structure

```
app/
  page.jsx            formulaire + affichage des resultats
  api/analyze/route.js orchestration fetch + cache + analyse
lib/
  riot.js             client API Riot (throttle + retry 429)
  cache.js            cache JSON sur disque
  analysis.js         agregation, flex, score de ban
```
