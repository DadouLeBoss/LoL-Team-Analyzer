"use client";

import { useState, useEffect } from "react";
import { DEFAULT_SETTINGS, SETTINGS_SCHEMA } from "../lib/settings.js";

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

// Analyse un lien op.gg multisearch et en extrait les pseudos + la region.
// Ex : https://op.gg/fr/lol/multisearch/euw?summoners=Zhynkaaa%23KCwin%2C+League+of+Pigs%23PIGS...
// URLSearchParams gere le decodage (+ -> espace, %23 -> #, %2C -> ,).
function parseMultiGG(link) {
  try {
    const url = new URL(link.trim());
    const summoners = url.searchParams.get("summoners");
    if (!summoners) return null;
    const names = summoners.split(",").map((s) => s.trim()).filter(Boolean);
    if (names.length === 0) return null;
    const m = url.pathname.match(/multisearch\/([a-z]+)/i);
    return { names, regionPart: m ? m[1].toLowerCase() : null };
  } catch {
    return null;
  }
}

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

// Duree en ms -> "m:ss" (ou "h:mm:ss" au-dela d'une heure).
function fmtDuration(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

function scoreColor(score) {
  if (score >= 60) return "#e05265";
  if (score >= 40) return "#e0a052";
  return "#c8aa6e";
}

function num2(x) {
  return (Math.round((x || 0) * 100) / 100).toFixed(2);
}

// Points de maitrise : "1.23M" au-dela du million, sinon "450k".
function fmtPoints(pts) {
  return pts >= 1000000 ? (pts / 1000000).toFixed(2) + "M" : Math.round(pts / 1000) + "k";
}

// Pastille de score de ban avec tooltip detaillant le calcul au survol.
function BanScore({ b }) {
  const d = b.breakdown;
  const w = d?.weights || { wVolume: 0.4, wRecent: 0.2, wWin: 0.3, wKda: 0.1 };
  const mastery = d?.mastery || 0;
  return (
    <div className="score-wrap">
      <div className="score" style={{ background: scoreColor(b.score) }}>
        {b.score}
      </div>
      {d && (
        <div className="score-tip">
          <div className="tip-title">Detail du score</div>
          <div className="tip-line">
            Force = confiance x (volume + recent + WR + KDA{mastery > 0 ? " + maitrise" : ""})
          </div>
          <div className="tip-line mono">
            = {num2(d.confidence)} x ({num2(w.wVolume)}·{num2(d.volume)} + {num2(w.wRecent)}·
            {num2(d.recent)} + {num2(w.wWin)}·{num2(d.winrate)} + {num2(w.wKda)}·{num2(d.kda)}
            {mastery > 0 ? ` + ${num2(mastery)}` : ""}) = {num2(d.force)}
          </div>
          <div className="tip-line mono">
            Score = force x flex-jeu(x{num2(d.gameFlexFactor)}, {d.roleCount} role
            {d.roleCount > 1 ? "s" : ""}) x meta(x{num2(d.metaFactor)})
            {d.skillFactor > 1 ? ` x niveau(x${num2(d.skillFactor)})` : ""} = {b.score}/100
          </div>
        </div>
      )}
    </div>
  );
}

// Icone d'engrenage (pas d'emoji : SVG inline).
function GearIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

// Panneau de reglages : edite un brouillon local, applique a la demande.
function SettingsPanel({ initial, onApply, onClose, applying }) {
  const [draft, setDraft] = useState(initial);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Parametres</h3>
          <button className="modal-close" onClick={onClose} aria-label="Fermer">
            &times;
          </button>
        </div>
        <div className="modal-body">
          {SETTINGS_SCHEMA.map((group) => (
            <div className="settings-group" key={group.title}>
              <div className="settings-group-title">{group.title}</div>
              {group.hint && <div className="settings-group-hint">{group.hint}</div>}
              <div className="settings-grid">
                {group.fields.map((f) => (
                  <label className="settings-field" key={f.key}>
                    <span>{f.label}</span>
                    <input
                      type="number"
                      step={f.step}
                      min={f.min}
                      max={f.max}
                      value={draft[f.key]}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          [f.key]: e.target.value === "" ? "" : Number(e.target.value),
                        }))
                      }
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}
          <div className="settings-note">
            Les reglages sont enregistres dans ce navigateur. "Appliquer" recalcule l'analyse
            (instantane, sans re-telecharger les parties).
          </div>
        </div>
        <div className="modal-foot">
          <button className="ghost-btn" onClick={() => setDraft(DEFAULT_SETTINGS)}>
            Reinitialiser
          </button>
          <button className="apply-btn" onClick={() => onApply(draft)} disabled={applying}>
            {applying ? "Application..." : "Appliquer"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [accounts, setAccounts] = useState(DEFAULT_ACCOUNTS);
  const [multiLink, setMultiLink] = useState("");
  const [regionKey, setRegionKey] = useState("EUW");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState({}); // puuid -> affiche 12 lignes
  const [comp, setComp] = useState({}); // puuid -> role assigne (composition d'equipe)
  const [roleMenu, setRoleMenu] = useState(null); // puuid dont le menu "+ role" est ouvert
  const [banRole, setBanRole] = useState(null); // role filtre pour la section bans
  const [progress, setProgress] = useState(null); // suivi d'avancement pendant l'analyse
  const [now, setNow] = useState(0); // horloge qui tourne pour afficher le temps ecoule
  const [settings, setSettings] = useState(DEFAULT_SETTINGS); // reglages du calcul
  const [showSettings, setShowSettings] = useState(false);
  const [applying, setApplying] = useState(false); // recalcul en cours apres changement de reglages
  const [lastRun, setLastRun] = useState(null); // { riotIds, errors, region } pour recalculer

  // Tic d'horloge chaque seconde pendant le chargement (pour temps ecoule / ETA).
  useEffect(() => {
    if (!loading) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [loading]);

  // Charge les reglages sauvegardes dans ce navigateur (au montage).
  useEffect(() => {
    try {
      const saved = localStorage.getItem("lol-settings");
      if (saved) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(saved) });
    } catch {}
  }, []);

  // Nettoie un brouillon de reglages : force des nombres valides, defaut sinon.
  function cleanSettings(raw) {
    const out = {};
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      const v = Number(raw[key]);
      out[key] = Number.isFinite(v) ? v : DEFAULT_SETTINGS[key];
    }
    return out;
  }

  // Applique de nouveaux reglages : sauvegarde + recalcule l'analyse depuis le
  // cache (aucun re-telechargement), si une analyse a deja tourne.
  async function applySettings(rawDraft) {
    const clean = cleanSettings(rawDraft);
    setSettings(clean);
    try {
      localStorage.setItem("lol-settings", JSON.stringify(clean));
    } catch {}
    if (!lastRun) {
      setShowSettings(false);
      return;
    }
    setApplying(true);
    setError(null);
    try {
      const analysis = await postJson("/api/finalize", { ...lastRun, settings: clean });
      setData(analysis);
      setShowSettings(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setApplying(false);
    }
  }

  function toggleExpanded(puuid) {
    setExpanded((prev) => ({ ...prev, [puuid]: !prev[puuid] }));
  }

  // Assigne un role a un joueur pour la composition. Exclusif : un role donne
  // ne peut etre tenu que par un seul joueur (on le retire des autres). Recliquer
  // le meme role le desassigne.
  function assignRole(puuid, role) {
    setComp((prev) => {
      const next = { ...prev };
      if (next[puuid] === role) {
        delete next[puuid];
        return next;
      }
      for (const k of Object.keys(next)) if (next[k] === role) delete next[k];
      next[puuid] = role;
      return next;
    });
    setRoleMenu(null);
  }

  function setAccount(i, value) {
    setAccounts((prev) => prev.map((a, idx) => (idx === i ? value : a)));
  }

  // Convertit le lien MultiGG en remplissant les champs joueurs et la region.
  // Les champs restent editables ensuite pour ajuster un joueur en particulier.
  function applyMultiLink() {
    const parsed = parseMultiGG(multiLink);
    if (!parsed) {
      setError("Lien MultiGG invalide (attendu un lien op.gg multisearch).");
      return;
    }
    setError(null);
    const filled = parsed.names.slice(0, 5);
    while (filled.length < 5) filled.push("");
    setAccounts(filled);
    if (parsed.regionPart) {
      const reg = REGIONS.find((r) => r.log === parsed.regionPart);
      if (reg) setRegionKey(reg.key);
    }
  }

  // POST JSON robuste : lit en texte puis tente de parser, pour transformer une
  // page d'erreur serverless (timeout) en message clair plutot qu'un crash JSON.
  async function postJson(url, body) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const raw = await res.text();
    let json;
    try {
      json = JSON.parse(raw);
    } catch {
      if (res.status === 504 || /timeout|time-?out|FUNCTION_INVOCATION_TIMEOUT/i.test(raw)) {
        throw new Error("Une etape a depasse la limite de temps de l'hebergement. Reessaie : le cache reprend la ou ca s'est arrete.");
      }
      throw new Error("Reponse inattendue du serveur (" + res.status + ").");
    }
    if (!res.ok) throw new Error(json.error || "Erreur inconnue");
    return json;
  }

  // Taille d'un lot de telechargement et plafond de parties reellement
  // recuperees chez Riot par fenetre de 2 min (marge sous la limite 100/120s).
  const BATCH = 25;
  const MAX_FETCH_PER_WINDOW = 90;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function run() {
    const players = accounts.map((a) => a.trim()).filter(Boolean);
    if (players.length === 0) {
      setError("Renseigne au moins un compte.");
      return;
    }
    const reg = REGIONS.find((r) => r.key === regionKey);
    const region = { platform: reg.platform, regional: reg.regional };
    const startedAt = Date.now();
    setLoading(true);
    setError(null);
    setProgress({ phase: "prepare", prepDone: 0, prepTotal: players.length, dl: 0, dlTotal: 0, startedAt });

    try {
      // --- Phase 1 : preparation joueur par joueur ---
      const okIds = [];
      const errors = [];
      const allIds = new Set();
      for (let i = 0; i < players.length; i++) {
        const p = await postJson("/api/prepare", { riotId: players[i], region });
        if (p.error) errors.push({ riotId: p.riotId, error: p.error });
        else {
          okIds.push(p.riotId);
          (p.matchIds || []).forEach((id) => allIds.add(id));
        }
        setProgress((prev) => ({ ...prev, prepDone: i + 1 }));
      }

      if (okIds.length === 0) {
        throw new Error(
          "Aucun compte valide. " + errors.map((e) => `${e.riotId} (${e.error})`).join(", ")
        );
      }

      // --- Phase 2 : telechargement des parties par lots, cadence sous la limite ---
      const ids = [...allIds];
      const dlTotal = ids.length;
      let dl = 0;
      const fetchLog = []; // { t, n } des parties reellement recuperees chez Riot
      setProgress((prev) => ({ ...prev, phase: "download", dl: 0, dlTotal }));

      for (let i = 0; i < ids.length; i += BATCH) {
        // Cadence : ne pas depasser MAX_FETCH_PER_WINDOW parties recuperees / 2 min.
        for (;;) {
          const cutoff = Date.now() - 120000;
          while (fetchLog.length && fetchLog[0].t < cutoff) fetchLog.shift();
          const windowSum = fetchLog.reduce((s, e) => s + e.n, 0);
          if (windowSum + BATCH <= MAX_FETCH_PER_WINDOW) break;
          await sleep(2000);
        }
        const slice = ids.slice(i, i + BATCH);
        const r = await postJson("/api/matches", { ids: slice, region });
        if (r.fetched > 0) fetchLog.push({ t: Date.now(), n: r.fetched });
        dl += r.done;
        setProgress((prev) => ({ ...prev, dl }));
      }

      // --- Phase 3 : analyse (tout est en cache, aucun appel Riot) ---
      setProgress((prev) => ({ ...prev, phase: "finalize" }));
      setLastRun({ riotIds: okIds, errors, region });
      const analysis = await postJson("/api/finalize", { riotIds: okIds, errors, region, settings });
      setData(analysis);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setProgress(null);
    }
  }

  const version = data?.ddragonVersion;
  const logRegion = REGIONS.find((r) => r.key === regionKey)?.log || "euw";

  // Composition : role assigne par NOM de joueur (flex/bans referencent le nom)
  // et role -> joueur qui le tient (pour l'exclusivite / griser les roles pris).
  const assignedRoleByName = {};
  const roleTakenBy = {}; // role -> puuid
  if (data?.players) {
    for (const p of data.players) {
      const r = comp[p.puuid];
      if (r) {
        assignedRoleByName[p.name] = r;
        roleTakenBy[r] = p.puuid;
      }
    }
  }

  // Un ban reste visible si son meilleur joueur n'a pas de role assigne, ou si le
  // role assigne correspond au role ou il joue ce champion.
  function banVisible(b) {
    const ar = assignedRoleByName[b.bestPlayer];
    return ar === undefined || ar === b.role;
  }
  // Un flex ne garde que les joueurs jouant le champion dans leur role assigne
  // (ou non assignes) ; il disparait s'il ne reste pas 2 joueurs sur 2 roles.
  function filterFlex(f) {
    const players = f.players.filter((p) => {
      const ar = assignedRoleByName[p.name];
      return ar === undefined || ar === p.role;
    });
    const roles = [...new Set(players.map((p) => p.role).filter(Boolean))];
    if (players.length >= 2 && roles.length >= 2) return { ...f, players, roles };
    return null;
  }

  const compBans = data?.bans ? data.bans.filter(banVisible) : [];
  const banRoleList = ROLE_ORDER_LIST.filter((r) => compBans.some((b) => b.role === r));
  const filteredBans = banRole ? compBans.filter((b) => b.role === banRole) : compBans;
  const filteredFlex = data?.flex ? data.flex.map(filterFlex).filter(Boolean) : [];

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
          <div className="field multigg">
            <label>MultiGG</label>
            <div className="multigg-row">
              <input
                type="text"
                value={multiLink}
                placeholder="Colle un lien op.gg multisearch"
                onChange={(e) => setMultiLink(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && applyMultiLink()}
              />
              <button type="button" className="multigg-btn" onClick={applyMultiLink}>
                Convertir
              </button>
            </div>
          </div>
          <div className="multigg-sep">puis ajuste les comptes si besoin</div>

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

        {loading && progress && (
          <div className="loading">
            {progress.phase === "prepare" && (
              <>
                <div className="prog-label">
                  Preparation des joueurs... {progress.prepDone}/{progress.prepTotal}
                </div>
                <div className="prog-bar">
                  <div
                    className="prog-fill"
                    style={{ width: `${(progress.prepTotal ? progress.prepDone / progress.prepTotal : 0) * 100}%` }}
                  />
                </div>
                <div className="prog-sub">Recuperation de la liste des parties de chaque compte</div>
              </>
            )}

            {progress.phase === "download" &&
              (() => {
                const elapsed = (now || Date.now()) - progress.startedAt;
                const p = progress.dlTotal ? progress.dl / progress.dlTotal : 0;
                const eta = progress.dl > 0 ? (elapsed / progress.dl) * (progress.dlTotal - progress.dl) : null;
                return (
                  <>
                    <div className="prog-label">
                      Telechargement des parties... {progress.dl}/{progress.dlTotal} ({Math.round(p * 100)}%)
                    </div>
                    <div className="prog-bar">
                      <div className="prog-fill" style={{ width: `${p * 100}%` }} />
                    </div>
                    <div className="prog-sub">
                      Temps ecoule {fmtDuration(elapsed)}
                      {eta != null ? ` · restant ~${fmtDuration(eta)}` : ""}
                    </div>
                  </>
                );
              })()}

            {progress.phase === "finalize" && (
              <>
                <div className="prog-label">Calcul de l'analyse...</div>
                <div className="prog-bar">
                  <div className="prog-fill indet" />
                </div>
              </>
            )}

            <div className="prog-note">
              Le premier chargement d'une saison peut etre long (limite Riot de 100 requetes / 2 min). Tu peux
              laisser l'onglet ouvert ; si tu relances, le cache reprend la ou ca s'etait arrete.
            </div>
          </div>
        )}
      </div>
    );
  }

  // -------------------- Vue resultats --------------------
  return (
    <div className="wrap">
      {showSettings && (
        <SettingsPanel
          initial={settings}
          onApply={applySettings}
          onClose={() => setShowSettings(false)}
          applying={applying}
        />
      )}
      <header className="top">
        <div className="brand">
          <img
            className="logo clickable"
            src="/logo.png"
            alt="Accueil"
            title="Retour a l'accueil"
            onClick={() => setData(null)}
          />
          <h1>
            LoL <span className="accent">Team Analyzer</span>
          </h1>
        </div>
        <div className="top-actions">
          <button className="icon-btn" onClick={() => setShowSettings(true)} title="Parametres">
            <GearIcon />
            <span>Parametres</span>
          </button>
          <button className="refresh ghost" onClick={() => setData(null)}>
            Nouvelle analyse
          </button>
        </div>
      </header>
      <p className="sub">
        {data.players.length} joueurs analyses sur leurs parties classees de la saison · {data.matchesDownloaded} parties uniques · patch {version}
        {data.metaPatch && ` · meta OP.GG ${data.metaPatch}`}
      </p>

      {data.teamElo && (
        <div className="team-elo">
          <span className="te-label">Niveau moyen de l'equipe</span>
          <span className={`rank tier-${data.teamElo.tier}`}>
            {fmtTier(data.teamElo.tier)}
            {data.teamElo.division ? ` ${data.teamElo.division}` : ""} · {data.teamElo.lp} LP
          </span>
        </div>
      )}

      {error && <div className="notice error">{error}</div>}

      {data.errors?.length > 0 && (
        <div className="notice error" style={{ marginTop: 16 }}>
          Comptes en erreur : {data.errors.map((e) => `${e.riotId} (${e.error})`).join(", ")}
        </div>
      )}

      {Object.keys(comp).length > 0 && (
        <div className="comp-bar">
          <span className="comp-label">Composition</span>
          {ROLE_ORDER_LIST.map((role) => {
            const owner = roleTakenBy[role];
            const name = owner ? data.players.find((x) => x.puuid === owner)?.name : null;
            return (
              <span key={role} className={`comp-slot${name ? " set" : ""}`}>
                <b>{roleLabel(role)}</b> {name || "-"}
              </span>
            );
          })}
          <button className="comp-reset" onClick={() => setComp({})}>
            Reinitialiser
          </button>
        </div>
      )}

      {/* -------------------- Detail par joueur -------------------- */}
      <section className="section">
        <h2>Detail par joueur</h2>
        {data.players.map((p) => {
          const rows = expanded[p.puuid] ? 12 : 6;
          const activeRole = comp[p.puuid];
          const roleData = activeRole ? p.byRole?.[activeRole] : null;
          // Role assigne hors pool (aucune partie) -> colonnes vides.
          const champs = activeRole ? roleData?.champions || [] : p.champions;
          const recents = activeRole ? roleData?.recentMatches || [] : p.recentMatches;
          const playedRoles = p.roles.filter((r) => r.pct >= 0.1);
          const playedSet = new Set(playedRoles.map((r) => r.role));
          const assignedOffRole = activeRole && !playedSet.has(activeRole);
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

            <div className="player-roles">
              {playedRoles.map((r) => {
                const owner = roleTakenBy[r.role];
                const takenByOther = owner && owner !== p.puuid;
                return (
                  <button
                    className={`role-tag${activeRole === r.role ? " active" : ""}${takenByOther ? " taken" : ""}`}
                    onClick={() => assignRole(p.puuid, r.role)}
                    disabled={takenByOther}
                    title={
                      takenByOther
                        ? `${roleLabel(r.role)} deja pris par ${data.players.find((x) => x.puuid === owner)?.name}`
                        : `Assigner ${roleLabel(r.role)} a ${p.name}`
                    }
                    key={r.role}
                  >
                    {roleLabel(r.role)} {pct(r.pct)}
                  </button>
                );
              })}

              {/* Role assigne hors du pool habituel du joueur */}
              {assignedOffRole && (
                <button
                  className="role-tag active off"
                  onClick={() => assignRole(p.puuid, activeRole)}
                  title={`${roleLabel(activeRole)} (hors pool) assigne a ${p.name}`}
                >
                  {roleLabel(activeRole)} <span className="off-tag">hors pool</span>
                </button>
              )}

              {/* Menu pour assigner un role hors du pool */}
              <div className="role-add">
                <button
                  className="role-more"
                  onClick={() => setRoleMenu(roleMenu === p.puuid ? null : p.puuid)}
                  title="Assigner un autre role"
                >
                  &#8942;
                </button>
                {roleMenu === p.puuid && (
                  <div className="role-menu">
                    {ROLE_ORDER_LIST.map((role) => {
                      const owner = roleTakenBy[role];
                      const takenByOther = owner && owner !== p.puuid;
                      return (
                        <button
                          key={role}
                          className={`role-menu-item${activeRole === role ? " active" : ""}`}
                          onClick={() => assignRole(p.puuid, role)}
                          disabled={takenByOther}
                        >
                          {roleLabel(role)}
                          {!playedSet.has(role) && <span className="mi-off">hors pool</span>}
                          {takenByOther && (
                            <span className="mi-off">pris ({data.players.find((x) => x.puuid === owner)?.name})</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

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
                          {fmtPoints(m.points)} pts
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
        {filteredFlex.length === 0 ? (
          <div className="notice">
            {data.flex.length > 0
              ? "Aucun flex ne correspond a la composition selectionnee."
              : "Aucun champion joue par 2 joueurs ou plus dans 2 roles differents."}
          </div>
        ) : (
          <div className="grid flex">
            {filteredFlex.map((f) => (
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
        {filteredBans.length === 0 && (
          <div className="notice">Aucun ban ne correspond a la composition selectionnee.</div>
        )}
        <div className="grid bans">
          {filteredBans.slice(0, 12).map((b) => (
            <div className="card ban" key={b.championId}>
              <div className="ban-top">
                <BanScore b={b} />
                <ChampIcon version={version} image={b.image} name={b.name} className="detail-icon" />
                <div className="ban-info">
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
          ))}
        </div>
      </section>
    </div>
  );
}
