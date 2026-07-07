// Reglages du calcul de la force d'un champion et du score de ban. Valeurs par
// defaut = comportement de reference. Le client peut les surcharger (panneau
// Parametres) ; elles sont transmises a /api/finalize et appliquees par
// analyzeTeam. Module partage client + serveur pour une source unique.

export const DEFAULT_SETTINGS = {
  // --- Force d'un champion : force = confiance * (wVolume*volume +
  //     wRecent*recent + wWin*winrate + wKda*kda) ---
  wVolume: 0.4, // poids du volume global (part des parties sur la saison)
  wRecent: 0.2, // poids du volume recent (fenetre ci-dessous)
  wWin: 0.3, // poids du winrate
  wKda: 0.1, // poids du KDA (normalise : KDA 5 = max)
  confGames: 5, // nb de parties pour une confiance maximale (min(games/N, 1))
  recentWindow: 40, // taille de la fenetre "recent" (nb de parties)

  // --- Score de ban : score = force * flex-jeu * meta * niveau + bonusMaitrise ---
  metaOP: 1.15, // multiplicateur meta tier OP
  metaFort: 1.1, // multiplicateur meta tier Fort
  metaBon: 1.05, // multiplicateur meta tier Bon
  metaMoyen: 1.0, // multiplicateur meta tier Moyen
  metaFaible: 0.9, // multiplicateur meta tier Faible
  flexStep: 0.1, // bonus par role jouable en jeu au-dela du 1er
  skillStep: 0.1, // bonus par cran de division (~100 elo) au-dessus de la moyenne
  masteryThreshold: 300000, // points de maitrise a partir desquels s'applique le bonus
  masteryBoost: 0.05, // bonus ajoute (avant x100) si maitrise >= seuil
};

// Descripteurs pour construire le panneau de reglages (groupes + champs).
export const SETTINGS_SCHEMA = [
  {
    title: "Force d'un champion",
    hint: "force = confiance x (volume + recent + winrate + KDA)",
    fields: [
      { key: "wVolume", label: "Poids volume global", step: 0.05, min: 0, max: 1 },
      { key: "wRecent", label: "Poids volume recent", step: 0.05, min: 0, max: 1 },
      { key: "wWin", label: "Poids winrate", step: 0.05, min: 0, max: 1 },
      { key: "wKda", label: "Poids KDA", step: 0.05, min: 0, max: 1 },
      { key: "confGames", label: "Parties pour confiance max", step: 1, min: 1, max: 50 },
      { key: "recentWindow", label: "Fenetre recent (parties)", step: 5, min: 5, max: 200 },
    ],
  },
  {
    title: "Score de ban",
    hint: "score = force x flex-jeu x meta x niveau + maitrise",
    fields: [
      { key: "metaOP", label: "Multiplicateur meta OP", step: 0.05, min: 0.5, max: 2 },
      { key: "metaFort", label: "Multiplicateur meta Fort", step: 0.05, min: 0.5, max: 2 },
      { key: "metaBon", label: "Multiplicateur meta Bon", step: 0.05, min: 0.5, max: 2 },
      { key: "metaMoyen", label: "Multiplicateur meta Moyen", step: 0.05, min: 0.5, max: 2 },
      { key: "metaFaible", label: "Multiplicateur meta Faible", step: 0.05, min: 0.5, max: 2 },
      { key: "flexStep", label: "Bonus par role en jeu", step: 0.05, min: 0, max: 1 },
      { key: "skillStep", label: "Bonus niveau par division", step: 0.05, min: 0, max: 1 },
      { key: "masteryThreshold", label: "Seuil maitrise (points)", step: 50000, min: 0, max: 2000000 },
      { key: "masteryBoost", label: "Bonus maitrise", step: 0.01, min: 0, max: 0.5 },
    ],
  },
];
