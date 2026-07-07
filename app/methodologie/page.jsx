import DocNav from "../DocNav.jsx";

export const metadata = {
  title: "Methodologie - LoL Team Analyzer",
  description: "Comment sont calcules la force des champions, les scores de ban, le niveau et les flex.",
};

export default function Methodologie() {
  return (
    <div className="wrap">
      <div className="doc">
        <DocNav />

        <h1>
          Metho<span className="accent">dologie</span>
        </h1>
        <p className="lead">
          Comment LoL Team Analyzer calcule les pools, les champions flex et les
          scores de ban. Tous les nombres ci-dessous sont les valeurs par defaut ;
          ils sont modifiables depuis le bouton Parametres, en haut des resultats.
        </p>

        <section className="doc-section">
          <h2>Les donnees analysees</h2>
          <p>
            L'analyse se base sur trois sources de donnees recuperees via l'API
            officielle de Riot Games :
          </p>
          <ul>
            <li><b>Parties classees de la saison</b> (Solo/Duo et Flex) : champion joue, victoire ou defaite, KDA, role, file et date.</li>
            <li><b>Points de maitrise</b> de chaque joueur sur chaque champion.</li>
            <li><b>Rang actuel</b> : le Solo/Duo est prioritaire, sinon le Flex.</li>
          </ul>
          <p className="muted">
            Les noms et images de champions viennent de Data Dragon (Riot). Les
            informations de meta (tiers, winrates, counters) proviennent d'OP.GG.
            Pour aller vite et rester sous la limite de l'API Riot, chaque partie
            n'est telechargee qu'une fois puis mise en cache.
          </p>
        </section>

        <section className="doc-section">
          <h2>Force d'un champion</h2>
          <p>
            La force est un score entre 0 et 1 qui mesure a quel point un joueur est
            investi et performant sur un champion. C'est la brique de base : le score
            de ban en decoule.
          </p>
          <div className="formula">
            <span className="fx-label">force</span> = confiance x (0.4 x volume + 0.2 x recent + 0.3 x winrate + 0.1 x KDA + maitrise)
          </div>
          <ul>
            <li><b>Confiance</b> = min(parties / 5, 1). En dessous de 5 parties, la force est reduite proportionnellement (5 parties ou plus = confiance pleine). Cela evite de surevaluer un champion joue une ou deux fois.</li>
            <li><b>Volume</b> : part de ce champion sur l'ensemble des parties de la saison. Mesure l'attachement global.</li>
            <li><b>Recent</b> : part sur les 40 dernieres parties. Capte la forme du moment et les one-tricks actuels.</li>
            <li><b>Winrate</b> : taux de victoire sur le champion.</li>
            <li><b>KDA</b> : (kills + assists) / deaths, normalise (un KDA de 5 ou plus vaut le maximum).</li>
            <li><b>Maitrise</b> : +0.05 si le joueur depasse 300 000 points de maitrise sur le champion, sinon 0. Comme cette composante est dans la parenthese, elle est ensuite multipliee par les facteurs du score de ban.</li>
          </ul>
        </section>

        <section className="doc-section">
          <h2>Score de ban</h2>
          <p>
            Pour chaque champion, on part de la force du <b>meilleur joueur de
            l'equipe</b> sur ce champion, puis on applique trois multiplicateurs. Le
            resultat est ramene sur 100 et plafonne a 100.
          </p>
          <div className="formula">
            <span className="fx-label">score</span> = force x flex-en-jeu x meta x niveau x 100 <span className="fx-max">(max 100)</span>
          </div>
          <ul>
            <li><b>Flex en jeu</b> : +0.1 par role jouable du champion dans la meta au-dela du premier (1 role = x1, 2 roles = x1.1, 3 roles = x1.2...). Un champion jouable sur plusieurs postes est plus difficile a esquiver.</li>
            <li><b>Meta</b> : selon le tier OP.GG du champion. OP x1.15, Fort x1.1, Bon x1.05, Moyen x1, Faible x0.9.</li>
            <li><b>Niveau</b> : si le meilleur joueur du champion est au-dessus du niveau moyen de son equipe, +0.1 par cran de division (environ 100 elo) d'ecart, sans plafond. L'idee est de concentrer les bans sur le joueur qui surclasse le plus son equipe. Neutre s'il est dans la moyenne ou en dessous.</li>
          </ul>
          <p className="muted">
            Dans l'application, survolez n'importe quel score de ban pour voir le
            detail chiffre de son calcul.
          </p>
        </section>

        <section className="doc-section">
          <h2>Le niveau (elo)</h2>
          <p>
            Pour comparer les joueurs entre eux, chaque rang est converti en une valeur
            numerique. On additionne la base du tier, la division et les LP.
          </p>
          <table className="doc-table">
            <thead>
              <tr><th>Tier</th><th>Base</th></tr>
            </thead>
            <tbody>
              <tr><td>Fer</td><td className="mono">0</td></tr>
              <tr><td>Bronze</td><td className="mono">400</td></tr>
              <tr><td>Argent</td><td className="mono">800</td></tr>
              <tr><td>Or</td><td className="mono">1200</td></tr>
              <tr><td>Platine</td><td className="mono">1600</td></tr>
              <tr><td>Emeraude</td><td className="mono">2000</td></tr>
              <tr><td>Diamant</td><td className="mono">2400</td></tr>
              <tr><td>Maitre</td><td className="mono">2800</td></tr>
              <tr><td>Grand Maitre</td><td className="mono">3100</td></tr>
              <tr><td>Challenger</td><td className="mono">3400</td></tr>
            </tbody>
          </table>
          <p>
            On ajoute la division (I = +300, II = +200, III = +100, IV = +0) puis les
            LP. Exemple : Emeraude II a 40 LP = 2000 + 200 + 40 = 2240. Le niveau moyen
            de l'equipe est la moyenne de ces valeurs pour les joueurs classes ; il est
            reconverti en rang pour l'affichage en haut des resultats.
          </p>
        </section>

        <section className="doc-section">
          <h2>Champions flex</h2>
          <p>Un champion est considere comme flex d'equipe si :</p>
          <ul>
            <li>au moins <b>2 joueurs</b> le maitrisent (au moins 5 parties OU au moins 80 000 points de maitrise chacun), et</li>
            <li>ces joueurs le jouent sur <b>au moins 2 roles differents</b> d'apres leur historique.</li>
          </ul>
          <p className="muted">
            Un champion joue par deux joueurs mais toujours au meme poste n'est donc pas
            compte comme flex : c'est la flexibilite de postes de l'equipe qui compte.
          </p>
        </section>

        <section className="doc-section">
          <h2>Composition et filtres</h2>
          <p>
            Assigner des roles dans la barre de composition filtre les bans et les flex
            pour ne garder que ce qui colle a la compo choisie. Le calcul des scores ne
            change pas : c'est un filtrage d'affichage. Un role ne peut etre tenu que par
            un seul joueur a la fois.
          </p>
        </section>

        <section className="doc-section">
          <h2>Limites</h2>
          <ul>
            <li>L'analyse repose sur l'historique classe disponible via l'API ; les parties hors classee ou trop anciennes ne sont pas comptees.</li>
            <li>Le score de ban suit le meilleur joueur de l'equipe sur chaque champion : un champion joue par un autre coequipier au bon role peut etre masque par les filtres de composition.</li>
            <li>La meta (tiers, counters) est indicative et evolue a chaque patch.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
