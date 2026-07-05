"use client";

import { useState } from "react";

const DEFAULT_ACCOUNTS = [
  "Zhynkaaa#KCwin",
  "League of Pigs#PIGS",
  "Cul Cul#prout",
  "Caca super cool#prout",
  "MachineGaming#EUW",
];

const REGIONS = [
  { key: "EUW", label: "Europe de l'Ouest (EUW)", platform: "euw1", regional: "europe", log: "euw" },
  { key: "EUNE", label: "Europe Nord & Est (EUNE)", platform: "eun1", regional: "europe", log: "eune" },
  { key: "NA", label: "Amerique du Nord (NA)", platform: "na1", regional: "americas", log: "na" },
  { key: "KR", label: "Coree (KR)", platform: "kr", regional: "asia", log: "kr" },
  { key: "BR", label: "Bresil (BR)", platform: "br1", regional: "americas", log: "br" },
  { key: "LAN", label: "Latine Nord (LAN)", platform: "la1", regional: "americas", log: "lan" },
  { key: "LAS", label: "Latine Sud (LAS)", platform: "la2", regional: "americas", log: "las" },
  { key: "OCE", label: "Oceanie (OCE)", platform: "oc1", regional: "sea", log: "oce" },
  { key: "TR", label: "Turquie (TR)", platform: "tr1", regional: "europe", log: "tr" },
  { key: "JP", label: "Japon (JP)", platform: "jp1", regional: "asia", log: "jp" },
];

// Libelles de roles affiches (l'API renvoie TOP/JUNGLE/MIDDLE/BOTTOM/UTILITY).
const ROLE_LABEL = { TOP: "TOP", JUNGLE: "JUNGLE", MIDDLE: "MID", BOTTOM: "BOT", UTILITY: "SUPPORT" };
const ROLE_ORDER_LIST = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];
function roleLabel(r) {
  return ROLE_LABEL[r] || "";
}

// Roles cote meta (OP.GG) : top/jungle/mid/adc/support.
const META_ROLE_LABEL = { top: "TOP", jungle: "JUNGLE", mid: "MID", adc: "BOT", support: "SUPPORT" };
function metaRoleLabel(r) {
  return META_ROLE_LABEL[r] || (r || "").toUpperCase();
}

// Lien vers la fiche League of Graphs du joueur.
// "Caca super cool#prout" -> .../summoner/euw/Caca+super+cool-prout
function logUrl(riotId, logRegion) {
  const i = riotId.lastIndexOf("#");
  const name = riotId.slice(0, i).trim().split(/\s+/).join("+");
  const tag = riotId.slice(i + 1);
  return `https://www.leagueofgraphs.com/summoner/${logRegion}/${name}-${tag}`;
}

const APEX = ["MASTER", "GRANDMASTER", "CHALLENGER"];
function fmtTier(t) {
  return t ? t.charAt(0) + t.slice(1).toLowerCase() : "";
}

// Badge de rang pour une file (Solo/Duo ou Flex).
function RankBadge({ label, r }) {
  if (!r) {
    return (
      <span className="rank none">
        <b>{label}</b> Non classe
      </span>
    );
  }
  const div = APEX.includes(r.tier) ? "" : ` ${r.rank}`;
  const total = r.wins + r.losses;
  const wr = total ? Math.round((r.wins / total) * 100) : 0;
  return (
    <span className={`rank tier-${r.tier}`}>
      <b>{label}</b> {fmtTier(r.tier)}{div} · {r.lp} LP · {wr}% ({total})
    </span>
  );
}

function champImg(version, image) {
  if (!image) return null;
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${image}`;
}

// Lien vers la fiche Lolalytics du champion. Le slug = nom en minuscules sans
// caractere special, sauf ces exceptions ou Lolalytics ne garde que le 1er mot.
const LOLALYTICS_SLUG = { "Renata Glasc": "renata", "Nunu & Willump": "nunu" };
function lolalyticsUrl(name) {
  if (!name) return null;
  const slug = LOLALYTICS_SLUG[name] || name.toLowerCase().replace(/[^a-z0-9]/g, "");
  return `https://lolalytics.com/fr/lol/${slug}/build/`;
}

// Icone de champion cliquable (redirige vers Lolalytics).
function ChampIcon({ version, image, name, className }) {
  const src = champImg(version, image);
  if (!src) return null;
  return (
    <a
      className="champ-icon-link"
      href={lolalyticsUrl(name)}
      target="_blank"
      rel="noopener noreferrer"
      title={`${name} sur Lolalytics`}
    >
      <img className={className} src={src} alt={name} />
    </a>
  );
}

function pct(x) {
  return `${Math.round(x * 100)}%`;
}

function pct1(x) {
  return `${((x || 0) * 100).toFixed(1)}%`;
}

// Temps ecoule depuis une partie (epoch ms) -> "Il y a X min/heures/jours".
function relativeTime(ts) {
  if (!ts) return "";
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 60) return `Il y a ${Math.max(min, 1)} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `Il y a ${h} heure${h > 1 ? "s" : ""}`;
  const d = Math.floor(h / 24);
  return `Il y a ${d} jour${d > 1 ? "s" : ""}`;
}

function scoreColor(score) {
  if (score >= 60) return "#e05265";
  if (score >= 40) return "#e0a052";
  return "#c8aa6e";
}

function num2(x) {
  return (Math.round((x || 0) * 100) / 100).toFixed(2);
}

// Pastille de score de ban avec tooltip detaillant le calcul au survol.
function BanScore({ b }) {
  const d = b.breakdown;
  return (
    <div className="score-wrap">
      <div className="score" style={{ background: scoreColor(b.score) }}>
        {b.score}
      </div>
      {d && (
        <div className="score-tip">
          <div className="tip-title">Detail du score</div>
          <div className="tip-line">
            Force = confiance x (0.40·volume + 0.25·recent + 0.25·WR + 0.10·KDA)
          </div>
          <div className="tip-line mono">
            = {num2(d.confidence)} x (0.40·{num2(d.volume)} + 0.25·{num2(d.recent)} + 0.25·
            {num2(d.winrate)} + 0.10·{num2(d.kda)}) = {num2(d.force)}
          </div>
          <div className="tip-line mono">
            Score = force x flex-jeu(x{num2(d.gameFlexFactor)}, {d.roleCount} role
            {d.roleCount > 1 ? "s" : ""}) x meta(x{num2(d.metaFactor)})
            {d.masteryBoost > 0 ? ` + ${num2(d.masteryBoost)}` : ""} = {b.score}/100
          </div>
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const [accounts, setAccounts] = useState(DEFAULT_ACCOUNTS);
  const [regionKey, setRegionKey] = useState("EUW");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState({}); // puuid -> affiche 12 lignes
  const [roleFilter, setRoleFilter] = useState({}); // puuid -> role filtre (ou undefined)
  const [banRole, setBanRole] = useState(null); // role filtre pour la section bans

  function toggleExpanded(puuid) {
    setExpanded((prev) => ({ ...prev, [puuid]: !prev[puuid] }));
  }

  function toggleRole(puuid, role) {
    setRoleFilter((prev) => ({ ...prev, [puuid]: prev[puuid] === role ? undefined : role }));
  }

  function setAccount(i, value) {
    setAccounts((prev) => prev.map((a, idx) => (idx === i ? value : a)));
  }

  async function run() {
    const players = accounts.map((a) => a.trim()).filter(Boolean);
    if (players.length === 0) {
      setError("Renseigne au moins un compte.");
      return;
    }
    const region = REGIONS.find((r) => r.key === regionKey);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          players,
          region: { platform: region.platform, regional: region.regional },
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erreur inconnue");
      setData(json);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const version = data?.ddragonVersion;
  const logRegion = REGIONS.find((r) => r.key === regionKey)?.log || "euw";
  const banRoleList = data?.bans ? ROLE_ORDER_LIST.filter((r) => data.bans.some((b) => b.role === r)) : [];
  const filteredBans = data?.bans ? (banRole ? data.bans.filter((b) => b.role === banRole) : data.bans) : [];

  // -------------------- Vue formulaire --------------------
  if (!data) {
    return (
      <div className="wrap">
        <header className="top center">
          <img className="logo big" src="/logo.png" alt="LoL Team Analyzer" />
          <h1>
            LoL <span className="accent">Team Analyzer</span>
          </h1>
        </header>
        <p className="sub center-text">
          Renseigne jusqu'a 5 comptes (format Pseudo#TAG) et lance l'analyse de leurs parties classees de la saison.
        </p>

        <div className="card form">
          <div className="form-fields">
            {accounts.map((a, i) => (
              <div className="field" key={i}>
                <label>Joueur {i + 1}</label>
                <input
                  type="text"
                  value={a}
                  placeholder="Pseudo#TAG"
                  onChange={(e) => setAccount(i, e.target.value)}
                />
              </div>
            ))}
            <div className="field">
              <label>Region</label>
              <select value={regionKey} onChange={(e) => setRegionKey(e.target.value)}>
                {REGIONS.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error && <div className="notice error" style={{ marginTop: 16 }}>{error}</div>}

          <button className="refresh" onClick={run} disabled={loading} style={{ marginTop: 20 }}>
            {loading ? "Analyse en cours..." : "Analyser"}
          </button>
        </div>

        {loading && (
          <div className="loading">
            Recuperation des donnees Riot...
            <br />
            <span style={{ fontSize: 12 }}>
              Le premier chargement d'une saison complete peut prendre une quinzaine de minutes
              (limite Riot de 100 requetes / 2 min). S'il est interrompu, relance : le chargement
              reprend la ou il s'etait arrete grace au cache. Les analyses suivantes sont instantanees.
            </span>
          </div>
        )}
      </div>
    );
  }

  // -------------------- Vue resultats --------------------
  return (
    <div className="wrap">
      <header className="top">
        <div className="brand">
          <img className="logo" src="/logo.png" alt="LoL Team Analyzer" />
          <h1>
            LoL <span className="accent">Team Analyzer</span>
          </h1>
        </div>
        <button className="refresh ghost" onClick={() => setData(null)}>
          Nouvelle analyse
        </button>
      </header>
      <p className="sub">
        {data.players.length} joueurs analyses sur leurs parties classees de la saison · {data.matchesDownloaded} parties uniques · patch {version}
        {data.metaPatch && ` · meta OP.GG ${data.metaPatch}`}
      </p>

      {error && <div className="notice error">{error}</div>}

      {data.errors?.length > 0 && (
        <div className="notice error" style={{ marginTop: 16 }}>
          Comptes en erreur : {data.errors.map((e) => `${e.riotId} (${e.error})`).join(", ")}
        </div>
      )}

      {/* -------------------- Detail par joueur -------------------- */}
      <section className="section">
        <h2>Detail par joueur</h2>
        {data.players.map((p) => {
          const rows = expanded[p.puuid] ? 12 : 6;
          const activeRole = roleFilter[p.puuid];
          const roleData = activeRole ? p.byRole?.[activeRole] : null;
          const champs = roleData ? roleData.champions : p.champions;
          const recents = roleData ? roleData.recentMatches : p.recentMatches;
          return (
          <div className="card player" key={p.puuid}>
            <h3>
              <a
                className="player-link"
                href={logUrl(p.riotId, logRegion)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {p.name}
              </a>
              <RankBadge label="Solo/Duo" r={p.rank?.solo} />
              <RankBadge label="Flex" r={p.rank?.flex} />
              <div className="player-meta">
                <span className="count">{p.totalGames} parties analysees</span>
                <button className="see-more" onClick={() => toggleExpanded(p.puuid)}>
                  {expanded[p.puuid] ? "Voir moins" : "Voir plus"}
                </button>
              </div>
            </h3>

            {p.roles.length > 0 && (
              <div className="player-roles">
                {p.roles
                  .filter((r) => r.pct >= 0.1)
                  .map((r) => (
                    <button
                      className={`role-tag${activeRole === r.role ? " active" : ""}`}
                      onClick={() => toggleRole(p.puuid, r.role)}
                      title={`Filtrer sur ${roleLabel(r.role)}`}
                      key={r.role}
                    >
                      {roleLabel(r.role)} {pct(r.pct)}
                    </button>
                  ))}
              </div>
            )}

            <div className="player-cols">
              {/* Champions les plus joues */}
              <div className="col">
                <div className="col-title">
                  Champions les plus joues
                  {activeRole && <span className="col-filter">{roleLabel(activeRole)}</span>}
                </div>
                {champs.length === 0 ? (
                  <div className="empty">Aucune partie.</div>
                ) : (
                  <ul className="champ-list">
                    {champs.slice(0, rows).map((c, i) => (
                      <li className="champ-entry" key={i}>
                        <ChampIcon version={version} image={c.image} name={c.name} className="detail-icon" />
                        <div className="champ-info">
                          <div className="champ-line1">
                            <span className="mini-name">{c.name}</span>
                            <span className="champ-stats mono">
                              {c.games}p · {c.kda.kills}/{c.kda.deaths}/{c.kda.assists}
                            </span>
                            <span
                              className="champ-wr mono"
                              style={{ color: c.winrate >= 0.5 ? "var(--green)" : "var(--red)" }}
                            >
                              {pct(c.winrate)}
                            </span>
                          </div>
                          <div className="champ-line2">
                            {c.counters && c.counters.beatenBy.length > 0 && (
                              <span className="ctr bad">
                                <span className="ctr-lbl">contre par</span>
                                {c.counters.beatenBy.map((x) => x.name).join(" · ")}
                              </span>
                            )}
                            {c.counters && c.counters.beats.length > 0 && (
                              <span className="ctr good">
                                <span className="ctr-lbl">bat</span>
                                {c.counters.beats.map((x) => x.name).join(" · ")}
                              </span>
                            )}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Parties recentes */}
              <div className="col">
                <div className="col-title">
                  Parties recentes
                  {activeRole && <span className="col-filter">{roleLabel(activeRole)}</span>}
                </div>
                {recents.length === 0 ? (
                  <div className="empty">Aucune partie recente.</div>
                ) : (
                  <ul className="mini-list">
                    {recents.slice(0, rows).map((m, i) => (
                      <li key={i}>
                        <ChampIcon version={version} image={m.image} name={m.name} className="detail-icon" />
                        <div className="match-info">
                          <div className="match-line1">
                            <span className="mini-name">{m.name}</span>
                            <span className="mini-role">{roleLabel(m.role)}</span>
                          </div>
                          <div className="match-line2">
                            <span className={`result ${m.win ? "win" : "loss"}`}>
                              {m.win ? "V" : "D"}
                            </span>
                            <span className="mini-stat mono">
                              {m.kills}/{m.deaths}/{m.assists}
                            </span>
                            <span className="match-time">{relativeTime(m.gameCreation)}</span>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Meilleures maitrises */}
              <div className="col">
                <div className="col-title">Meilleures maitrises</div>
                {p.topMasteries.length === 0 ? (
                  <div className="empty">Pas de donnees de maitrise.</div>
                ) : (
                  <ul className="mini-list">
                    {p.topMasteries.slice(0, rows).map((m, i) => (
                      <li key={i}>
                        <ChampIcon version={version} image={m.image} name={m.name} className="detail-icon" />
                        <span className="mini-name">{m.name}</span>
                        <span className="mini-level">Niv. {m.level}</span>
                        <span className="mini-stat mono">
                          {Math.round(m.points / 1000)}k pts
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
          );
        })}
      </section>

      {/* -------------------- Champions flex -------------------- */}
      <section className="section">
        <h2>
          Champions flex
          <span className="hint">joues par plusieurs joueurs, dans au moins 2 roles differents</span>
        </h2>
        {data.flex.length === 0 ? (
          <div className="notice">Aucun champion joue par 2 joueurs ou plus dans 2 roles differents.</div>
        ) : (
          <div className="grid flex">
            {data.flex.map((f) => (
              <div className="card flex-card" key={f.championId}>
                <div className="champ-row">
                  <ChampIcon version={version} image={f.image} name={f.name} className="champ-img" />
                  <div>
                    <strong>{f.name}</strong>
                    {f.roles?.length > 0 && (
                      <span className="flex-roles">{f.roles.map(roleLabel).join(" · ")}</span>
                    )}
                  </div>
                </div>
                <div className="players">
                  {f.players.map((p) => (
                    <span key={p.name}>
                      {p.name}
                      {p.role && <b className="flex-prole"> {roleLabel(p.role)}</b>} · {p.games} parties · {pct(p.winrate)} WR
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* -------------------- Bans recommandes -------------------- */}
      <section className="section">
        <h2>
          Bans recommandes
          <span className="hint">score de danger (survolez le score pour le detail du calcul)</span>
        </h2>
        <div className="ban-filters">
          <button
            className={`role-tag${!banRole ? " active" : ""}`}
            onClick={() => setBanRole(null)}
          >
            Tous
          </button>
          {banRoleList.map((r) => (
            <button
              key={r}
              className={`role-tag${banRole === r ? " active" : ""}`}
              onClick={() => setBanRole(banRole === r ? null : r)}
            >
              {roleLabel(r)}
            </button>
          ))}
        </div>
        <div className="grid bans">
          {filteredBans.slice(0, 12).map((b) => (
            <div className="card ban" key={b.championId}>
              <BanScore b={b} />
              <div className="body">
                <div className="champ-row">
                  <ChampIcon version={version} image={b.image} name={b.name} className="detail-icon" />
                  <div>
                    <div className="name">
                      {b.name}
                      {b.meta && b.meta.tier <= 3 && (
                        <span className={`meta-badge tier${b.meta.tier}`}>
                          {b.meta.tierLabel} {pct(b.meta.winRate)}
                          <span className="meta-tip">
                            <span className="mt-row"><span>Tier</span><b>{b.meta.tierLabel}</b></span>
                            <span className="mt-row"><span>Winrate</span><b>{pct1(b.meta.winRate)}</b></span>
                            <span className="mt-row"><span>Pickrate</span><b>{pct1(b.meta.pickRate)}</b></span>
                            <span className="mt-row"><span>Banrate</span><b>{pct1(b.meta.banRate)}</b></span>
                          </span>
                        </span>
                      )}
                    </div>
                    <div className="who">
                      {b.bestPlayer} · {b.games} parties · {pct(b.winrate)} WR ·{" "}
                      {b.kdaAvg ? (
                        <span className="kda-hint">
                          KDA {b.kda}
                          <span className="kda-tip">
                            {b.kdaAvg.kills} / {b.kdaAvg.deaths} / {b.kdaAvg.assists}
                          </span>
                        </span>
                      ) : (
                        `KDA ${b.kda}`
                      )}
                    </div>
                  </div>
                </div>
                <ul className="reasons">
                  {b.reasons.map((r, i) => {
                    const isFlex = r.includes("flex") && b.meta?.flexRoles?.length >= 2;
                    return (
                      <li
                        key={i}
                        className={isFlex ? "reason-flex" : undefined}
                        title={isFlex ? b.meta.flexRoles.map(metaRoleLabel).join(" · ") : undefined}
                      >
                        {r}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
