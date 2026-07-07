import DocNav from "../DocNav.jsx";

export const metadata = {
  title: "Mentions legales - LoL Team Analyzer",
  description: "Mentions legales, donnees personnelles et avertissement Riot Games.",
};

export default function MentionsLegales() {
  return (
    <div className="wrap">
      <div className="doc">
        <DocNav />

        <h1>
          Mentions <span className="accent">legales</span>
        </h1>
        <p className="lead">
          Informations legales, traitement des donnees et avertissements relatifs a
          LoL Team Analyzer.
        </p>

        <section className="doc-section">
          <h2>Le projet</h2>
          <p>
            LoL Team Analyzer est un projet amateur, gratuit et sans but lucratif, concu
            pour analyser les pools de champions d'une equipe de League of Legends a
            partir de donnees de jeu publiques. Il n'est affilie a aucune des sources de
            donnees citees, ni a Riot Games.
          </p>
        </section>

        <section className="doc-section">
          <h2>Avertissement Riot Games</h2>
          <p>
            LoL Team Analyzer n'est pas approuve par Riot Games et ne reflete pas les
            opinions de Riot Games ni de quiconque participe officiellement a la
            production ou a la gestion des proprietes de Riot Games. Riot Games et toutes
            les proprietes associees sont des marques ou des marques deposees de Riot
            Games, Inc.
          </p>
        </section>

        <section className="doc-section">
          <h2>Donnees personnelles</h2>
          <ul>
            <li>L'application interroge uniquement des <b>donnees de jeu publiques</b> via l'API officielle de Riot Games : identifiants Riot (Pseudo#TAG), parties classees, points de maitrise et rangs.</li>
            <li>Aucun compte n'est requis et aucune donnee de connexion n'est demandee.</li>
            <li>Les parties recuperees sont mises en cache cote serveur pour accelerer les analyses suivantes et respecter les limites de l'API. Il s'agit de donnees de jeu publiques.</li>
            <li>Vos reglages (bouton Parametres) sont enregistres uniquement dans votre navigateur (localStorage) et ne sont jamais transmis a un tiers.</li>
            <li>Aucun traceur publicitaire, aucun profilage, aucune revente de donnees.</li>
          </ul>
        </section>

        <section className="doc-section">
          <h2>Sources de donnees</h2>
          <ul>
            <li><b>Riot Games API</b> et <b>Data Dragon</b> : donnees de jeu, noms et images des champions.</li>
            <li><b>OP.GG</b> : tiers de la meta, winrates, pickrates, counters.</li>
            <li>Liens externes vers <b>Lolalytics</b> (builds) et <b>League of Graphs</b> (fiches joueurs).</li>
          </ul>
        </section>

        <section className="doc-section">
          <h2>Propriete intellectuelle</h2>
          <p>
            League of Legends et Riot Games sont des marques ou des marques deposees de
            Riot Games, Inc. Les noms, images et contenus lies au jeu appartiennent a
            Riot Games et sont utilises ici a des fins d'information, dans le cadre du
            programme pour developpeurs de Riot Games.
          </p>
        </section>

        <section className="doc-section">
          <h2>Responsabilite</h2>
          <p>
            Le service est fourni "tel quel", sans garantie d'exactitude ni de
            disponibilite. Les analyses sont indicatives et ne sauraient engager la
            responsabilite de l'editeur quant aux decisions de jeu prises sur leur base.
          </p>
        </section>
      </div>
    </div>
  );
}
