import Link from "next/link";

// Pied de page global (rendu dans le layout, present sur toutes les pages).
// Contient l'avertissement legal Riot Games requis par le programme dev.
export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="foot-links">
        <Link href="/">Accueil</Link>
        <Link href="/methodologie">Methodologie</Link>
        <Link href="/mentions-legales">Mentions legales</Link>
        <a
          href="https://github.com/DadouLeBoss/LoL-Team-Analyzer"
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHub
        </a>
      </div>
      <p className="foot-disclaimer">
        LoL Team Analyzer n'est pas approuve par Riot Games et ne reflete pas les
        opinions de Riot Games ni de quiconque participe officiellement a la
        production ou a la gestion des proprietes de Riot Games. Riot Games et
        toutes les proprietes associees sont des marques ou des marques deposees de
        Riot Games, Inc.
      </p>
    </footer>
  );
}
