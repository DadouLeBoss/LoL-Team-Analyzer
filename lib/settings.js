// Reglages du calcul de la force d'un champion et du score de ban. Valeurs par
// defaut = comportement de reference. Le client peut les surcharger (panneau
// Parametres) ; elles sont transmises a /api/finalize et appliquees par
// analyzeTeam. Module partage client + serveur pour une source unique.

export const DEFAULT_SETTINGS = {
  // --- Force d'un champion : force = confiance * (wActivity*activite +
  //     wWin*winrate_lisse + wKda*kda + maitrise) ---
  wActivity: 0.6, // poids de l'activite (parties, ponderees par la recence)
  wWin: 0.3, // poids du winrate (lisse)
  wKda: 0.1, // poids du KDA (normalise : KDA 5 = max)
  halfLifeDays: 100, // demi-vie de la ponderation temporelle : une partie de N
  //                    jours pese moitie moins qu'une partie d'aujourd'hui
  winSmoothingK: 5, // lissage bayesien du winrate : nb de parties fictives a 50%
  masteryThreshold: 300000, // points de maitrise a partir desquels s'applique le bonus
  masteryBoost: 0.05, // composante ajoutee a la force si maitrise >= seuil
  confGames: 5, // nb de parties pour une confiance maximale (min(games/N, 1))

  // --- Score de ban : score = (force - repli) * flex-jeu * meta * niveau * prep ---
  banDropoff: 1, // part du 2e meilleur champion du joueur (meme role) retranchee
  //                a la force : un pool profond = ban moins utile (0 = ignore)
  prepBoost: 1.15, // multiplicateur si le champion est "en preparation"
  prepMinGames: 3, // parties recentes minimum pour marquer "en preparation"
  prepWindowDays: 14, // fenetre "recente" pour la preparation (jours)
  metaOP: 1.15, // multiplicateur meta tier OP
  metaFort: 1.1, // multiplicateur meta tier Fort
  metaBon: 1.05, // multiplicateur meta tier Bon
  metaMoyen: 1.0, // multiplicateur meta tier Moyen
  metaFaible: 0.9, // multiplicateur meta tier Faible
  flexStep: 0.1, // bonus par role jouable en jeu au-dela du 1er
  skillStep: 0.1, // bonus par cran de division (~100 elo) au-dessus de la moyenne
};

// Descripteurs pour construire le panneau de reglages (groupes + champs).
export const SETTINGS_SCHEMA = [
  {
    title: "Force d'un champion",
    hint: "force = confiance x (activite + winrate + KDA + maitrise)",
    fields: [
      { key: "wActivity", label: "Poids activite", step: 0.05, min: 0, max: 1 },
      { key: "wWin", label: "Poids winrate", step: 0.05, min: 0, max: 1 },
      { key: "wKda", label: "Poids KDA", step: 0.05, min: 0, max: 1 },
      { key: "halfLifeDays", label: "Demi-vie recence (jours)", step: 5, min: 5, max: 365 },
      { key: "winSmoothingK", label: "Lissage winrate (k)", step: 1, min: 0, max: 50 },
      { key: "masteryThreshold", label: "Seuil maitrise (points)", step: 50000, min: 0, max: 2000000 },
      { key: "masteryBoost", label: "Bonus maitrise", step: 0.01, min: 0, max: 0.5 },
      { key: "confGames", label: "Parties pour confiance max", step: 1, min: 1, max: 50 },
    ],
  },
  {
    title: "Score de ban",
    hint: "score = (force - repli) x flex-jeu x meta x niveau x prep",
    fields: [
      { key: "banDropoff", label: "Repli 2e choix (meme role)", step: 0.1, min: 0, max: 1 },
      { key: "prepBoost", label: "Bonus preparation", step: 0.05, min: 1, max: 2 },
      { key: "prepMinGames", label: "Parties recentes mini (prep)", step: 1, min: 1, max: 20 },
      { key: "prepWindowDays", label: "Fenetre preparation (jours)", step: 1, min: 3, max: 60 },
      { key: "metaOP", label: "Multiplicateur meta OP", step: 0.05, min: 0.5, max: 2 },
      { key: "metaFort", label: "Multiplicateur meta Fort", step: 0.05, min: 0.5, max: 2 },
      { key: "metaBon", label: "Multiplicateur meta Bon", step: 0.05, min: 0.5, max: 2 },
      { key: "metaMoyen", label: "Multiplicateur meta Moyen", step: 0.05, min: 0.5, max: 2 },
      { key: "metaFaible", label: "Multiplicateur meta Faible", step: 0.05, min: 0.5, max: 2 },
      { key: "flexStep", label: "Bonus par role en jeu", step: 0.05, min: 0, max: 1 },
      { key: "skillStep", label: "Bonus niveau par division", step: 0.05, min: 0, max: 1 },
    ],
  },
];
