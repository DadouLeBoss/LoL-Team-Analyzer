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
  { key: "EUW", label: "Europe de l'Ouest (EUW)", platform: "euw1", regional: "europe" },
  { key: "EUNE", label: "Europe Nord & Est (EUNE)", platform: "eun1", regional: "europe" },
  { key: "NA", label: "Amerique du Nord (NA)", platform: "na1", regional: "americas" },
  { key: "KR", label: "Coree (KR)", platform: "kr", regional: "asia" },
  { key: "BR", label: "Bresil (BR)", platform: "br1", regional: "americas" },
  { key: "LAN", label: "Latine Nord (LAN)", platform: "la1", regional: "americas" },
  { key: "LAS", label: "Latine Sud (LAS)", platform: "la2", regional: "americas" },
  { key: "OCE", label: "Oceanie (OCE)", platform: "oc1", regional: "sea" },
  { key: "TR", label: "Turquie (TR)", platform: "tr1", regional: "europe" },
  { key: "JP", label: "Japon (JP)", platform: "jp1", regional: "asia" },
];

function champImg(version, image) {
  if (!image) return null;
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${image}`;
}

function pct(x) {
  return `${Math.round(x * 100)}%`;
}

function scoreColor(score) {
  if (score >= 60) return "#e05265";
  if (score >= 40) return "#e0a052";
  return "#c8aa6e";
}

export default function Home() {
  const [accounts, setAccounts] = useState(DEFAULT_ACCOUNTS);
  const [regionKey, setRegionKey] = useState("EUW");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

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

  // -------------------- Vue formulaire --------------------
  if (!data) {
    return (
      <div className="wrap">
        <header className="top">
          <h1>
            LoL <span className="accent">Team Analyzer</span>
          </h1>
        </header>
        <p className="sub">
          Renseigne jusqu'a 5 comptes (format Pseudo#TAG) et lance l'analyse des 20 dernieres parties.
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

        {loading && <div className="loading">Recuperation des donnees Riot...</div>}
      </div>
    );
  }

  // -------------------- Vue resultats --------------------
  return (
    <div className="wrap">
      <header className="top">
        <h1>
          LoL <span className="accent">Team Analyzer</span>
        </h1>
        <button className="refresh ghost" onClick={() => setData(null)}>
          Nouvelle analyse
        </button>
      </header>
      <p className="sub">
        {data.players.length} joueurs analyses sur leurs 20 dernieres parties · {data.matchesDownloaded} parties uniques · patch {version}
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
        {data.players.map((p) => (
          <div className="card player" key={p.puuid}>
            <h3>
              {p.name}
              <span className="tag">{p.riotId}</span>
              <span className="count">{p.totalGames} parties analysees</span>
            </h3>

            <div className="player-cols">
              {/* Parties recentes */}
              <div className="col">
                <div className="col-title">Parties recentes</div>
                {p.recentMatches.length === 0 ? (
                  <div className="empty">Aucune partie recente.</div>
                ) : (
                  <ul className="mini-list">
                    {p.recentMatches.map((m, i) => (
                      <li key={i}>
                        {champImg(version, m.image) && (
                          <img className="champ-img sm" src={champImg(version, m.image)} alt={m.name} />
                        )}
                        <span className="mini-name">{m.name}</span>
                        <span className={`result ${m.win ? "win" : "loss"}`}>
                          {m.win ? "V" : "D"}
                        </span>
                        <span className="mini-stat mono">
                          {m.kills}/{m.deaths}/{m.assists}
                        </span>
                        <span className="mini-role">{m.role}</span>
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
                    {p.topMasteries.map((m, i) => (
                      <li key={i}>
                        {champImg(version, m.image) && (
                          <img className="champ-img sm" src={champImg(version, m.image)} alt={m.name} />
                        )}
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
        ))}
      </section>

      {/* -------------------- Champions flex -------------------- */}
      <section className="section">
        <h2>
          Champions flex
          <span className="hint">jouables par plusieurs joueurs de l'equipe</span>
        </h2>
        {data.flex.length === 0 ? (
          <div className="notice">Aucun champion joue par 2 joueurs ou plus sur les parties recentes.</div>
        ) : (
          <div className="grid flex">
            {data.flex.map((f) => (
              <div className="card flex-card" key={f.championId}>
                <div className="champ-row">
                  {champImg(version, f.image) && (
                    <img className="champ-img" src={champImg(version, f.image)} alt={f.name} />
                  )}
                  <div>
                    <strong>{f.name}</strong>
                    <span className="badge">{f.players.length} joueurs</span>
                  </div>
                </div>
                <div className="players">
                  {f.players.map((p) => (
                    <span key={p.name}>
                      {p.name} · {p.games} parties · {pct(p.winrate)} WR
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
          <span className="hint">score de danger : winrate, KDA, volume et flexibilite</span>
        </h2>
        <div className="grid bans">
          {data.bans.slice(0, 12).map((b) => (
            <div className="card ban" key={b.championId}>
              <div className="score" style={{ background: scoreColor(b.score) }}>
                {b.score}
              </div>
              <div className="body">
                <div className="champ-row">
                  {champImg(version, b.image) && (
                    <img className="champ-img sm" src={champImg(version, b.image)} alt={b.name} />
                  )}
                  <div>
                    <div className="name">{b.name}</div>
                    <div className="who">
                      {b.bestPlayer} · {b.games} parties · {pct(b.winrate)} WR · KDA {b.kda}
                    </div>
                  </div>
                </div>
                <ul className="reasons">
                  {b.reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
